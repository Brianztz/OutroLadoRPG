const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const cacheScript = fs.readFileSync(path.join(root, 'public/master-clues-cache.js'), 'utf8');
const master = fs.readFileSync(path.join(root, 'public/mestre-temporada.html'), 'utf8');

function fakeIndexedDB() {
  const data = new Map();
  const db = {
    objectStoreNames: { contains(name) { return name === 'snapshots'; } },
    createObjectStore() { return {}; },
    transaction(store, mode) {
      assert.equal(store, 'snapshots');
      const tx = { oncomplete:null, onabort:null, onerror:null };
      tx.objectStore = () => ({
        get(key) {
          const request = { result:null, onsuccess:null, onerror:null };
          queueMicrotask(() => {
            request.result = data.get(key);
            if (request.onsuccess) request.onsuccess({target:request});
          });
          return request;
        },
        put(record, key) {
          assert.equal(mode, 'readwrite');
          queueMicrotask(() => {
            data.set(key, record);
            if (tx.oncomplete) tx.oncomplete({target:tx});
          });
        }
      });
      return tx;
    }
  };
  return {
    data,
    indexedDB: {
      open(name, version) {
        assert.equal(name, 'outro-lado-master-clues-v1');
        assert.equal(version, 1);
        const request = {result:db, onupgradeneeded:null, onsuccess:null, onerror:null};
        queueMicrotask(() => {
          if (request.onupgradeneeded) request.onupgradeneeded({target:request});
          if (request.onsuccess) request.onsuccess({target:request});
        });
        return request;
      }
    }
  };
}

test('IndexedDB saves large clue albums and recovers them after a simulated reload', async () => {
  const fake = fakeIndexedDB();
  const page = {indexedDB:fake.indexedDB};
  vm.runInNewContext(cacheScript, {window:page});
  const key = 't2_mestre_clues_state_VESTIGIOS';
  const bigJson = JSON.stringify([{id:'clue-1',img:'data:image/webp;base64,'+'A'.repeat(6*1024*1024)}]);
  await page.OLMasterClueCache.write(key,{json:bigJson,pending:true,cloudHash:'',updatedAt:1});
  const found = await page.OLMasterClueCache.read(key);
  assert.equal(found.json, bigJson);
  assert.equal(found.pending, true);
  const secondPage={indexedDB:fake.indexedDB};
  vm.runInNewContext(cacheScript, {window:secondPage});
  assert.equal((await secondPage.OLMasterClueCache.read(key)).json, bigJson);
  await secondPage.OLMasterClueCache.write(key,{json:bigJson,pending:false,cloudHash:'abc',updatedAt:2});
  assert.equal((await page.OLMasterClueCache.read(key)).cloudHash,'abc');
  assert.equal((await page.OLMasterClueCache.read('other_table')),null);
});

test('Cache fails explicitly in browsers without IndexedDB, without silently losing edits', async () => {
  const page={};
  vm.runInNewContext(cacheScript,{window:page});
  await assert.rejects(page.OLMasterClueCache.read('table'),/indexeddb_unavailable/);
  await assert.rejects(page.OLMasterClueCache.write('table',{json:'[]'}),/indexeddb_unavailable/);
});

test('Master no longer tries to put large clue payloads in localStorage or shows blocking warning', () => {
  assert(master.includes('<script src="/master-clues-cache.js?v=1"></script>'));
  assert(master.includes('void cacheMasterClues(masterTableCode, cluesJson, true)'));
  assert(master.includes("await OLMasterClueCache.write(key, {"));
  assert(master.includes("cached = await window.OLMasterClueCache?.read(masterCluesStorageKey(syncingTable))"));
  assert(master.includes('if (cached?.pending) masterCluesCloudDirtyBeforeReady = true'));
  assert(master.includes("if (!pending && existing?.pending && existing.json !== cluesJson) return"));
  assert(master.includes("localStorage.removeItem(key)"));
  assert(master.includes("if (cluesJson.length <= 700000)"));
  assert(!master.includes("localStorage.setItem(masterCluesStorageKey(), cluesJson)"));
  assert(!master.includes('As pistas ficaram grandes demais para a cópia local do navegador'));
  assert(master.includes('CÓPIA LOCAL INDISPONÍVEL — AGUARDE CONFIRMAÇÃO NA NUVEM'));
  assert(master.includes('OLFirebase.saveMasterClues(syncingTable, queuedJson)'));
});

test('Master inline scripts still compile and clue editor remains present', () => {
  const scripts=[...master.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(m=>m[1]).filter(s=>s.trim());
  assert(scripts.length>=1);
  for(const [i,s] of scripts.entries()) assert.doesNotThrow(()=>new vm.Script(s,{filename:'master-'+i}));
  for(const text of ['function saveMasterClueForm()', 'function loadMasterCluePages(', 'function renderMasterClues()', 'function initializeMasterCluesCloudSync()', 'function queueMasterCluesCloudSave(']) {
    assert(master.includes(text),text);
  }
});
