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
            const playerCode = String(localStorage.getItem('player_sync_code') || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
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
        isBootstrapMaster,
        normalizeTableCode,
        onUserChanged,
        preparePortal,
        refreshRealtimeToken,
        signInWithGoogle,
        signOut: signOutUser
    });
})(window);
