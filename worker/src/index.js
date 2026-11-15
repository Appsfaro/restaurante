/* Apps Faro · Restaurantes — API segura. No incluir secretos en el repositorio. */
const enc = new TextEncoder();
const DB = 'restaurantes-81aa1';
const BASE = `https://firestore.googleapis.com/v1/projects/${DB}/databases/(default)/documents`;
const ALLOW_ORIGINS = ['https://appsfaro.github.io', 'http://localhost:5173', 'http://localhost:8000', 'http://127.0.0.1:8000'];
let oauthCache;
const E = (status, message) => Object.assign(new Error(message), {status});
const cleanId = (s) => /^[a-z0-9][a-z0-9_-]{2,39}$/.test(s || '');
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const un64 = (s) => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4 - s.length%4)%4)), c => c.charCodeAt(0));
const bytes = (value) => enc.encode(value);
const sha = async (s) => b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof s === 'string' ? bytes(s) : s)));
const json = (data, code=200, origin='') => new Response(JSON.stringify(data), {status:code, headers:{'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', ...(origin?{'access-control-allow-origin':origin, 'vary':'Origin'}:{})}});
const valueEncode = (v) => {
  if(v===null || v===undefined) return {nullValue:null};
  if(Array.isArray(v)) return {arrayValue:{values:v.map(valueEncode)}};
  if(v instanceof Date) return {timestampValue:v.toISOString()};
  if(typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,val])=>[k,valueEncode(val)]))}};
  if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(typeof v==='boolean')return {booleanValue:v};
  return {stringValue:String(v)};
};
const valueDecode = (v) => v?.stringValue ?? (v?.integerValue!==undefined?Number(v.integerValue):v?.doubleValue??v?.booleanValue??(v?.nullValue===null?null:undefined)) ?? (v?.arrayValue? (v.arrayValue.values||[]).map(valueDecode):undefined) ?? (v?.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,w])=>[k,valueDecode(w)])):undefined);
const toDoc = (obj) => ({fields:Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,valueEncode(v)]))});
const fromDoc = (doc) => doc?{...Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,valueDecode(v)])),__updateTime:doc.updateTime}:null;
function creds(env){if(!env.GOOGLE_SERVICE_ACCOUNT)throw E(503,'Falta configurar el acceso privado a Firestore');let v;try{v=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT)}catch{throw E(503,'Credenciales de Firestore mal configuradas')}if(v.project_id!==DB||!v.private_key||!v.client_email)throw E(503,'Credenciales de Firestore inválidas');return v}
async function token(env){
  const c=creds(env);const now=Math.floor(Date.now()/1000);
  if(oauthCache?.expires>now+60 && oauthCache.email===c.client_email)return oauthCache.value;
  const header=b64u(bytes(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const payload=b64u(bytes(JSON.stringify({iss:c.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})));
  const binary=Uint8Array.from(atob(c.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),ch=>ch.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',binary,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=b64u(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,bytes(header+'.'+payload))));
  const resp=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:header+'.'+payload+'.'+signature})});
  if(!resp.ok)throw E(502,'No se pudo autenticar con Firestore');const body=await resp.json();oauthCache={email:c.client_email,value:body.access_token,expires:now+Math.min(Number(body.expires_in)||3600,3600)};return body.access_token;
}
async function fs(env,path,method='GET',body=null,query=''){
  const url=BASE+(path.startsWith(':')?'':'/')+path+query;
  const res=await fetch(url,{method,headers:{authorization:'Bearer '+await token(env),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(res.status===404)return null;
  if(!res.ok){const data=await res.text();if(res.status===409||res.status===412)throw E(409,'El registro ya existe o fue actualizado. Actualiza la página e inténtalo nuevamente.');throw E(502,'Error de Firestore ('+res.status+'): '+data.slice(0,160))}
  return res.status===204?null:res.json();
}
const get = async(env,path) => {const doc=fromDoc(await fs(env,path));return doc?{...doc,id:path.split('/').pop()}:null};
const put = async(env,path,record,precondition='') => {const {__updateTime,id,...data}=record;return fromDoc(await fs(env,path,'PATCH',toDoc(data),precondition))};
const create = (env,path,record) => put(env,path,record,'?currentDocument.exists=false');
const createWrite = (path,record) => ({update:{name:`projects/${DB}/databases/(default)/documents/${path}`,...toDoc(record)},currentDocument:{exists:false}});
const query = async(env,collection,field,value,limit=250) => {
  const structuredQuery={from:[{collectionId:collection}],limit,where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:valueEncode(value)}}};
  const rows=await fs(env,':runQuery','POST',{structuredQuery});return (rows||[]).filter(row=>row.document).map(row=>({...fromDoc(row.document),id:row.document.name.split('/').pop()}));
};
const list = async(env,collection,limit=250) => {const res=await fs(env,collection,'GET',null,'?pageSize='+limit);return (res?.documents||[]).map(d=>({...fromDoc(d),id:d.name.split('/').pop()}))};
async function secretHash(input,salt,pepper){const seed=await crypto.subtle.importKey('raw',bytes(input+'|'+pepper),'PBKDF2',false,['deriveBits']);return b64u(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:un64(salt),iterations:600000,hash:'SHA-256'},seed,256)))}
async function hashPassword(input,env){if(!env.PASSWORD_PEPPER)throw E(503,'Falta secreto de contraseñas');const salt=b64u(crypto.getRandomValues(new Uint8Array(16)));return {salt,hash:await secretHash(input,salt,env.PASSWORD_PEPPER)}}
async function compareHash(input,record,env){if(!record?.hash||!record?.salt)return false;const a=un64(await secretHash(input,record.salt,env.PASSWORD_PEPPER));const b=un64(record.hash);return a.length===b.length&&a.every((n,i)=>n===b[i])}
async function signed(payload,env){if(!env.SESSION_SECRET)throw E(503,'Falta secreto de sesiones');const value=b64u(bytes(JSON.stringify({...payload,exp:Math.floor(Date.now()/1000)+60*60*12})));const key=await crypto.subtle.importKey('raw',bytes(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);return value+'.'+b64u(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes(value))))}
async function authorize(request,env){const raw=request.headers.get('authorization')||'';const t=raw.startsWith('Bearer ')?raw.slice(7):'';const [payload,sig,third]=t.split('.');if(!payload||!sig||third)throw E(401,'Inicia sesión');const key=await crypto.subtle.importKey('raw',bytes(env.SESSION_SECRET||''),{name:'HMAC',hash:'SHA-256'},false,['verify']);const ok=await crypto.subtle.verify('HMAC',key,un64(sig),bytes(payload)).catch(()=>false);if(!ok)throw E(401,'Sesión inválida');const s=JSON.parse(new TextDecoder().decode(un64(payload)));if(s.exp<Math.floor(Date.now()/1000))throw E(401,'La sesión caducó');return s}
function role(session,...allowed){if(!allowed.includes(session.role))throw E(403,'No tienes permiso')}
function safeUser(u){return {role:u.role,name:u.name,restaurantId:u.restaurantId||null,username:u.username||null}}
function userId(slug,username){return slug+'_'+username.toLowerCase().replace(/[^a-z0-9_-]/g,'')}
function clientId(slug,phone){return slug+'_'+phone.replace(/\D/g,'')}
const formatNow = () => {const p=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return {date:`${v.year}-${v.month}-${v.day}`,time:`${v.hour}:${v.minute}`}};
function money(n){return Number.isSafeInteger(n)&&n>=0&&n<=1000000?n:0}
function publicRest(r){return {slug:r.slug,name:r.name,logo:r.logo||'',primary:r.primary||'#18bfa1',bank:r.bank||{},cutoff:r.cutoff||'11:00',shipping:r.shipping||{mode:'free',fixedCents:0,zones:[]},active:r.active!==false,subscriptionUntil:r.subscriptionUntil||'',address:r.address||'',phone:r.phone||''}}
async function readBody(req){const len=Number(req.headers.get('content-length')||0);if(len>750000)throw E(413,'Archivo demasiado grande');const data=await req.text();if(data.length>750000)throw E(413,'Solicitud demasiado grande');try{return JSON.parse(data||'{}')}catch{throw E(400,'Solicitud JSON inválida')}}
async function enforceRate(env,key,success=false){const id=await sha(key),path='attempts/'+id,now=Date.now();const x=await get(env,path);if(!success&&x?.until&&x.until>now)throw E(429,'Demasiados intentos. Vuelve a intentarlo más tarde');const attempts=success?0:(x?.until&&x.until<=now?1:((x?.attempts||0)+1));await put(env,path,{attempts,until:attempts>=5?now+20*60*1000:0,updatedAt:new Date().toISOString()});}
async function checkRestaurant(env,slug,allowExpired=false){if(!cleanId(slug))throw E(400,'Restaurante inválido');const r=await get(env,'restaurantes/'+slug);if(!r)throw E(404,'Restaurante no encontrado');if(!allowExpired&&(r.active===false||!r.subscriptionUntil||r.subscriptionUntil<formatNow().date))throw E(403,'El restaurante no tiene una suscripción activa');return r}
async function route(req,env){
 const url=new URL(req.url),path=url.pathname.replace(/\/+$/,'')||'/',method=req.method;
 if(path==='/api/health')return {status:'ok',firestoreConfigured:!!env.GOOGLE_SERVICE_ACCOUNT,version:'1.0.0'};
 if(method==='POST'&&path==='/api/bootstrap'){
   const b=await readBody(req);if(!env.BOOTSTRAP_TOKEN||b.setupToken!==env.BOOTSTRAP_TOKEN)throw E(403,'Clave de instalación incorrecta');if(await get(env,'admins/root'))throw E(409,'El administrador ya existe');if(!/^[a-zA-Z0-9._-]{4,50}$/.test(b.username||'')||String(b.password||'').length<12)throw E(400,'Usa un usuario válido y contraseña de al menos 12 caracteres');const pw=await hashPassword(b.password,env);await create(env,'admins/root',{username:b.username.toLowerCase(),name:b.name||'Administrador Apps Faro',role:'platform',...pw,createdAt:new Date().toISOString()});return {created:true};
 }
 if(method==='POST'&&path==='/api/login'){
   const b=await readBody(req),u=String(b.username||'').trim().toLowerCase(),pass=String(b.password||'');const slug=String(b.restaurantId||'').toLowerCase();if(!u||!pass||u.length>80)throw E(400,'Completa tus credenciales');const ip=req.headers.get('CF-Connecting-IP')||'unknown';const rateKey='login:'+ip+':'+slug+':'+u;await enforceRate(env,rateKey);let account;
   if(b.role==='platform'){account=await get(env,'admins/root');if(account?.username!==u)account=null}
   else if(b.role==='owner'){if(!cleanId(slug))throw E(400,'Código de restaurante inválido');account=await get(env,'users/'+userId(slug,u));if(account?.role!=='owner')account=null}
   else if(b.role==='customer'){if(!cleanId(slug))throw E(400,'Código de restaurante inválido');account=await get(env,'customers/'+clientId(slug,u));if(account?.role!=='customer')account=null}
   else throw E(400,'Perfil inválido');
   if(!account||!(await compareHash(pass,account,env)))throw E(401,'Credenciales incorrectas');
   if(b.role!=='platform')await checkRestaurant(env,slug,true);
   await enforceRate(env,rateKey,true);const user=safeUser(account);return {token:await signed({role:account.role,restaurantId:account.restaurantId||null,sub:account.role==='platform'?'root':(account.role==='owner'?userId(slug,u):clientId(slug,u))},env),user};
 }
 const customerMatch=path.match(/^\/api\/public\/restaurants\/([a-z0-9_-]+)$/);
 if(method==='GET'&&customerMatch){const r=await checkRestaurant(env,customerMatch[1],true);return publicRest(r)}
 const menusMatch=path.match(/^\/api\/public\/menus\/([a-z0-9_-]+)$/);
 if(method==='GET'&&menusMatch){await checkRestaurant(env,menusMatch[1]);return (await query(env,'menus','restaurantId',menusMatch[1])).filter(m=>m.published).map(m=>({date:m.date,soup:m.soup,options:m.options||[],specials:m.specials||[],published:true}))}
 if(method==='POST'&&path==='/api/register'){
   const b=await readBody(req),slug=String(b.restaurantId||'').toLowerCase(),phone=String(b.phone||'').replace(/\D/g,''),pin=String(b.pin||'');await checkRestaurant(env,slug);if(!/^\d{9,13}$/.test(phone)||!/^[0-9]{6,8}$/.test(pin)||!String(b.name||'').trim()||String(b.name).length>100)throw E(400,'Nombre, teléfono o PIN inválidos');await enforceRate(env,'register:'+(req.headers.get('CF-Connecting-IP')||'unknown'));const id=clientId(slug,phone),pw=await hashPassword(pin,env);const newClient={restaurantId:slug,role:'customer',username:phone,name:String(b.name).trim(),phone,address:String(b.address||'').slice(0,250),...pw,createdAt:new Date().toISOString()};await create(env,'customers/'+id,newClient);return {registered:true};
 }
 const s=await authorize(req,env);
 if(path==='/api/me'&&method==='GET')return {role:s.role,restaurantId:s.restaurantId||null,sub:s.sub};
 if(path==='/api/admin/restaurants'){
  role(s,'platform');if(method==='GET')return (await list(env,'restaurantes')).map(r=>({...publicRest(r),createdAt:r.createdAt}));
  if(method==='POST'){
   const b=await readBody(req),slug=String(b.slug||'').trim().toLowerCase(),owner=String(b.ownerUsername||'').trim().toLowerCase();if(!cleanId(slug)||!/^\w[\w.-]{3,49}$/.test(owner)||String(b.ownerPassword||'').length<12||!String(b.name||'').trim())throw E(400,'Completa nombre, código y credenciales seguras');const doc={slug,name:String(b.name).trim().slice(0,100),active:true,subscriptionUntil:String(b.subscriptionUntil||formatNow().date),cutoff:'11:00',primary:'#18bfa1',shipping:{mode:'free',fixedCents:0,zones:[]},bank:{},createdAt:new Date().toISOString()};const pw=await hashPassword(b.ownerPassword,env);await create(env,'restaurantes/'+slug,doc);await create(env,'users/'+userId(slug,owner),{restaurantId:slug,role:'owner',username:owner,name:'Propietario',...pw,createdAt:doc.createdAt});return publicRest(doc);
  }
 }
 const adminSingle=path.match(/^\/api\/admin\/restaurants\/([a-z0-9_-]+)$/);
 if(adminSingle&&method==='PATCH'){role(s,'platform');const old=await checkRestaurant(env,adminSingle[1],true),b=await readBody(req);const active=typeof b.active==='boolean'?b.active:old.active;const subscriptionUntil=/^\d{4}-\d{2}-\d{2}$/.test(b.subscriptionUntil||'')?b.subscriptionUntil:old.subscriptionUntil;await put(env,'restaurantes/'+adminSingle[1],{...old,active,subscriptionUntil});return {updated:true}}
 if(path==='/api/restaurant'){
  role(s,'owner');const slug=s.restaurantId;const old=await checkRestaurant(env,slug,true);
  if(method==='GET')return publicRest(old);
  if(method==='PATCH'){
   const b=await readBody(req);if(!String(b.name||'').trim())throw E(400,'Escribe el nombre');const mode=b.shipping?.mode||'free';if(!['free','fixed','zones'].includes(mode))throw E(400,'Modalidad de envío inválida');const zones=(b.shipping?.zones||[]).slice(0,30).map(z=>({name:String(z.name||'').slice(0,60),priceCents:money(Number(z.priceCents))})).filter(z=>z.name);if(mode==='zones'&&!zones.length)throw E(400,'Agrega al menos una zona de entrega');const delivery={mode,fixedCents:money(Number(b.shipping?.fixedCents||0)),zones};const bank={bank:String(b.bank?.bank||'').slice(0,100),owner:String(b.bank?.owner||'').slice(0,100),account:String(b.bank?.account||'').slice(0,80),type:String(b.bank?.type||'').slice(0,50)};const cutoff=/^([01]\d|2[0-3]):[0-5]\d$/.test(b.cutoff||'')?b.cutoff:'11:00';const logo=String(b.logo||'');if(logo.length>100000||logo&&!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(logo))throw E(400,'El logo debe ser una imagen pequeña');const next={...old,name:String(b.name).trim().slice(0,100),primary:/^#[0-9a-fA-F]{6}$/.test(b.primary||'')?b.primary:old.primary,logo,bank,cutoff,shipping:delivery,phone:String(b.phone||'').slice(0,40),address:String(b.address||'').slice(0,250)};await put(env,'restaurantes/'+slug,next);return publicRest(next)
  }
 }
 if(path==='/api/menus'){
  role(s,'owner');const slug=s.restaurantId;
  if(method==='GET')return query(env,'menus','restaurantId',slug,250);
  if(method==='PUT'){
   await checkRestaurant(env,slug);const b=await readBody(req);if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date||''))throw E(400,'Fecha inválida');const options=(b.options||[]).slice(0,20).map((o,i)=>({id:'o'+(i+1),name:String(o.name||'').trim().slice(0,100),priceCents:money(Number(o.priceCents))})).filter(o=>o.name&&o.priceCents>0);if(b.published&&!options.length)throw E(400,'Para publicar, incluye al menos un segundo con precio');const doc={restaurantId:slug,date:b.date,soup:String(b.soup||'').slice(0,100),options,published:!!b.published,updatedAt:new Date().toISOString()};await put(env,'menus/'+slug+'_'+b.date,doc);return doc;
  }
 }
 if(path==='/api/customers'&&method==='GET'){role(s,'owner');return (await query(env,'customers','restaurantId',s.restaurantId)).map(c=>({name:c.name,phone:c.phone,address:c.address,createdAt:c.createdAt}))}
 if(path==='/api/orders'&&method==='GET'){
  role(s,'owner','customer');const rows=await query(env,'orders',s.role==='owner'?'restaurantId':'customerId',s.role==='owner'?s.restaurantId:s.sub,300);return rows.map(({__updateTime,...a})=>a).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 }
 if(path==='/api/orders'&&method==='POST'){
  role(s,'customer');const b=await readBody(req),slug=s.restaurantId;const rest=await checkRestaurant(env,slug),m=await get(env,'menus/'+slug+'_'+b.date);if(!rest.bank?.bank||!rest.bank?.account)throw E(409,'El restaurante todavía no ha configurado su cuenta bancaria');if(!m?.published)throw E(409,'El menú ya no está disponible');const now=formatNow();if(b.date<now.date||b.date>new Date(Date.now()+8*86400000).toISOString().slice(0,10)||b.date===now.date&&now.time>=rest.cutoff)throw E(409,'Los pedidos para esa fecha están cerrados');const option=m.options.find(x=>x.id===b.optionId);if(!option)throw E(400,'Selecciona un plato válido');const qty=Number(b.quantity);if(!Number.isInteger(qty)||qty<1||qty>10)throw E(400,'Cantidad inválida');const address=String(b.address||'').trim();if(address.length<12||address.length>250)throw E(400,'Escribe una dirección completa');let shipping=0,zone='';if(rest.shipping.mode==='fixed')shipping=money(rest.shipping.fixedCents);if(rest.shipping.mode==='zones'){zone=String(b.zone||'');const found=rest.shipping.zones.find(z=>z.name===zone);if(!found)throw E(400,'Selecciona una zona de entrega');shipping=money(found.priceCents)}
  const proof=b.proof||{},mime=String(proof.mime||''),raw=String(proof.base64||'');if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(mime)||!raw||raw.length>560000||!/^[a-zA-Z0-9+/]+={0,2}$/.test(raw))throw E(400,'Adjunta un comprobante JPG, PNG, WEBP o PDF menor a 400 KB');const binary=un64(raw);const signatureOk=mime==='application/pdf'?binary[0]===37&&binary[1]===80&&binary[2]===68&&binary[3]===70&&binary[4]===45:mime==='image/png'?binary[0]===137&&binary[1]===80&&binary[2]===78&&binary[3]===71:mime==='image/jpeg'?binary[0]===255&&binary[1]===216&&binary[2]===255:mime==='image/webp'?new TextDecoder().decode(binary.slice(0,4))==='RIFF'&&new TextDecoder().decode(binary.slice(8,12))==='WEBP':false;if(!signatureOk)throw E(400,'El archivo no coincide con su formato');const proofHash=await sha(binary);const person=await get(env,'customers/'+s.sub);if(!person)throw E(401,'Cliente no encontrado');const id=crypto.randomUUID(),timestamp=new Date().toISOString();const receipt={restaurantId:slug,customerId:s.sub,orderId:id,proofHash,mime,base64:raw,name:String(proof.name||'comprobante').slice(0,100),createdAt:timestamp};const order={id,restaurantId:slug,customerId:s.sub,customerName:person.name,phone:person.phone,date:b.date,soup:m.soup,optionId:option.id,optionName:option.name,quantity:qty,foodCents:option.priceCents*qty,shippingCents:shipping,totalCents:option.priceCents*qty+shipping,zone,address,notes:String(b.notes||'').slice(0,300),bankReference:String(b.bankReference||'').slice(0,100),status:'pending',receiptId:proofHash,createdAt:timestamp,updatedAt:timestamp};await fs(env,':commit','POST',{writes:[createWrite('receipts/'+proofHash,receipt),createWrite('orders/'+id,order)]}).catch(error=>{if(error.status===409)throw E(409,'Este comprobante ya se utilizó en otro pedido');throw error});return {id,totalCents:order.totalCents,status:order.status};
 }
 const attachment=path.match(/^\/api\/orders\/([a-f0-9-]{36})\/receipt$/);
 if(attachment&&method==='GET'){role(s,'owner','customer');const o=await get(env,'orders/'+attachment[1]);if(!o||o.restaurantId!==s.restaurantId||s.role==='customer'&&o.customerId!==s.sub)throw E(404,'Pedido no encontrado');const rec=await get(env,'receipts/'+(o.receiptId||o.id));if(!rec)throw E(404,'Comprobante no encontrado');return {mime:rec.mime,base64:rec.base64,name:rec.name,proofHash:rec.proofHash}}
 const statusMatch=path.match(/^\/api\/orders\/([a-f0-9-]{36})\/status$/);
 if(statusMatch&&method==='PATCH'){
  role(s,'owner');const o=await get(env,'orders/'+statusMatch[1]);if(!o||o.restaurantId!==s.restaurantId)throw E(404,'Pedido no encontrado');const b=await readBody(req);const next=String(b.status||'');const allowed={pending:['confirmed','rejected'],confirmed:['preparing','rejected'],preparing:['in_route'],in_route:['delivered'],rejected:[],delivered:[]};if(!(allowed[o.status]||[]).includes(next))throw E(409,'No se permite ese cambio de estado');await put(env,'orders/'+o.id,{...o,status:next,updatedAt:new Date().toISOString(),verifiedBy:next==='confirmed'||next==='rejected'?s.sub:o.verifiedBy||null},'?currentDocument.updateTime='+encodeURIComponent(o.__updateTime));await create(env,'audit/'+crypto.randomUUID(),{orderId:o.id,restaurantId:o.restaurantId,action:next,actor:s.sub,createdAt:new Date().toISOString()});return {id:o.id,status:next};
 }
 throw E(404,'Ruta no encontrada');
}
export default {async fetch(request,env){
 const origin=request.headers.get('origin')||'',allowed=ALLOW_ORIGINS.includes(origin)?origin:'';
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...(allowed?{'access-control-allow-origin':allowed}:{}),'access-control-allow-methods':'GET,POST,PUT,PATCH,OPTIONS','access-control-allow-headers':'Content-Type,Authorization','access-control-max-age':'7200'}});
 try{if(origin&&!allowed)throw E(403,'Origen no permitido');const result=await route(request,env);return json(result,200,allowed)}catch(error){const status=error.status||500;return json({error:status===500?'Error interno del servidor':error.message},status,allowed)}
}};