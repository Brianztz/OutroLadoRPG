// Private account registry for Vestígios. Accounts live in the same fixed
// Durable Object as the permanent room; no account contains a readable password.
// Character identity and table codes stay internal to the original room.
const ROOM_KEY = 'owner:permanent-room-code:v1';
const PERSONAL_HASH_KEY = 'owner:personal-master-sha256:v1';
const MASTER_ACCOUNT_KEY = 'account:master:v1';
const ACCOUNT_PREFIX = 'account:user:v1:';
const PLAYER_INDEX = 'account:player-index:v1:';
const FAILURE_PREFIX = 'account:fail:v1:';
const WORK_FACTOR = 180000;
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
  if(!item||!equal(expected,calculated)){
    const failures=(blocked?.count||0)+1;
    await ctx.storage.put(attemptsKey,{
      count:failures,lockedUntil:failures>=6?Date.now()+15*60*1000:0
    });
    return {error:'invalid_credentials',status:401};
  }
  await ctx.storage.delete(attemptsKey);
  return {item};
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

  if(action==='reset-master'&&!internal){
    // Only a server-side, Cloudflare-managed one-time recovery secret can
    // invalidate earlier accounts. An anonymous user can NEVER claim a reset
    // just because the previous master no longer has the old personal key.
    const expected=String(env.MASTER_RECOVERY_TOKEN||'');
    const token=String(data?.recoveryToken||'');
    if(expected.length<48 || token.length!==expected.length || !equal(token,expected))
      return reply({error:'invalid_recovery_link'},403);
    const consumedKey='owner:recovery-consumed:'+await sha(token);
    if(await ctx.storage.get(consumedKey))
      return reply({error:'recovery_already_used'},409);
    const room=await ctx.storage.get(ROOM_KEY);
    if(!room)return reply({error:'no_existing_room'},409);
    const accountName=await accountKey(username);
    const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash=await hashPassword(password,salt);
    const reset=await ctx.storage.transaction(async t=>{
      if(await t.get(consumedKey))return false;
      const previous=await t.list({prefix:'account:'});
      // Only access records are deleted. The permanent room, saved character
      // sheets, clues, initiative and monster data live under other keys.
      for(const key of previous.keys())await t.delete(key);
      await t.delete(PERSONAL_HASH_KEY);
      await t.put(accountName,{
        role:'master',username,salt,passwordHash,tableCode:room,createdAt:Date.now()
      });
      await t.put(MASTER_ACCOUNT_KEY,accountName);
      await t.put(consumedKey,{usedAt:Date.now()});
      return true;
    });
    if(!reset)return reply({error:'recovery_already_used'},409);
    let accessRevoked=false;
    try{
      const physical=roomId(room);
      const roomObject=env.TABLE_ROOMS.getByName(physical);
      const revoked=await roomObject.fetch(new Request('https://internal.invalid/api/admin-auth-reset',{
        method:'POST',
        headers:{'X-OL-Internal-Auth':serverKey}
      }));
      accessRevoked=revoked.ok;
    }catch(error){
      console.error('Old room sessions could not be revoked immediately:',error);
    }
    return reply({ok:true,tableCode:room,oldAccessRevoked:accessRevoked});
  }

  if(action==='setup-master'&&!internal){
    const proof=String(data.proofKey||'');
    const room=await ctx.storage.get(ROOM_KEY);
    const stored=await ctx.storage.get(PERSONAL_HASH_KEY);
    const verified=equal(proof,serverKey) ||
      (/^OLM-[A-F0-9]{64}$/.test(proof) && stored && equal(await sha(proof),stored));
    if(!verified)return reply({error:'activation_required'},403);
    if(await ctx.storage.get(MASTER_ACCOUNT_KEY))
      return reply({error:'master_already_registered'},409);
    const key=await accountKey(username);
    if(await ctx.storage.get(key))return reply({error:'username_taken'},409);
    const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
    const passwordHash=await hashPassword(password,salt);
    const result=await ctx.storage.transaction(async t=>{
      if(await t.get(MASTER_ACCOUNT_KEY)||await t.get(key))return false;
      const code=await t.get(ROOM_KEY)||room||newTableCode();
      if(!await t.get(ROOM_KEY))await t.put(ROOM_KEY,code);
      await t.put(key,{role:'master',username,salt,passwordHash,tableCode:code,createdAt:Date.now()});
      await t.put(MASTER_ACCOUNT_KEY,key);
      return code;
    });
    return result?reply({ok:true,tableCode:result}):reply({error:'master_already_registered'},409);
  }

  if(action==='register-player'&&internal){
    const room=await ctx.storage.get(ROOM_KEY);
    const physical=String(data.physicalTable||'');
    const code=String(data.code||'').trim().toUpperCase();
    const ownerHash=String(data.ownerHash||'');
    if(!room || physical!==roomId(room) || !/^[A-Z0-9_-]{1,40}$/.test(code)
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
