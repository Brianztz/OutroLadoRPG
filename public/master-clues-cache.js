// Large clue collections (embedded pictures, books and audio) belong in IndexedDB,
// not localStorage, whose per-origin quota is usually only a few megabytes.
// Persist only per-table data here. The Cloudflare Worker remains the shared source.
(function (global) {
  'use strict';
  const DATABASE = 'outro-lado-master-clues-v1';
  const STORE = 'snapshots';
  let opening = null;

  function open() {
    if (opening) return opening;
    if (!global.indexedDB) return Promise.reject(new Error('indexeddb_unavailable'));
    opening = new Promise((resolve, reject) => {
      let request;
      try { request = global.indexedDB.open(DATABASE, 1); }
      catch (error) { reject(error); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('indexeddb_open_failed'));
      request.onblocked = () => reject(new Error('indexeddb_blocked'));
    }).catch(error => { opening = null; throw error; });
    return opening;
  }

  async function read(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('indexeddb_read_failed'));
      transaction.onabort = () => reject(transaction.error || new Error('indexeddb_read_aborted'));
    });
  }

  async function write(key, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(value, key);
      // Only treat a transaction commit as a durable local backup.
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('indexeddb_write_failed'));
      transaction.onabort = () => reject(transaction.error || new Error('indexeddb_write_aborted'));
    });
  }

  global.OLMasterClueCache = Object.freeze({ read, write });
})(window);
