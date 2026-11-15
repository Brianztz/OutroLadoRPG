// Private account registry for Vestígios. Accounts live in the same fixed
// Durable Object as the permanent room; no account contains a readable password.
// Character identity and table codes stay internal to the original room.
const ROOM_KEY = 'owner:permanent-room-code:v1';
const INSTALL_MARKER = 'owner:fresh-install:v2';
const INSTALL_REGISTRY = 'SYSTEM_MASTER_PROFILE_V2';
const INITIAL_MASTER_ROOM = 'M6C8604FBE737F0724FE5';
// Pre-provisioned master password: only its PBKDF2-SHA256 verifier is deployed.
// Replace username/password using the account settings form after signing in.
const INITIAL_MASTER_SALT = '59e6ee6f9333255c576cc0d53908f630';
const INITIAL_MASTER_PASSWORD_HASH = 'e87276dd5d4f2719b49e1d69070f5a5ccf723ae690b00d0affca4666471f3575';
const LEGACY_INITIAL_MASTER_PASSWORD_HASH = 'f86d915221829bd5da9be5c584f92f93300ecdbc4d487532023ca6e74ceb4241';
const MASTER_ACCOUNT_KEY = 'account:master:v1';
const ACCOUNT_PREFIX = 'account:user:v1:';
const PLAYER_INDEX = 'account:player-index:v1:';
const ROOM_OWNER = 'account:room-owner:v1:';
const MASTER_SIGNUP_LIMIT = 5;
const MASTER_SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const FAILURE_PREFIX = 'account:fail:v1:';
const WORK_FACTOR = 100000;
const encoder = new TextEncoder();

