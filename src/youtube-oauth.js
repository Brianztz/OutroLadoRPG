/*
 * YouTube Music OAuth backend for Outro Lado RPG.
 *
 * Firebase master ID token is verified by the Worker before calls arrive here.
 * Google refresh tokens never leave this Durable Object. Tokens are encrypted
 * with YOUTUBE_OAUTH_ENCRYPTION_KEY in Durable Object storage (AES-256-GCM).
 */
import { DurableObject } from 'cloudflare:workers';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_DATA = 'https://www.googleapis.com/youtube/v3/';
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const COOKIE_NAME = 'ol_yt_oauth';
const encoder = new TextEncoder();

function json(data, status = 200) {
    return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function textError(message, status = 400) {
    return json({ error: { message } }, status);
}

function urlSafe(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(bytes = 32) {
    const buffer = new Uint8Array(bytes);
    crypto.getRandomValues(buffer);
    return urlSafe(buffer);
}

function cookieValue(request, name) {
    return (request.headers.get('Cookie') || '').split(';').map(x => x.trim())
        .find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
}

function safeTable(raw) {
    return String(raw || 'PADRAO').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9_-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'PADRAO';
}

function oauthConfig(env) {
    return Boolean(
        env.YOUTUBE_OAUTH_CLIENT_ID &&
        env.YOUTUBE_OAUTH_CLIENT_SECRET &&
        typeof env.YOUTUBE_OAUTH_ENCRYPTION_KEY === 'string' &&
        env.YOUTUBE_OAUTH_ENCRYPTION_KEY.length >= 32
    );
}

async function tokenRequest(env, params) {
    const response = await fetch(GOOGLE_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
            client_id: env.YOUTUBE_OAUTH_CLIENT_ID,
            client_secret: env.YOUTUBE_OAUTH_CLIENT_SECRET,
            ...params
        })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const type = String(payload.error || 'oauth_failed');
        const message = type === 'invalid_grant'
            ? 'A autorização do Google foi revogada ou expirou. Vincule a conta novamente.'
            : 'O Google recusou a autorização do YouTube (' + type + ').';
        const error = new Error(message);
        error.oauthCode = type;
        throw error;
    }
    return payload;
}

