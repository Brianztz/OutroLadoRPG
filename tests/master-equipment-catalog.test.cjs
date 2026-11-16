const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root,'public/mestre-temporada.html'),'utf8');
const theme = fs.readFileSync(path.join(root,'public/temporada/master-theme.css'),'utf8');
const start = html.indexOf('        function removeCustomCatalogEntry(id) {');
const end = html.indexOf('        function openCatalogRecipientPopup(item) {',start);
assert(start >= 0 && end > start, 'Funções de catálogo não localizadas');
const code = html.slice(start,end);

function setup({confirm=true,failSave=false}={}) {
    const dom = new JSDOM('<input id="catalog-search"><span id="catalog-count"></span><div id="catalog-grid"></div>');
    const { document } = dom.window;
    const saved = [],sent = [],alerts = [],prompts = [];
    const originals = [
        {id:'catalog-0',catalogKind:'weapons',catalogType:'Corpo a corpo',name:'Machado oficial',
            dmg:'1d8',crit:'×2',atk:1,range:'Curto',skill:'CONFRONTO',weight:2,img:''},
        {id:'catalog-1',catalogKind:'items',catalogType:'Item',name:'Lanterna oficial',
            desc:'Ilumina',weight:1,img:''}
    ];
    const creations = [
        {id:'custom-weapon-1',custom:true,catalogKind:'weapons',catalogType:'Disparo',
            name:'Rifle especial',dmg:'2d10',crit:'×3',atk:1,weight:2,
            range:'Longo',skill:'PONTARIA',ammo:'Longa',capacity:5,img:''},
        {id:'custom-item-2',custom:true,catalogKind:'items',catalogType:'Item',
            name:'Kit de investigação',desc:'Ferramentas úteis',weight:1,img:''}
    ];
    const ctx=vm.createContext({
        document,
        window:{confirm:message=>{prompts.push(message);return confirm;},
            alert:message=>alerts.push(message)},
        customCatalogEntries:creations,
        EXILIO_MASTER_CATALOG:originals,
        masterCatalogFilter:'all',
        saveCustomCatalogEntries(){
            if(failSave)throw new Error('quota');
            saved.push(JSON.stringify(ctx.customCatalogEntries));
        },
        openCatalogRecipientPopup(item){sent.push(item.id);},
        normalizeCatalogText(value){return String(value||'').normalize('NFD')
            .replace(/[\u0300-\u036f]/g,'').toLowerCase();},
        escapeHtml(value){return String(value ?? '').replace(/[&<>"']/g,char=>({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[char]));}
    });
    vm.runInContext(code,ctx);
    const run=(expression)=>vm.runInContext(expression,ctx);
    return {dom,ctx,document,originals,creations,saved,sent,alerts,prompts,run};
}

test('Catálogo apresenta criações primeiro e separa armas e itens oficiais',()=>{
    const h=setup();
    try {
        h.run('renderMasterCatalog()');
        const groups=[...h.document.querySelectorAll('.catalog-group')];
        assert.deepEqual(groups.map(group=>group.dataset.catalogGroup),
            ['custom','weapons','items']);
        assert.equal(h.document.querySelectorAll('.catalog-card').length,4);
        assert.equal(h.document.getElementById('catalog-count').textContent,'4 RESULTADOS');
        assert.equal(h.document.querySelector('.catalog-group[data-catalog-group="custom"] .catalog-card').dataset.catalogId,
            'custom-weapon-1');
        const custom=[...h.document.querySelectorAll('.catalog-card.custom')];
        assert.equal(custom.length,2);
        assert(custom.every(card=>card.querySelector('.catalog-delete-button')));
        assert([...h.document.querySelectorAll('.catalog-card:not(.custom)')].every(
            card=>!card.querySelector('.catalog-delete-button')));
        assert([...h.document.querySelectorAll('.catalog-card')].every(
            card=>card.querySelector('.catalog-send-button')));
        assert(!h.document.querySelector('.catalog-card[role="button"]'),
            'O cartão não deve ter botão dentro de outro botão');
        h.document.querySelector('[data-catalog-id="custom-weapon-1"] .catalog-send-button').click();
        assert.deepEqual(h.sent,['custom-weapon-1']);
        assert.deepEqual(h.originals.map(item=>item.id),['catalog-0','catalog-1']);
    } finally {h.dom.window.close();}
});

test('Exclusão confirmada remove só a criação, persiste e mantém catálogo oficial intacto',()=>{
    const h=setup();
    try {
        h.run('renderMasterCatalog()');
        h.document.querySelector('[data-catalog-id="custom-item-2"] .catalog-delete-button').click();
        assert.equal(h.prompts.length,1);
        assert.match(h.prompts[0],/Kit de investigação/);
        assert.match(h.prompts[0],/não remove cópias já enviadas/);
        assert.equal(h.ctx.customCatalogEntries.length,1);
        assert.equal(h.saved.length,1);
        assert.deepEqual(JSON.parse(h.saved[0]).map(item=>item.id),['custom-weapon-1']);
        assert.equal(h.document.querySelector('[data-catalog-id="custom-item-2"]'),null);
        assert(h.document.querySelector('[data-catalog-id="catalog-0"]'));
        assert(h.document.querySelector('[data-catalog-id="catalog-1"]'));
    } finally {h.dom.window.close();}
});

test('Cancelar a exclusão deixa os dados originais e o catálogo como estavam',()=>{
    const h=setup({confirm:false});
    try {
        h.run('renderMasterCatalog()');
        h.document.querySelector('[data-catalog-id="custom-weapon-1"] .catalog-delete-button').click();
        assert.equal(h.ctx.customCatalogEntries.length,2);
        assert.equal(h.saved.length,0);
        assert(h.document.querySelector('[data-catalog-id="custom-weapon-1"]'));
    } finally {h.dom.window.close();}
});

test('Erro ao persistir exclusão restaura a criação e informa a falha',()=>{
    const h=setup({failSave:true});
    try {
        h.run('renderMasterCatalog()');
        assert.equal(h.run("removeCustomCatalogEntry('custom-weapon-1')"),false);
        assert.equal(h.ctx.customCatalogEntries.length,2);
        assert(h.ctx.customCatalogEntries.some(item=>item.id==='custom-weapon-1'));
        assert.equal(h.alerts.length,1);
    } finally {h.dom.window.close();}
});

test('Filtros armas, itens e personalizados e busca continuam funcionando',()=>{
    const h=setup();
    try {
        h.ctx.masterCatalogFilter='custom';
        h.run('renderMasterCatalog()');
        assert.equal(h.document.querySelectorAll('.catalog-card').length,2);
        assert.equal(h.document.querySelectorAll('.catalog-group').length,1);
        h.ctx.masterCatalogFilter='weapons';
        h.run('renderMasterCatalog()');
        assert.equal(h.document.querySelectorAll('.catalog-card').length,2);
        h.ctx.masterCatalogFilter='items';
        h.run('renderMasterCatalog()');
        assert.equal(h.document.querySelectorAll('.catalog-card').length,2);
        h.ctx.masterCatalogFilter='all';
        h.document.getElementById('catalog-search').value='investiga';
        h.run('renderMasterCatalog()');
        assert.equal(h.document.querySelectorAll('.catalog-card').length,1);
        assert.equal(h.document.querySelector('.catalog-card').dataset.catalogId,'custom-item-2');
        assert(html.includes('data-catalog-filter="custom"'));
    } finally {h.dom.window.close();}
});

test('Cartões compactos usam layout adaptável e botões acessíveis',()=>{
    assert(theme.includes('#master-tab-equipment .catalog-group-grid'));
    assert(theme.includes('minmax(min(100%,228px),1fr)'));
    assert(theme.includes('#master-tab-equipment .catalog-image-wrap'));
    assert(theme.includes('height: 104px;'));
    assert(theme.includes('#master-tab-equipment .catalog-card-actions'));
    assert(theme.includes('#master-tab-equipment .catalog-delete-button'));
    assert(theme.includes('@media(max-width: 420px)'));
    assert(html.includes('master-theme.css?v=exilio-3-escudo-v5'));
});