function asUsername(input) {
  return String(input || '').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function validUsername(input) {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(input);
}
function validPassword(input) {
  return typeof input === 'string' && input.length >= 10
    && input.length <= 128 && input.trim().length >= 10;
}
function reply(value, status = 200) {
  return Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
}
function equal(a,b) {
  const aa=encoder.encode(String(a||'')),bb=encoder.encode(String(b||''));
  let diff=aa.length^bb.length;
  for(let i=0;i<Math.max(aa.length,bb.length);i++)diff|=(aa[i]||0)^(bb[i]||0);
  return diff===0;
}
async function sha(text) {
  const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(text));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function hex(bytes) {
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function hashPassword(password,salt) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),
    {name:'PBKDF2'},false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({
    name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(salt.match(/.{2}/g),v=>parseInt(v,16)),iterations:WORK_FACTOR
  },key,256);
  return hex(new Uint8Array(bits));
}
function roomId(code) {
  const value=String(code||'').toUpperCase();
  if(value.length<=37)return 'T2_'+value;
  let h=2166136261;
  for(const letter of value){h^=letter.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
  return 'T2_'+value.slice(0,28)+'_'+h.toString(16).padStart(8,'0');
}
function newTableCode() {
  return 'M'+hex(crypto.getRandomValues(new Uint8Array(10))).toUpperCase();
}
async function accountKey(username) {
  return ACCOUNT_PREFIX+await sha(asUsername(username));
}
async function accountLogin(ctx,username,password) {
  const key=await accountKey(username);
  const attemptsKey=FAILURE_PREFIX+key.slice(ACCOUNT_PREFIX.length);
  const blocked=await ctx.storage.get(attemptsKey);
  if(blocked?.lockedUntil>Date.now())return {error:'too_many_attempts',status:429};
  const item=await ctx.storage.get(key);
  // Always execute the expensive derivation to avoid an account-existence timing oracle.
  const salt=item?.salt||'00000000000000000000000000000000';
  const expected=item?.passwordHash||'0'.repeat(64);
  const calculated=await hashPassword(password,salt);
  const legacySeed=Boolean(item && item.role==='master' &&
    item.username==='mestre' && item.tableCode===INITIAL_MASTER_ROOM &&
    item.salt===INITIAL_MASTER_SALT &&
    equal(item.passwordHash,LEGACY_INITIAL_MASTER_PASSWORD_HASH));
  const verified=Boolean(item) && (equal(expected,calculated) ||
    (legacySeed && equal(calculated,INITIAL_MASTER_PASSWORD_HASH)));
  if(!verified){
    const failures=(blocked?.count||0)+1;
    await ctx.storage.put(attemptsKey,{
      count:failures,lockedUntil:failures>=6?Date.now()+15*60*1000:0
    });
    return {error:'invalid_credentials',status:401};
  }
  let authenticated=item;
  if(legacySeed){
    authenticated={...item,passwordHash:calculated};
    await ctx.storage.put(key,authenticated);
  }
  await ctx.storage.delete(attemptsKey);
  return {item:authenticated};
}

// A brand-new owner registry is provisioned by the deployed Worker, not by an
// unauthenticated first-visitor signup. The already-authorized owner requested
// a complete reset. Old accounts and old room content are deleted once, before
// the new master login becomes available. No recovery token or legacy key is
// needed by the user; an administrator-only Cloudflare binding authorizes cleanup.
export async function initializeFreshMasterRegistry(ctx,env) {
  if(ctx.id?.name!==INSTALL_REGISTRY)return;
  if(await ctx.storage.get(INSTALL_MARKER))return;
  const secret=String(env.MASTER_DATA_TOKEN||'');
  if(secret.length<32 || !env.TABLE_ROOMS)throw Error('master_not_configured');
  const oldRegistry=env.TABLE_ROOMS.getByName('SYSTEM_MASTER_PROFILE_V1');
  const header={'Content-Type':'application/json'};
  const roomInfo=await oldRegistry.fetch(new Request('https://internal.invalid/api/master-room',{
    method:'POST',headers:header,body:JSON.stringify({key:secret})
  }));
  if(!roomInfo.ok)throw Error('cannot_identify_old_room');
  const {tableCode:oldRoomCode}=await roomInfo.json();
  if(!oldRoomCode)throw Error('missing_old_room');
  const roomStub=env.TABLE_ROOMS.getByName(roomId(oldRoomCode));
  const erase=(stub)=>stub.fetch(new Request('https://internal.invalid/api/admin-auth-reset',{
    method:'POST',headers:{'X-OL-Internal-Auth':secret}
  }));
  const roomDeleted=await erase(roomStub);
  if(!roomDeleted.ok)throw Error('cannot_erase_old_room');
  const registryDeleted=await erase(oldRegistry);
  if(!registryDeleted.ok)throw Error('cannot_erase_old_accounts');
  await ctx.storage.deleteAll();
  const newKey=await accountKey('mestre');
  await ctx.storage.put(ROOM_KEY,INITIAL_MASTER_ROOM);
  await ctx.storage.put(newKey,{
    role:'master',username:'mestre',tableCode:INITIAL_MASTER_ROOM,
    salt:INITIAL_MASTER_SALT,passwordHash:INITIAL_MASTER_PASSWORD_HASH,
    createdAt:Date.now()
  });
  await ctx.storage.put(MASTER_ACCOUNT_KEY,newKey);
  await ctx.storage.put(INSTALL_MARKER,{initialized:true,createdAt:Date.now()});
}

export async function handleAccountRequest(request,ctx,env) {
  const internal=new URL(request.url).pathname==='/api/account-internal';
  if(new URL(request.url).pathname!==(internal?'/api/account-internal':'/api/account')) {
    return reply({error:'not_found'},404);
  }
  if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
  if(request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json')
    return reply({error:'json_required'},415);
  const text=await request.text();
  if(text.length>2048)return reply({error:'request_too_large'},413);
  let data;try{data=JSON.parse(text);}catch{return reply({error:'invalid_json'},400);}
  const serverKey=String(env.MASTER_DATA_TOKEN||'');
  if(serverKey.length<32)return reply({error:'master_not_configured'},503);
  if(internal&&!equal(request.headers.get('X-OL-Internal-Auth'),serverKey))
    return reply({error:'forbidden'},403);
  const action=String(data?.action||'');
  const username=asUsername(data?.username);
  const password=data?.password;
  if(!validUsername(username) || (action!=='register-player'&&!validPassword(password))
    || (action==='register-player'&&!validPassword(password)))
    return reply({error:'invalid_account_fields'},400);

  if(action==='register-master'&&!internal){
    // Public signup creates a NEW independent room. Never permit a browser
    // to choose an existing table or inherit another master's account.
    const accountName=await accountKey(username);
    if(await ctx.storage.get(accountName))return reply({error:'username_taken'},409);
    const clientIP=String(request.headers.get('CF-Connecting-IP')||'').slice(0,80);
    const limitKey=clientIP?'account:signup-rate:v1:'+await sha(clientIP):'';
    const limit=limitKey?await ctx.storage.get(limitKey):null;
    if(limit && limit.until>Date.now() && limit.count>=MASTER_SIGNUP_LIMIT)
      return reply({error:'too_many_signups'},429);
    const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash=await hashPassword(password,salt);
    const created=await ctx.storage.transaction(async t=>{
      if(await t.get(accountName))return {error:'username_taken'};
      if(limitKey){
        const recent=await t.get(limitKey);
        if(recent && recent.until>Date.now() && recent.count>=MASTER_SIGNUP_LIMIT)
          return {error:'too_many_signups'};
      }
      let tableCode='',ownerKey='';
      for(let i=0;i<5;i++){
        const proposed=newTableCode();
        const key=ROOM_OWNER+roomId(proposed);
        if(!await t.get(key)){tableCode=proposed;ownerKey=key;break;}
      }
      if(!tableCode)return {error:'room_creation_failed'};
      await t.put(accountName,{
        role:'master',username,salt,passwordHash,
        tableCode,createdAt:Date.now()
      });
      await t.put(ownerKey,accountName);
      if(limitKey){
        const recent=await t.get(limitKey);
        const active=recent && recent.until>Date.now();
        await t.put(limitKey,{
          count:(active?recent.count:0)+1,
          until:active?recent.until:Date.now()+MASTER_SIGNUP_WINDOW_MS
        });
      }
      return {tableCode};
    });
    if(created.error)return reply({error:created.error},
      created.error==='username_taken'?409:created.error==='too_many_signups'?429:503);
    return reply({ok:true,role:'master',tableCode:created.tableCode},201);
  }

  if(action==='change-master-credentials'&&!internal){
    const result=await accountLogin(ctx,username,password);
    if(!result.item)return reply({error:result.error},result.status);
    if(result.item.role!=='master')return reply({error:'master_required'},403);
    const nextUsername=asUsername(data?.newUsername);
    const nextPassword=data?.newPassword;
    if(!validUsername(nextUsername)||!validPassword(nextPassword))
      return reply({error:'invalid_account_fields'},400);
    const oldKey=await accountKey(username),newKey=await accountKey(nextUsername);
    const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash=await hashPassword(nextPassword,salt);
    const updated=await ctx.storage.transaction(async t=>{
      const stored=await t.get(oldKey);
      if(!stored || stored.role!=='master' || !equal(stored.passwordHash,result.item.passwordHash))
        return 'invalid_credentials';
      if(newKey!==oldKey && await t.get(newKey))return 'username_taken';
      await t.delete(oldKey);
      await t.put(newKey,{...stored,username:nextUsername,salt,passwordHash,updatedAt:Date.now()});
      const ownerKey=ROOM_OWNER+roomId(stored.tableCode);
      if(await t.get(ownerKey)===oldKey)await t.put(ownerKey,newKey);
      if(await t.get(MASTER_ACCOUNT_KEY)===oldKey)
        await t.put(MASTER_ACCOUNT_KEY,newKey);
      return 'ok';
    });
    if(updated!=='ok')return reply({error:updated},updated==='username_taken'?409:401);
    return reply({ok:true});
  }

  if(action==='register-player'&&internal){
    const physical=String(data.physicalTable||'');
    const roomOwnerKey=ROOM_OWNER+physical;
    const ownerAccountKey=await ctx.storage.get(roomOwnerKey);
    const ownerAccount=ownerAccountKey?await ctx.storage.get(ownerAccountKey):null;
    const legacyRoom=await ctx.storage.get(ROOM_KEY);
    const room=ownerAccount?.role==='master' && roomId(ownerAccount.tableCode)===physical
      ? ownerAccount.tableCode
      : legacyRoom && roomId(legacyRoom)===physical
        ? legacyRoom : '';
    const code=String(data.code||'').trim().toUpperCase();
    const ownerHash=String(data.ownerHash||'');
    if(!room || !/^[A-Z0-9_-]{1,40}$/.test(code)
        || !/^[a-f0-9]{64}$/.test(ownerHash))
      return reply({error:'invalid_player_binding'},403);
    const key=await accountKey(username);
    const indexKey=PLAYER_INDEX+physical+':'+code;
    const existing=await ctx.storage.get(key);
    if(existing && (existing.role!=='player'||existing.code!==code
        ||existing.tableCode!==room))return reply({error:'username_taken'},409);
    const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash=await hashPassword(password,salt);
    await ctx.storage.transaction(async t=>{
      const oldKey=await t.get(indexKey);
      if(oldKey && oldKey!==key)await t.delete(oldKey);
      await t.put(key,{
        role:'player',username,salt,passwordHash,tableCode:room,
        code,ownerHash,createdAt:existing?.createdAt||Date.now()
      });
      await t.put(indexKey,key);
    });
    return reply({ok:true});
  }

  if(action==='lookup'&&!internal || action==='check'&&internal){
    const result=await accountLogin(ctx,username,password);
    if(!result.item)return reply({error:result.error},result.status);
    const account=result.item;
    if(internal) {
      const expectedRole=String(data.role||'');
      const expectedPhysical=String(data.physicalTable||'');
      const expectedCode=String(data.code||'');
      if(account.role!==expectedRole||roomId(account.tableCode)!==expectedPhysical
          ||(account.role==='player'&&account.code!==expectedCode))
        return reply({error:'invalid_credentials'},401);
      return reply({ok:true,role:account.role,code:account.code||'',
        ownerHash:account.role==='player'?account.ownerHash:''});
    }
    // Only a successful password check can reveal the internal routing fields.
    return reply({ok:true,role:account.role,tableCode:account.tableCode,
      code:account.role==='player'?account.code:''});
  }

  return reply({error:'invalid_action'},400);
}