export class YouTubeGrant extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.ctx = ctx;
        this.env = env;
        this.memoryAccess = null;
        this.refreshInFlight = null;
    }

    async cryptoKey() {
        const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(this.env.YOUTUBE_OAUTH_ENCRYPTION_KEY));
        return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
    }

    async encryptRefresh(uid, refreshToken) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await this.cryptoKey();
        const cipher = await crypto.subtle.encrypt({
            name: 'AES-GCM', iv, additionalData: encoder.encode(uid)
        }, key, encoder.encode(refreshToken));
        return { iv: urlSafe(iv), cipher: urlSafe(new Uint8Array(cipher)) };
    }

    async decryptRefresh(uid, stored) {
        const key = await this.cryptoKey();
        const bytes = value => {
            const padded = String(value).replace(/-/g, '+').replace(/_/g, '/');
            return Uint8Array.from(atob(padded + '='.repeat((4 - padded.length % 4) % 4)), x => x.charCodeAt(0));
        };
        const decrypted = await crypto.subtle.decrypt({
            name: 'AES-GCM', iv: bytes(stored.iv), additionalData: encoder.encode(uid)
        }, key, bytes(stored.cipher));
        return new TextDecoder().decode(decrypted);
    }

    async getAccess(uid) {
        if (this.memoryAccess && this.memoryAccess.expiresAt > Date.now() + 90000) {
            return this.memoryAccess.accessToken;
        }
        if (this.refreshInFlight) return this.refreshInFlight;
        this.refreshInFlight = (async () => {
            const grant = await this.ctx.storage.get('youtube:grant');
            if (!grant || !grant.encrypted) throw Object.assign(
                new Error('Conta do YouTube não vinculada.'), { code: 'not_linked' }
            );
            let refreshToken;
            try { refreshToken = await this.decryptRefresh(uid, grant.encrypted); }
            catch (_) { throw new Error('Falha ao restaurar a autorização. Verifique a chave de criptografia do servidor.'); }
            try {
                const updated = await tokenRequest(this.env, {
                    grant_type: 'refresh_token', refresh_token: refreshToken
                });
                if (updated.refresh_token) {
                    await this.ctx.storage.put('youtube:grant', {
                        encrypted: await this.encryptRefresh(uid, updated.refresh_token),
                        linkedAt: grant.linkedAt
                    });
                }
                this.memoryAccess = {
                    accessToken: String(updated.access_token),
                    expiresAt: Date.now() + Math.max(60, Number(updated.expires_in) || 3600) * 1000
                };
                return this.memoryAccess.accessToken;
            } catch (error) {
                if (error.oauthCode === 'invalid_grant') {
                    this.memoryAccess = null;
                    await this.ctx.storage.delete('youtube:grant');
                    throw Object.assign(error, { code: 'not_linked' });
                }
                throw error;
            }
        })().finally(() => { this.refreshInFlight = null; });
        return this.refreshInFlight;
    }

    async fetch(request) {
        if (!oauthConfig(this.env)) {
            return textError('Configure os secrets YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET e YOUTUBE_OAUTH_ENCRYPTION_KEY no Cloudflare Worker.', 503);
        }
        const url = new URL(request.url);
        const uid = request.headers.get('X-Master-Uid') || '';
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return textError('Identificação de conta inválida.', 401);
        const action = url.pathname;

        if (action === '/begin' && request.method === 'POST') {
            const payload = await request.json().catch(() => ({}));
            const csrf = randomToken();
            const nonce = randomToken();
            const verifier = randomToken(48);
            const challenge = urlSafe(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
            const table = safeTable(payload.mesa);
            await this.ctx.storage.put('youtube:pending', {
                nonce, csrf, verifier, uid, table,
                expiresAt: Date.now() + 10 * 60 * 1000
            });
            const callback = new URL('/api/youtube/oauth/callback', url.origin).href;
            const authUrl = new URL(GOOGLE_AUTH);
            authUrl.search = new URLSearchParams({
                client_id: this.env.YOUTUBE_OAUTH_CLIENT_ID,
                redirect_uri: callback,
                response_type: 'code',
                scope: SCOPE,
                access_type: 'offline',
                prompt: 'consent',
                code_challenge: challenge,
                code_challenge_method: 'S256',
                state: uid + '.' + nonce
            }).toString();
            const response = json({ url: authUrl.href });
            response.headers.set('Set-Cookie', COOKIE_NAME + '=' + csrf +
                '; Max-Age=600; HttpOnly; Secure; SameSite=Lax; Path=/api/youtube/oauth/callback');
            return response;
        }

        if (action === '/complete' && request.method === 'POST') {
            const payload = await request.json().catch(() => ({}));
            const pending = await this.ctx.storage.get('youtube:pending');
            // Consume a pending OAuth request even on failure, to prevent replay.
            await this.ctx.storage.delete('youtube:pending');
            if (!pending || pending.uid !== uid ||
                pending.expiresAt <= Date.now() ||
                payload.state !== uid + '.' + pending.nonce ||
                cookieValue(request, COOKIE_NAME) !== pending.csrf ||
                !pending.csrf) {
                return textError('A autorização do Google não corresponde à sessão iniciada.', 403);
            }
            const table = safeTable(pending.table);
            if (!payload.code || typeof payload.code !== 'string' || payload.code.length > 2048 || payload.error) {
                return json({ ok: false, mesa: table, error: 'cancelled' }, 400);
            }
            try {
                const tokens = await tokenRequest(this.env, {
                    grant_type: 'authorization_code',
                    code: payload.code,
                    redirect_uri: new URL('/api/youtube/oauth/callback', url.origin).href,
                    code_verifier: pending.verifier
                });
                let refreshToken = String(tokens.refresh_token || '');
                if (!refreshToken) {
                    const previous = await this.ctx.storage.get('youtube:grant');
                    if (previous && previous.encrypted) refreshToken = await this.decryptRefresh(uid, previous.encrypted);
                }
                if (!refreshToken) return json({ ok: false, mesa: table, error: 'no_refresh_token' }, 400);
                await this.ctx.storage.put('youtube:grant', {
                    encrypted: await this.encryptRefresh(uid, refreshToken),
                    linkedAt: Date.now()
                });
                this.memoryAccess = {
                    accessToken: String(tokens.access_token || ''),
                    expiresAt: Date.now() + Math.max(60, Number(tokens.expires_in) || 3600) * 1000
                };
                return json({ ok: true, mesa: table });
            } catch (error) {
                return json({ ok: false, mesa: table, error: 'exchange_failed' }, 400);
            }
        }

        if (action === '/status' && request.method === 'GET') {
            const grant = await this.ctx.storage.get('youtube:grant');
            return json({ linked: Boolean(grant && grant.encrypted) });
        }

        if (action === '/unlink' && request.method === 'DELETE') {
            this.memoryAccess = null;
            await this.ctx.storage.delete('youtube:grant');
            return json({ linked: false });
        }

        if (action === '/data' && request.method === 'GET') {
            const resource = url.searchParams.get('resource') || '';
            const allowed = {
                playlists: ['part', 'mine', 'maxResults', 'pageToken'],
                channels: ['part', 'mine', 'maxResults'],
                playlistItems: ['part', 'playlistId', 'maxResults', 'pageToken'],
                search: ['part', 'type', 'videoCategoryId', 'videoEmbeddable', 'maxResults', 'q', 'pageToken']
            };
            if (!Object.hasOwn(allowed, resource)) return textError('Recurso do YouTube não permitido.', 400);
            const params = new URLSearchParams();
            for (const field of allowed[resource]) {
                const value = url.searchParams.get(field);
                if (value !== null) params.set(field, value.slice(0, field === 'q' ? 120 : 200));
            }
            params.set('maxResults', String(Math.max(1, Math.min(50, Number(params.get('maxResults')) || 12))));
            if (resource === 'playlists' || resource === 'channels') params.set('mine', 'true');
            if (resource === 'search') {
                params.set('type', 'video');
                params.set('videoEmbeddable', 'true');
            }
            if (!params.has('part')) params.set('part', 'snippet');
            try {
                const access = await this.getAccess(uid);
                const result = await fetch(GOOGLE_DATA + resource + '?' + params.toString(), {
                    headers: { Authorization: 'Bearer ' + access, Accept: 'application/json' }
                });
                const responseText = await result.text();
                return new Response(responseText, {
                    status: result.status, headers: {
                        'Content-Type': 'application/json; charset=utf-8',
                        'Cache-Control': 'no-store'
                    }
                });
            } catch (error) {
                return textError(String(error.message || 'Não foi possível consultar o YouTube.'), error.code === 'not_linked' ? 401 : 502);
            }
        }
        return textError('Operação não permitida.', 404);
    }
}

