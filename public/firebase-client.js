(function bootstrapOutroLadoFirebase(global) {
    'use strict';

    const FIREBASE_CONFIG = Object.freeze({
        apiKey: 'AIzaSyCcX2C2T3r2LVAXPfzIKMRVdEZVB8eduD8',
        authDomain: 'outro-lado-rpg-bryan.firebaseapp.com',
        projectId: 'outro-lado-rpg-bryan',
        storageBucket: 'outro-lado-rpg-bryan.firebasestorage.app',
        messagingSenderId: '20099388381',
        appId: '1:20099388381:web:d86ba242df36ce77395c34'
    });
    const DATABASE_ID = 'outro-lado-rpg';
    const MASTER_EMAIL = 'bryanferreira2909@gmail.com';
    const TOKEN_KEY = 'ol_firebase_id_token';
    const CHARACTER_CHUNK_SIZE = 180000;
    const CHARACTER_MAX_CHUNKS = 48;
    const guardedPage = /\/(?:ficha|mestre)(?:\.html)?\/?$/i.test(global.location.pathname);
    if (guardedPage) document.documentElement.classList.add('firebase-auth-pending');

    const style = document.createElement('style');
    style.textContent = 'html.firebase-auth-pending body{visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(style);

    const listeners = new Set();
    let currentUser = null;
    let resolveFirstAuth;
    let firstAuthResolved = false;
    const firstAuth = new Promise(resolve => { resolveFirstAuth = resolve; });

    const sdkPromise = Promise.all([
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
    ]).then(([appSdk, authSdk, firestoreSdk]) => {
        const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(FIREBASE_CONFIG);
        const auth = authSdk.getAuth(app);
        const db = firestoreSdk.getFirestore(app, DATABASE_ID);

        authSdk.onAuthStateChanged(auth, async user => {
            currentUser = user || null;
            try {
                if (user) sessionStorage.setItem(TOKEN_KEY, await user.getIdToken());
                else sessionStorage.removeItem(TOKEN_KEY);
            } catch (error) {
                sessionStorage.removeItem(TOKEN_KEY);
            }
            if (!firstAuthResolved) {
                firstAuthResolved = true;
                resolveFirstAuth(currentUser);
            }
            listeners.forEach(listener => {
                try { listener(currentUser); } catch (error) { console.error(error); }
            });
        });

        return { app, auth, db, authSdk, firestoreSdk };
    }).catch(error => {
        if (!firstAuthResolved) {
            firstAuthResolved = true;
            resolveFirstAuth(null);
        }
        throw error;
    });

    function normalizeTableCode(value) {
        const normalized = String(value || 'PADRAO')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40);
        return normalized || 'PADRAO';
    }

    function safeDisplayName(user) {
        return String(user && user.displayName || 'Jogador').trim().slice(0, 80) || 'Jogador';
    }

    function safePhotoURL(user) {
        const value = String(user && user.photoURL || '').trim();
        return /^https:\/\//i.test(value) ? value.slice(0, 2048) : '';
    }

    function isBootstrapMaster(user) {
        return Boolean(user && user.emailVerified && String(user.email || '').toLowerCase() === MASTER_EMAIL);
    }

    async function getCurrentUser() {
        await sdkPromise;
        await firstAuth;
        return currentUser;
    }

    async function refreshRealtimeToken(user = currentUser) {
        if (!user) {
            sessionStorage.removeItem(TOKEN_KEY);
            return '';
        }
        const token = await user.getIdToken(true);
        sessionStorage.setItem(TOKEN_KEY, token);
        return token;
    }

    function normalizePlayerCode(value) {
        return String(value || '')
            .toUpperCase()
            .replace(/[^A-Z0-9_-]/g, '')
            .slice(0, 40);
    }

    function createPlayerCode() {
        const cryptoValues = new Uint32Array(2);
        if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
            global.crypto.getRandomValues(cryptoValues);
            return Array.from(cryptoValues, value => value.toString(36)).join('').slice(0, 8).toUpperCase();
        }
        return Math.random().toString(36).slice(2, 10).toUpperCase();
    }

    function hashCharacterSheet(value) {
        const text = String(value || '');
        let hash = 0x811c9dc5;
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function characterSyncEvent(detail) {
        global.dispatchEvent(new CustomEvent('ol:character-sync', { detail }));
    }

    async function readCharacterSnapshot(snapshot, user, tableId, sdkContext) {
        if (!snapshot.exists()) return null;
        const manifest = snapshot.data() || {};
        let sheetJson = typeof manifest.sheetJson === 'string' ? manifest.sheetJson : '';

        if (!sheetJson && manifest.storageVersion === 2) {
            const chunkCount = Number(manifest.chunkCount);
            if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > CHARACTER_MAX_CHUNKS) {
                throw new Error('A ficha salva na nuvem possui uma quantidade inválida de blocos.');
            }
            const chunkSnapshots = await Promise.all(Array.from({ length: chunkCount }, (_, index) => {
                const chunkId = String(index).padStart(4, '0');
                return sdkContext.firestoreSdk.getDoc(sdkContext.firestoreSdk.doc(
                    sdkContext.db,
                    'tables', tableId,
                    'characters', user.uid,
                    'chunks', chunkId
                ));
            }));
            sheetJson = chunkSnapshots.map((chunkSnapshot, index) => {
                if (!chunkSnapshot.exists()) throw new Error(`O bloco ${index + 1} da ficha não foi encontrado.`);
                const chunkData = chunkSnapshot.data();
                if (chunkData.uid !== user.uid || chunkData.index !== index || typeof chunkData.data !== 'string') {
                    throw new Error(`O bloco ${index + 1} da ficha está inválido.`);
                }
                return chunkData.data;
            }).join('');
            if (Number(manifest.sheetSize) !== sheetJson.length || manifest.sheetHash !== hashCharacterSheet(sheetJson)) {
                throw new Error('A ficha salva na nuvem está incompleta.');
            }
        }

        if (!sheetJson) return null;
        return {
            sheetJson,
            sheetHash: String(manifest.sheetHash || hashCharacterSheet(sheetJson)),
            playerCode: normalizePlayerCode(manifest.playerCode),
            characterName: String(manifest.characterName || ''),
            updatedAt: manifest.updatedAt || null
        };
    }

    async function loadCharacter(requestedTable) {
        const user = await getCurrentUser();
        if (!user) throw new Error('Entre com sua conta Google para carregar a ficha.');
        const sdkContext = await sdkPromise;
        const tableId = normalizeTableCode(requestedTable);
        const reference = sdkContext.firestoreSdk.doc(sdkContext.db, 'tables', tableId, 'characters', user.uid);
        const snapshot = await sdkContext.firestoreSdk.getDoc(reference);
        return readCharacterSnapshot(snapshot, user, tableId, sdkContext);
    }

    async function saveCharacter(requestedTable, sheetData, metadata = {}) {
        const user = await getCurrentUser();
        if (!user) throw new Error('Entre com sua conta Google para salvar a ficha.');
        const sdkContext = await sdkPromise;
        const { db, firestoreSdk } = sdkContext;
        const tableId = normalizeTableCode(requestedTable);
        const sheetJson = typeof sheetData === 'string' ? sheetData : JSON.stringify(sheetData || {});
        const chunks = [];
        for (let offset = 0; offset < sheetJson.length; offset += CHARACTER_CHUNK_SIZE) {
            chunks.push(sheetJson.slice(offset, offset + CHARACTER_CHUNK_SIZE));
        }
        if (!chunks.length) chunks.push('{}');
        if (chunks.length > CHARACTER_MAX_CHUNKS) {
            throw new Error('A ficha ficou grande demais para sincronizar. Remova arquivos de áudio muito grandes e tente novamente.');
        }

        let playerCode = normalizePlayerCode(metadata.playerCode || global.localStorage.getItem('player_sync_code'));
        if (!playerCode) playerCode = createPlayerCode();
        global.localStorage.setItem('player_sync_code', playerCode);
        const characterName = String(metadata.characterName || 'Personagem').trim().slice(0, 120) || 'Personagem';
        const requestedColor = String(metadata.overlayColor || '#8bccf6').trim();
        const overlayColor = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(requestedColor) ? requestedColor : '#8bccf6';
        const sheetHash = hashCharacterSheet(sheetJson);
        const reference = firestoreSdk.doc(db, 'tables', tableId, 'characters', user.uid);
        const currentSnapshot = await firestoreSdk.getDoc(reference);
        const currentData = currentSnapshot.exists() ? currentSnapshot.data() : {};
        if (currentData.sheetHash === sheetHash && currentData.playerCode === playerCode) {
            return { sheetHash, playerCode, skipped: true };
        }

        const previousChunkCount = currentData.storageVersion === 2 && Number.isInteger(currentData.chunkCount)
            ? Math.min(CHARACTER_MAX_CHUNKS, Math.max(0, currentData.chunkCount))
            : 0;
        const now = firestoreSdk.serverTimestamp();
        const batch = firestoreSdk.writeBatch(db);
        batch.set(reference, {
            uid: user.uid,
            ownerUid: user.uid,
            playerCode,
            characterName,
            overlayColor,
            storageVersion: 2,
            chunkCount: chunks.length,
            sheetSize: sheetJson.length,
            sheetHash,
            createdAt: currentSnapshot.exists() && currentData.createdAt ? currentData.createdAt : now,
            updatedAt: now
        });
        chunks.forEach((data, index) => {
            const chunkId = String(index).padStart(4, '0');
            batch.set(firestoreSdk.doc(db, 'tables', tableId, 'characters', user.uid, 'chunks', chunkId), {
                uid: user.uid,
                index,
                data,
                updatedAt: now
            });
        });
        for (let index = chunks.length; index < previousChunkCount; index++) {
            batch.delete(firestoreSdk.doc(
                db,
                'tables', tableId,
                'characters', user.uid,
                'chunks', String(index).padStart(4, '0')
            ));
        }
        await batch.commit();
        characterSyncEvent({ state: 'saved', tableId, sheetHash });
        return { sheetHash, playerCode, skipped: false };
    }

    async function watchCharacter(requestedTable, listener) {
        if (typeof listener !== 'function') throw new Error('Informe uma função para acompanhar a ficha.');
        const user = await getCurrentUser();
        if (!user) throw new Error('Entre com sua conta Google para acompanhar a ficha.');
        const sdkContext = await sdkPromise;
        const tableId = normalizeTableCode(requestedTable);
        const reference = sdkContext.firestoreSdk.doc(sdkContext.db, 'tables', tableId, 'characters', user.uid);
        return sdkContext.firestoreSdk.onSnapshot(reference, snapshot => {
            readCharacterSnapshot(snapshot, user, tableId, sdkContext)
                .then(value => listener(value, null))
                .catch(error => listener(null, error));
        }, error => listener(null, error));
    }

    async function readMasterCluesSnapshot(snapshot, tableId, sdkContext) {
        if (!snapshot.exists()) return null;
        const manifest = snapshot.data() || {};
        if (manifest.contentId !== 'clues' || manifest.storageVersion !== 2) {
            throw new Error('O catálogo de pistas salvo na nuvem está inválido.');
        }
        const chunkCount = Number(manifest.chunkCount);
        if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > CHARACTER_MAX_CHUNKS) {
            throw new Error('O catálogo de pistas possui uma quantidade inválida de blocos.');
        }
        const chunkSnapshots = await Promise.all(Array.from({ length: chunkCount }, (_, index) => {
            const chunkId = String(index).padStart(4, '0');
            return sdkContext.firestoreSdk.getDoc(sdkContext.firestoreSdk.doc(
                sdkContext.db,
                'tables', tableId,
                'masterContent', 'clues',
                'chunks', chunkId
            ));
        }));
        const cluesJson = chunkSnapshots.map((chunkSnapshot, index) => {
            if (!chunkSnapshot.exists()) throw new Error(`O bloco ${index + 1} das pistas não foi encontrado.`);
            const chunkData = chunkSnapshot.data();
            if (chunkData.contentId !== 'clues' || chunkData.index !== index || typeof chunkData.data !== 'string') {
                throw new Error(`O bloco ${index + 1} das pistas está inválido.`);
            }
            return chunkData.data;
        }).join('');
        if (Number(manifest.payloadSize) !== cluesJson.length || manifest.payloadHash !== hashCharacterSheet(cluesJson)) {
            throw new Error('O catálogo de pistas salvo na nuvem está incompleto.');
        }
        return {
            cluesJson,
            cluesHash: manifest.payloadHash,
            updatedAt: manifest.updatedAt || null
        };
    }

    async function loadMasterClues(requestedTable) {
        const user = await getCurrentUser();
        if (!user) throw new Error('Entre com sua conta Google para carregar as pistas do mestre.');
        const sdkContext = await sdkPromise;
        const tableId = normalizeTableCode(requestedTable);
        const reference = sdkContext.firestoreSdk.doc(sdkContext.db, 'tables', tableId, 'masterContent', 'clues');
        const snapshot = await sdkContext.firestoreSdk.getDoc(reference);
        return readMasterCluesSnapshot(snapshot, tableId, sdkContext);
    }

    async function saveMasterClues(requestedTable, cluesData) {
        const user = await getCurrentUser();
        if (!user) throw new Error('Entre com sua conta Google para salvar as pistas do mestre.');
        const sdkContext = await sdkPromise;
        const { db, firestoreSdk } = sdkContext;
        const tableId = normalizeTableCode(requestedTable);
        const cluesJson = typeof cluesData === 'string' ? cluesData : JSON.stringify(Array.isArray(cluesData) ? cluesData : []);
        const chunks = [];
        for (let offset = 0; offset < cluesJson.length; offset += CHARACTER_CHUNK_SIZE) {
            chunks.push(cluesJson.slice(offset, offset + CHARACTER_CHUNK_SIZE));
        }
        if (!chunks.length) chunks.push('[]');
        if (chunks.length > CHARACTER_MAX_CHUNKS) {
            throw new Error('As pistas ficaram grandes demais para sincronizar. Use links para áudios grandes ou imagens menores.');
        }

        const cluesHash = hashCharacterSheet(cluesJson);
        const reference = firestoreSdk.doc(db, 'tables', tableId, 'masterContent', 'clues');
        const currentSnapshot = await firestoreSdk.getDoc(reference);
        const currentData = currentSnapshot.exists() ? currentSnapshot.data() : {};
        if (currentData.payloadHash === cluesHash) return { cluesHash, skipped: true };

        const previousChunkCount = currentData.storageVersion === 2 && Number.isInteger(currentData.chunkCount)
            ? Math.min(CHARACTER_MAX_CHUNKS, Math.max(0, currentData.chunkCount))
            : 0;
        const now = firestoreSdk.serverTimestamp();
        const batch = firestoreSdk.writeBatch(db);
        batch.set(reference, {
            contentId: 'clues',
            storageVersion: 2,
            chunkCount: chunks.length,
            payloadSize: cluesJson.length,
            payloadHash: cluesHash,
            createdAt: currentSnapshot.exists() && currentData.createdAt ? currentData.createdAt : now,
            updatedAt: now
        });
        chunks.forEach((data, index) => {
            const chunkId = String(index).padStart(4, '0');
            batch.set(firestoreSdk.doc(db, 'tables', tableId, 'masterContent', 'clues', 'chunks', chunkId), {
                contentId: 'clues',
                index,
                data,
                updatedAt: now
            });
        });
        for (let index = chunks.length; index < previousChunkCount; index++) {
            batch.delete(firestoreSdk.doc(
                db,
                'tables', tableId,
                'masterContent', 'clues',
                'chunks', String(index).padStart(4, '0')
            ));
        }
        await batch.commit();
        return { cluesHash, skipped: false };
    }

    async function watchMasterClues(requestedTable, listener) {
        if (typeof listener !== 'function') throw new Error('Informe uma função para acompanhar as pistas do mestre.');
        const user = await getCurrentUser();
        if (!user) throw new Error('Entre com sua conta Google para acompanhar as pistas do mestre.');
        const sdkContext = await sdkPromise;
        const tableId = normalizeTableCode(requestedTable);
        const reference = sdkContext.firestoreSdk.doc(sdkContext.db, 'tables', tableId, 'masterContent', 'clues');
        return sdkContext.firestoreSdk.onSnapshot(reference, snapshot => {
            readMasterCluesSnapshot(snapshot, tableId, sdkContext)
                .then(value => listener(value, null))
                .catch(error => listener(null, error));
        }, error => listener(null, error));
    }

    async function ensureUserProfiles(user) {
        const { db, firestoreSdk } = await sdkPromise;
        const { doc, getDoc, serverTimestamp, setDoc } = firestoreSdk;
        const privateRef = doc(db, 'users_private', user.uid);
        const publicRef = doc(db, 'users_public', user.uid);
        const [privateSnapshot, publicSnapshot] = await Promise.all([getDoc(privateRef), getDoc(publicRef)]);
        const now = serverTimestamp();
        const privateData = {
            uid: user.uid,
            email: String(user.email || '').toLowerCase().slice(0, 254),
            updatedAt: now
        };
        const publicData = {
            uid: user.uid,
            displayName: safeDisplayName(user),
            photoURL: safePhotoURL(user),
            updatedAt: now
        };
        if (!privateSnapshot.exists()) privateData.createdAt = now;
        if (!publicSnapshot.exists()) publicData.createdAt = now;
        await Promise.all([
            setDoc(privateRef, privateData, { merge: privateSnapshot.exists() }),
            setDoc(publicRef, publicData, { merge: publicSnapshot.exists() })
        ]);
    }

    async function signInWithGoogle() {
        const { auth, authSdk } = await sdkPromise;
        const provider = new authSdk.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const credential = await authSdk.signInWithPopup(auth, provider);
        await refreshRealtimeToken(credential.user);
        await ensureUserProfiles(credential.user);
        return credential.user;
    }

    async function signOutUser() {
        const { auth, authSdk } = await sdkPromise;
        sessionStorage.removeItem(TOKEN_KEY);
        await authSdk.signOut(auth);
    }

    async function preparePortal(role, requestedTable) {
        const user = await getCurrentUser();
        if (!user) throw new Error('Entre com sua conta Google antes de escolher a mesa.');
        await ensureUserProfiles(user);
        await refreshRealtimeToken(user);

        const { db, firestoreSdk } = await sdkPromise;
        const { doc, getDoc, serverTimestamp, setDoc } = firestoreSdk;
        const tableId = normalizeTableCode(requestedTable);
        const tableRef = doc(db, 'tables', tableId);
        let tableSnapshot = await getDoc(tableRef);
        const now = serverTimestamp();

        if (role === 'master') {
            if (!tableSnapshot.exists()) {
                if (!isBootstrapMaster(user)) {
                    throw new Error('Somente o mestre autorizado pode criar uma mesa nova.');
                }
                await setDoc(tableRef, {
                    tableId,
                    displayName: `Mesa ${tableId}`.slice(0, 80),
                    ownerUid: user.uid,
                    status: 'active',
                    createdAt: now,
                    updatedAt: now
                });
                tableSnapshot = await getDoc(tableRef);
            }

            const memberRef = doc(db, 'tables', tableId, 'members', user.uid);
            const memberSnapshot = await getDoc(memberRef);
            const isOwner = tableSnapshot.data().ownerUid === user.uid;
            const isMasterMember = memberSnapshot.exists() && memberSnapshot.data().role === 'master';
            if (!isOwner && !isMasterMember) throw new Error('Esta conta nao possui acesso de mestre nesta mesa.');
            if (isOwner && !isMasterMember) {
                await setDoc(memberRef, {
                    uid: user.uid,
                    role: 'master',
                    playerCode: '',
                    displayName: safeDisplayName(user),
                    photoURL: safePhotoURL(user),
                    joinedAt: now,
                    updatedAt: now
                });
            }
        } else {
            if (!tableSnapshot.exists() || tableSnapshot.data().status !== 'active') {
                throw new Error('Essa mesa ainda nao existe. Peca ao mestre para entrar nela primeiro.');
            }
            const memberRef = doc(db, 'tables', tableId, 'members', user.uid);
            const memberSnapshot = await getDoc(memberRef);
            let playerCode = normalizePlayerCode(localStorage.getItem('player_sync_code'));
            if (!playerCode && memberSnapshot.exists()) playerCode = normalizePlayerCode(memberSnapshot.data().playerCode);
            if (!playerCode) playerCode = createPlayerCode();
            localStorage.setItem('player_sync_code', playerCode);
            const memberData = {
                uid: user.uid,
                playerCode,
                displayName: safeDisplayName(user),
                photoURL: safePhotoURL(user),
                updatedAt: now
            };
            if (memberSnapshot.exists()) {
                memberData.role = memberSnapshot.data().role;
                memberData.joinedAt = memberSnapshot.data().joinedAt;
                await setDoc(memberRef, memberData);
            } else {
                memberData.role = 'player';
                memberData.joinedAt = now;
                await setDoc(memberRef, memberData);
            }
        }

        return { user, tableId, role };
    }

    function portalURL(tableId, message = '') {
        const url = new URL('./index.html', global.location.href);
        url.search = '';
        url.searchParams.set('mesa', normalizeTableCode(tableId));
        if (message) url.searchParams.set('aviso', message.slice(0, 180));
        return url.href;
    }

    async function guardPage(role) {
        try {
            const user = await getCurrentUser();
            const tableId = normalizeTableCode(new URL(global.location.href).searchParams.get('mesa') || localStorage.getItem(role === 'master' ? 'master_table_code' : 'player_table_code'));
            if (!user) {
                global.location.replace(portalURL(tableId, 'Entre com sua conta Google para continuar.'));
                return false;
            }
            await ensureUserProfiles(user);
            await refreshRealtimeToken(user);
            const { db, firestoreSdk } = await sdkPromise;
            const tableSnapshot = await firestoreSdk.getDoc(firestoreSdk.doc(db, 'tables', tableId));
            const memberSnapshot = await firestoreSdk.getDoc(firestoreSdk.doc(db, 'tables', tableId, 'members', user.uid));
            const allowed = tableSnapshot.exists() && memberSnapshot.exists()
                && (role !== 'master' || tableSnapshot.data().ownerUid === user.uid || memberSnapshot.data().role === 'master');
            if (!allowed) {
                global.location.replace(portalURL(tableId, 'Sua conta nao possui acesso a essa mesa.'));
                return false;
            }
            document.documentElement.classList.remove('firebase-auth-pending');
            return true;
        } catch (error) {
            console.error('Falha ao validar o acesso Firebase:', error);
            const tableId = new URL(global.location.href).searchParams.get('mesa') || 'PADRAO';
            global.location.replace(portalURL(tableId, 'Nao foi possivel validar sua conta. Tente novamente.'));
            return false;
        }
    }

    function onUserChanged(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        getCurrentUser().then(listener).catch(() => listener(null));
        return () => listeners.delete(listener);
    }

    global.OLFirebase = Object.freeze({
        config: FIREBASE_CONFIG,
        databaseId: DATABASE_ID,
        masterEmail: MASTER_EMAIL,
        getCurrentUser,
        guardPage,
        hashCharacterSheet,
        isBootstrapMaster,
        loadCharacter,
        loadMasterClues,
        normalizeTableCode,
        onUserChanged,
        preparePortal,
        refreshRealtimeToken,
        saveCharacter,
        saveMasterClues,
        signInWithGoogle,
        signOut: signOutUser,
        watchCharacter,
        watchMasterClues
    });
})(window);
