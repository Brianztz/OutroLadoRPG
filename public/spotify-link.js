/* Spotify integration for the master's panel.
 * OAuth 2.0 Authorization Code with PKCE; browser-only, no client secret.
 * Spotify audio is never broadcast/re-streamed to the table.
 */
(() => {
    'use strict';

    if (new URLSearchParams(location.search).get('espectador') === '1') return;

    const $ = id => document.getElementById(id);
    const panel = $('spotify-panel');
    if (!panel) return;

    const CLIENT_KEY = 'ol_spotify_client_id';
    const SESSION_KEY = 'ol_spotify_session';
    const PERSIST_KEY = 'ol_spotify_refresh_v1';
    const PENDING_KEY = 'ol_spotify_pkce_pending';
    const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
    const TOKEN_URL = 'https://accounts.spotify.com/api/token';
    const API_URL = 'https://api.spotify.com/v1';
    const SCOPES = 'user-read-private playlist-read-private playlist-read-collaborative';
    const redirectUri = location.origin + location.pathname;
    let token = null;
    let clientId = '';
    let connectionBusy = false;
    let listRequestId = 0;
    let refreshPromise = null;

    const state = (message, error = false) => {
        $('spotify-state').textContent = message;
        $('spotify-state').classList.toggle('spotify-error', error);
    };

    const safeSessionGet = key => {
        try { return sessionStorage.getItem(key); } catch (_) { return null; }
    };
    const safeSessionSet = (key, value) => {
        try { sessionStorage.setItem(key, value); } catch (_) {
            throw new Error('O navegador precisa permitir armazenamento da sessão para vincular o Spotify.');
        }
    };
    const safeSessionRemove = key => {
        try { sessionStorage.removeItem(key); } catch (_) {}
    };

    // Access tokens remain in the tab's session; only the Spotify refresh
    // token persists across browser restarts, allowing silent restoration.
    function persistRefreshToken(refreshToken) {
        if (!refreshToken) return;
        try {
            localStorage.setItem(PERSIST_KEY, JSON.stringify({ clientId, refreshToken }));
        } catch (_) {
            state('Navegador bloqueou o armazenamento: o vínculo não poderá ser restaurado após fechar.', true);
        }
    }

    function clearRefreshToken() {
        try { localStorage.removeItem(PERSIST_KEY); } catch (_) {}
    }

    try { clientId = (localStorage.getItem(CLIENT_KEY) || '').trim(); } catch (_) {}
    try {
        const saved = JSON.parse(safeSessionGet(SESSION_KEY) || 'null');
        if (saved && saved.clientId === clientId && typeof saved.refreshToken === 'string') {
            token = saved;
        }
    } catch (_) {}
    try {
        const saved = JSON.parse(localStorage.getItem(PERSIST_KEY) || 'null');
        if (saved && saved.clientId === clientId && typeof saved.refreshToken === 'string' &&
            saved.refreshToken && !token) {
            token = { clientId, accessToken: '', refreshToken: saved.refreshToken, expiresAt: 0 };
        }
    } catch (_) {}
    // Migrate previously linked accounts, saved in session storage only.
    if (token && token.refreshToken) persistRefreshToken(token.refreshToken);
    $('spotify-client-id').value = clientId;
    $('spotify-redirect-uri').value = redirectUri;

    function saveToken(payload, retainPreviousRefresh = false) {
        const accessToken = String(payload && payload.access_token || '');
        const refreshToken = String(payload && payload.refresh_token ||
            (retainPreviousRefresh && token && token.refreshToken) || '');
        if (!accessToken) throw new Error('O Spotify não forneceu um token de acesso.');
        token = {
            clientId,
            accessToken,
            refreshToken,
            expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000
        };
        safeSessionSet(SESSION_KEY, JSON.stringify(token));
        if (refreshToken) persistRefreshToken(refreshToken);
        else clearRefreshToken();
    }

    function disconnectSpotify(message = 'Conta desvinculada deste navegador.') {
        token = null;
        listRequestId++;
        safeSessionRemove(SESSION_KEY);
        safeSessionRemove(PENDING_KEY);
        clearRefreshToken();
        $('spotify-account').hidden = true;
        $('spotify-account').textContent = '';
        $('spotify-playlists').hidden = true;
        $('spotify-playlists').textContent = '';
        $('spotify-tracks').hidden = true;
        $('spotify-tracks').textContent = '';
        $('spotify-disconnect').hidden = true;
        $('spotify-connect').textContent = 'Vincular Spotify';
        state(message);
    }

    function renderLinked() {
        $('spotify-setup').hidden = true;
        $('spotify-account').hidden = false;
        $('spotify-disconnect').hidden = false;
        $('spotify-connect').textContent = 'Reconectar Spotify';
    }

    function showSetup() {
        $('spotify-setup').hidden = false;
        $('spotify-redirect-uri').value = redirectUri;
        $('spotify-client-id').focus();
        state('Configure o Client ID do aplicativo Spotify para continuar.');
    }

    function base64url(bytes) {
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function randomString(length = 32) {
        const bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);
        return base64url(bytes);
    }

    async function challengeFor(verifier) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        return base64url(new Uint8Array(hash));
    }

    function validateClientId(value) {
        const clean = String(value || '').trim();
        if (!/^[A-Fa-f0-9]{32}$/.test(clean)) {
            throw new Error('Informe um Client ID válido (32 caracteres) do Spotify Developer Dashboard.');
        }
        return clean;
    }

    async function startLink() {
        if (connectionBusy) return;
        if (!window.isSecureContext || !crypto.subtle) {
            state('O Spotify exige uma página HTTPS segura.', true);
            return;
        }
        try {
            clientId = validateClientId($('spotify-client-id').value || clientId);
        } catch (error) {
            showSetup();
            state(error.message, true);
            return;
        }
        connectionBusy = true;
        $('spotify-connect').disabled = true;
        try {
            localStorage.setItem(CLIENT_KEY, clientId);
            const verifier = randomString(64);
            const stateId = randomString(28);
            const challenge = await challengeFor(verifier);
            safeSessionSet(PENDING_KEY, JSON.stringify({
                clientId, verifier, stateId, redirectUri,
                returnUrl: location.pathname + location.search,
                startedAt: Date.now()
            }));
            const auth = new URL(AUTHORIZE_URL);
            auth.search = new URLSearchParams({
                client_id: clientId,
                response_type: 'code',
                redirect_uri: redirectUri,
                code_challenge_method: 'S256',
                code_challenge: challenge,
                state: stateId,
                scope: SCOPES
            }).toString();
            location.assign(auth.toString());
        } catch (error) {
            state(String(error && error.message || 'Falha ao iniciar autorização.'), true);
        } finally {
            connectionBusy = false;
            $('spotify-connect').disabled = false;
        }
    }

    async function exchangeToken(body) {
        const response = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(String(data.error_description || data.error || 'Falha na autorização do Spotify.'));
        }
        return data;
    }

    async function currentToken() {
        if (!token) throw new Error('Vincule sua conta Spotify para continuar.');
        if (token.accessToken && Date.now() < token.expiresAt - 60000) return token.accessToken;
        if (!token.refreshToken) throw new Error('A sessão do Spotify expirou. Vincule a conta novamente.');
        // Share one refresh request between parallel API calls.
        if (!refreshPromise) {
            refreshPromise = (async () => {
                try {
                    const refreshed = await exchangeToken({
                        grant_type: 'refresh_token',
                        refresh_token: token.refreshToken,
                        client_id: clientId
                    });
                    saveToken(refreshed, true);
                    return token.accessToken;
                } catch (error) {
                    if (/invalid_grant|invalid_client/i.test(String(error && error.message || ''))) {
                        disconnectSpotify('A autorização foi revogada ou expirou. Vincule novamente.');
                    }
                    throw error;
                }
            })().finally(() => { refreshPromise = null; });
        }
        return refreshPromise;
    }

    async function spotifyApi(path) {
        const access = await currentToken();
        const response = await fetch(API_URL + path, {
            headers: { Authorization: 'Bearer ' + access }
        });
        if (response.status === 401) {
            disconnectSpotify('Sessão expirada. Vincule o Spotify novamente.');
            throw new Error('Autorização expirada.');
        }
        if (response.status === 403) {
            throw new Error('Acesso negado pelo Spotify. Verifique o plano Premium do criador do app e a lista de usuários autorizados no Dashboard.');
        }
        if (response.status === 429) {
            throw new Error('Limite temporário de consultas ao Spotify. Tente novamente em alguns minutos.');
        }
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(String(result.error && result.error.message || 'O Spotify não conseguiu responder.'));
        }
        return result;
    }

    function el(tag, className, textContent) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (textContent !== undefined) element.textContent = textContent;
        return element;
    }

    function addSpotifyLink(root, href, label) {
        // Never put OAuth tokens or untrusted URIs into page links.
        if (typeof href !== 'string' || !/^https:\/\/open\.spotify\.com\//i.test(href)) return;
        const link = el('a', 'spotify-open', label);
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        root.appendChild(link);
    }

    async function loadPlaylistTracks(id, name, href) {
        const request = ++listRequestId;
        const target = $('spotify-tracks');
        target.hidden = false;
        target.replaceChildren(el('div', 'music-empty', 'Carregando ' + name + '...'));
        try {
            const safeId = encodeURIComponent(String(id));
            const data = await spotifyApi('/playlists/' + safeId + '/items?limit=50');
            if (request !== listRequestId) return;
            const head = el('div', 'spotify-list-head');
            head.appendChild(el('strong', '', name));
            addSpotifyLink(head, href, 'Abrir playlist no Spotify ↗');
            target.replaceChildren(head);
            const items = Array.isArray(data.items) ? data.items : [];
            let count = 0;
            for (const item of items) {
                const track = item && (item.item || item.track);
                if (!track || track.type !== 'track') continue;
                const row = el('div', 'spotify-track');
                const artist = Array.isArray(track.artists) ? track.artists.map(a => a.name).filter(Boolean).join(', ') : '';
                const info = el('span', '', String(track.name || 'Faixa') + (artist ? ' — ' + artist : ''));
                row.appendChild(info);
                addSpotifyLink(row, track.external_urls && track.external_urls.spotify, 'Ouvir no Spotify ↗');
                target.appendChild(row);
                count++;
            }
            if (!count) target.appendChild(el('div', 'music-empty', 'Nenhuma faixa disponível para exibir.'));
            if (data.next) target.appendChild(el('div', 'spotify-note', 'Exibindo as primeiras 50 faixas. Abra a playlist no Spotify para ver todas.'));
        } catch (error) {
            if (request === listRequestId) {
                target.replaceChildren(el('div', 'music-empty', String(error && error.message || 'Falha ao carregar playlist.')));
            }
        }
    }

    async function loadPlaylists() {
        const request = ++listRequestId;
        const root = $('spotify-playlists');
        root.hidden = false;
        root.replaceChildren(el('div', 'music-empty', 'Carregando suas playlists do Spotify...'));
        try {
            const data = await spotifyApi('/me/playlists?limit=50');
            if (request !== listRequestId) return;
            root.replaceChildren();
            const playlists = Array.isArray(data.items) ? data.items : [];
            if (!playlists.length) {
                root.appendChild(el('div', 'music-empty', 'Nenhuma playlist disponível nesta conta.'));
                return;
            }
            for (const playlist of playlists) {
                if (!playlist || !playlist.id) continue;
                const card = el('button', 'music-playlist-card');
                card.type = 'button';
                card.appendChild(el('strong', '', playlist.name || 'Playlist'));
                const size = playlist.items && playlist.items.total !== undefined
                    ? playlist.items.total
                    : playlist.tracks && playlist.tracks.total;
                card.appendChild(el('span', '', typeof size === 'number' ? size + ' faixas' : 'Ver faixas'));
                card.addEventListener('click', () => loadPlaylistTracks(playlist.id, playlist.name || 'Playlist', playlist.external_urls && playlist.external_urls.spotify));
                root.appendChild(card);
            }
            if (data.next) root.appendChild(el('div', 'spotify-note', 'Exibindo até 50 playlists. Para as demais, use o aplicativo Spotify.'));
        } catch (error) {
            if (request === listRequestId) root.replaceChildren(el('div', 'music-empty', String(error && error.message || 'Falha ao carregar playlists.')));
        }
    }

    async function loadLinkedAccount() {
        const profile = await spotifyApi('/me');
        const name = String(profile.display_name || profile.id || 'Conta Spotify');
        renderLinked();
        $('spotify-account').textContent = 'Conectado como ' + name;
        state('Conta Spotify vinculada');
        await loadPlaylists();
    }

    async function handleCallback() {
        const query = new URLSearchParams(location.search);
        if (!query.has('code') && !query.has('error')) return false;
        const pendingRaw = safeSessionGet(PENDING_KEY);
        let pending = null;
        try { pending = JSON.parse(pendingRaw || 'null'); } catch (_) {}
        // Always remove one-time OAuth data from address bar immediately.
        const destination = pending && typeof pending.returnUrl === 'string'
            && pending.returnUrl.startsWith(location.pathname)
            && !pending.returnUrl.includes('code=')
            ? pending.returnUrl : location.pathname + '?mesa=' + encodeURIComponent(localStorage.getItem('screen_share_table') || 'PADRAO');
        history.replaceState(null, '', destination);
        safeSessionRemove(PENDING_KEY);
        if (!pending || !pending.verifier || !pending.stateId ||
            pending.stateId !== query.get('state') ||
            pending.redirectUri !== redirectUri ||
            Date.now() - Number(pending.startedAt) > 10 * 60 * 1000) {
            state('Autorização do Spotify inválida ou expirada. Tente novamente.', true);
            return true;
        }
        if (query.has('error')) {
            state('Vínculo cancelado ou negado pelo Spotify.', true);
            return true;
        }
        try {
            clientId = validateClientId(pending.clientId);
            localStorage.setItem(CLIENT_KEY, clientId);
            $('spotify-client-id').value = clientId;
            state('Finalizando vínculo com Spotify...');
            const payload = await exchangeToken({
                grant_type: 'authorization_code',
                code: query.get('code'),
                redirect_uri: redirectUri,
                client_id: clientId,
                code_verifier: pending.verifier
            });
            saveToken(payload);
            await loadLinkedAccount();
        } catch (error) {
            disconnectSpotify('Não foi possível concluir o vínculo.');
            state(String(error && error.message || 'Falha no login do Spotify.'), true);
        }
        return true;
    }

    $('spotify-connect').addEventListener('click', () => {
        if (clientId) startLink();
        else showSetup();
    });
    $('spotify-save-id').addEventListener('click', () => startLink());
    $('spotify-disconnect').addEventListener('click', () => disconnectSpotify());
    $('spotify-copy-redirect').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(redirectUri);
            state('URL de redirecionamento copiada.');
        } catch (_) {
            $('spotify-redirect-uri').focus();
            $('spotify-redirect-uri').select();
            state('Copie a URL selecionada.');
        }
    });

    (async () => {
        if (await handleCallback()) return;
        if (token) {
            state('Restaurando vínculo do Spotify...');
            try {
                await loadLinkedAccount();
            } catch (error) {
                state(String(error && error.message || 'Não foi possível restaurar Spotify.'), true);
            }
        }
    })();
})();