export async function youtubeOAuthRoute(request, env, verifyFirebaseIdToken) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    if (method === 'OPTIONS') return new Response(null, { status: 405 });

    if (path === '/api/youtube/oauth/callback') {
        const state = url.searchParams.get('state') || '';
        const stateMatch = /^([A-Za-z0-9_-]{1,128})\.([A-Za-z0-9_-]{20,80})$/.exec(state);
        const cookieClear = COOKIE_NAME + '=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/api/youtube/oauth/callback';
        if (!stateMatch) {
            return new Response('Autorização inválida. Volte à página de compartilhamento.', {
                status: 400, headers: { 'Set-Cookie': cookieClear, 'Cache-Control': 'no-store' }
            });
        }
        const uid = stateMatch[1];
        const stub = env.YOUTUBE_GRANTS.getByName('youtube:' + uid);
        const internal = new Request(new URL('/complete', url.origin), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Master-Uid': uid, Cookie: request.headers.get('Cookie') || '' },
            body: JSON.stringify({
                code: url.searchParams.get('code') || '',
                error: url.searchParams.get('error') || '',
                state
            })
        });
        let result;
        try { result = await stub.fetch(internal); }
        catch (_) { result = textError('Erro de comunicação com o servidor.', 502); }
        const data = await result.json().catch(() => ({}));
        const table = safeTable(data.mesa);
        const page = new URL('/compartilhar.html', url.origin);
        page.searchParams.set('mesa', table);
        page.searchParams.set('youtube', data.ok ? 'linked' : 'error');
        return new Response(null, {
            status: 303, headers: {
                Location: page.toString(),
                'Set-Cookie': cookieClear,
                'Cache-Control': 'no-store',
                'Referrer-Policy': 'no-referrer'
            }
        });
    }

    if (!['/api/youtube/oauth/start', '/api/youtube/status', '/api/youtube/data', '/api/youtube/disconnect'].includes(path)) {
        return textError('Não encontrado.', 404);
    }
    if ((path === '/api/youtube/oauth/start' && method !== 'POST') ||
        (path === '/api/youtube/disconnect' && method !== 'DELETE') ||
        ((path === '/api/youtube/data' || path === '/api/youtube/status') && method !== 'GET')) {
        return textError('Método não permitido.', 405);
    }
    const authorization = request.headers.get('Authorization') || '';
    const jwt = /^Bearer ([A-Za-z0-9_.-]{100,8192})$/.exec(authorization)?.[1] || '';
    if (!jwt) return textError('Entre com o Google para continuar.', 401);
    let user;
    try { user = await verifyFirebaseIdToken(jwt, env.FIREBASE_PROJECT_ID); }
    catch (_) { return textError('Sua sessão Google expirou. Entre novamente.', 401); }
    if (!user.emailVerified || user.email !== String(env.MASTER_EMAIL || '').toLowerCase()) {
        return textError('Somente o mestre pode conectar o YouTube Music.', 403);
    }
    if (!oauthConfig(env)) return textError(
        'O OAuth do YouTube ainda precisa ser configurado pelo administrador (3 secrets do Cloudflare).', 503
    );
    if (method !== 'GET') {
        const origin = request.headers.get('Origin');
        if (origin !== url.origin) return textError('Origem não autorizada.', 403);
    }
    const stub = env.YOUTUBE_GRANTS.getByName('youtube:' + user.uid);
    const operation = path === '/api/youtube/oauth/start' ? '/begin'
        : path === '/api/youtube/disconnect' ? '/unlink'
        : path === '/api/youtube/status' ? '/status' : '/data';
    const internalUrl = new URL(operation, url.origin);
    if (operation === '/data') internalUrl.search = url.search;
    const forward = new Request(internalUrl, {
        method, headers: {
            'Content-Type': 'application/json',
            'X-Master-Uid': user.uid
        },
        ...(method === 'POST' ? { body: JSON.stringify({
            mesa: safeTable((await request.json().catch(() => ({}))).mesa)
        }) } : {})
    });
    const response = await stub.fetch(forward);
    return response;
}
