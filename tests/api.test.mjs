import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../worker/src/index.js';

const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const env={
 GOOGLE_SERVICE_ACCOUNT:JSON.stringify({project_id:'restaurantes-81aa1',client_email:'test@example.test',
 private_key:privateKey.export({type:'pkcs8',format:'pem'})}),
 SESSION_SECRET:'test-session-secret-abcdefghijklmnopqrstuvwxyz-12345',
 PASSWORD_PEPPER:'test-password-pepper-abcdefghijklmnopqrstuvwxyz',
 BOOTSTRAP_TOKEN:'bootstrap-token-tests'
};
const docs=new Map();
let count=0;
const root='projects/restaurantes-81aa1/databases/(default)/documents/';
function record(path,value,stamp){
 return {name:root+path,fields:value.fields,updateTime:stamp||new Date(Date.now()+count*1000).toISOString()};
}
function err(status,message){return new Response(JSON.stringify({error:{message}}),{status,headers:{'content-type':'application/json'}})}
function updated(path,data){count++;docs.set(path,record(path,data,new Date(Date.now()+count*1000).toISOString()))}
function restFetch(url,options={}){
 const u=new URL(url),method=options.method||'GET',suffix=decodeURI(u.pathname.split('/documents')[1]||'');
 if(suffix===':runQuery'){
  const req=JSON.parse(options.body),{fieldFilter}=req.structuredQuery.where;
  const col=req.structuredQuery.from[0].collectionId,needle=fieldFilter.value;
  const values=Array.from(docs.entries()).filter(([key,d])=>key.startsWith(col+'/')&&key.split('/').length===2)
    .filter(([key,d])=>JSON.stringify(d.fields[fieldFilter.field.fieldPath])===JSON.stringify(needle))
    .slice(0,req.structuredQuery.limit).map(([_,document])=>({document}));
  return new Response(JSON.stringify(values),{status:200});
 }
 if(suffix===':commit'){
  const writes=JSON.parse(options.body).writes;
  for(const w of writes){
   const key=w.update.name.slice(root.length),current=docs.get(key),pre=w.currentDocument||{};
   if(pre.exists===false&&current)return err(409,'already exists');
   if(pre.updateTime&&(!current||pre.updateTime!==current.updateTime))return err(409,'stale update');
  }
  for(const w of writes){const key=w.update.name.slice(root.length);updated(key,w.update)}
  return new Response(JSON.stringify({writeResults:writes.map(()=>({}))}),{status:200});
 }
 const key=suffix.replace(/^\/+/,''),recordData=docs.get(key);
 if(method==='PATCH'){
  const exists=u.searchParams.get('currentDocument.exists'),previous=u.searchParams.get('currentDocument.updateTime');
  if(exists==='false'&&recordData)return err(409,'already exists');
  if(previous&&(!recordData||previous!==recordData.updateTime))return err(409,'stale');
  const doc=JSON.parse(options.body);updated(key,doc);
  return new Response(JSON.stringify(docs.get(key)),{status:200});
 }
 if(method==='GET'&&recordData)return new Response(JSON.stringify(recordData),{status:200});
 if(method==='GET'&&!recordData){
  const col=key;
  const rows=Array.from(docs.entries()).filter(([p])=>p.startsWith(col+'/')&&p.split('/').length===2)
   .map(([,document])=>document);
  if(rows.length)return new Response(JSON.stringify({documents:rows}),{status:200});
  return err(404,'not found');
 }
 return err(404,'not found');
}
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
 if(String(url).startsWith('https://oauth2.googleapis.com/token'))return new Response(JSON.stringify({access_token:'test-token',expires_in:3600}),{status:200});
 if(String(url).startsWith('https://firestore.googleapis.com/'))return restFetch(url,options);
 throw Error('Unmocked network request: '+url);
};
async function api(path,method='GET',body,token){
 const headers={'origin':'https://appsfaro.github.io',...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})};
 const response=await worker.fetch(new Request('https://api.example.test'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),env);
 const data=await response.json();
 return {status:response.status,data};
}
const dateInDays=(days)=>{
 const d=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Guayaquil'}));d.setDate(d.getDate()+days);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
test('La interfaz tiene JavaScript sintácticamente válido',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const code=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
 assert.ok(code.length>1000);new vm.Script(code);
});
test('Flujo real API: propietario, cliente, reserva, comprobante, validación, devolución, aislamiento',async()=>{
 let r=await api('/api/bootstrap','POST',{setupToken:env.BOOTSTRAP_TOKEN,username:'adminfaro',password:'SuperSegura12345!'});
 assert.equal(r.status,200,JSON.stringify(r.data));
 r=await api('/api/login','POST',{role:'platform',username:'adminfaro',password:'SuperSegura12345!'});
 assert.equal(r.status,200,JSON.stringify(r.data));const admin=r.data.token;
 r=await api('/api/admin/restaurants','POST',{slug:'sabor',name:'El Sabor',ownerUsername:'dueno',ownerPassword:'ClaveSuperSegura123!',subscriptionUntil:dateInDays(7)},admin);
 assert.equal(r.status,200,JSON.stringify(r.data));
 r=await api('/api/login','POST',{role:'owner',restaurantId:'sabor',username:'dueno',password:'ClaveSuperSegura123!'});
 assert.equal(r.status,200,JSON.stringify(r.data));const owner=r.data.token;
 r=await api('/api/restaurant','PATCH',{name:'El Sabor',cutoff:'11:00',bank:{bank:'Banco Ejemplo',owner:'El Sabor SA',account:'123456',type:'Ahorros'},
 shipping:{mode:'zones',zones:[{name:'Centro',priceCents:125}],fixedCents:0}},owner);
 assert.equal(r.status,200,JSON.stringify(r.data));
 const date=dateInDays(1);
 r=await api('/api/menus','PUT',{date,soup:'Locro',published:true,options:[{name:'Pollo',priceCents:350}]},owner);
 assert.equal(r.status,200,JSON.stringify(r.data));
 r=await api('/api/register','POST',{restaurantId:'sabor',phone:'0991234567',pin:'123456',name:'Cliente A',address:'Calle Ecuador 123'});
 assert.equal(r.status,200,JSON.stringify(r.data));
 r=await api('/api/login','POST',{role:'customer',restaurantId:'sabor',username:'0991234567',password:'123456'});
 assert.equal(r.status,200,JSON.stringify(r.data));const customer=r.data.token;
 const input={date,optionId:'o1',quantity:2,address:'Quito Centro Edificio 4',zone:'Centro'};
 r=await api('/api/checkout/quote','POST',input,customer);
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.totalCents,825);
 r=await api('/api/checkout/reservations','POST',input,customer);
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.totalCents,825);
 const id=r.data.id;
 const proof={mime:'application/pdf',name:'banco.pdf',base64:Buffer.from('%PDF-1.7\nprueba bancaria').toString('base64')};
 r=await api('/api/checkout/reservations/'+id+'/submit','POST',{proof,bankReference:'CLIENTE123'},customer);
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.status,'pending');
 r=await api('/api/orders/'+id+'/receipt','GET',undefined,owner);
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.mime,'application/pdf');
 r=await api('/api/checkout/reservations','POST',input,customer);
 const id2=r.data.id;
 r=await api('/api/checkout/reservations/'+id2+'/submit','POST',{proof,bankReference:'CLIENTE123'},customer);
 assert.equal(r.status,409,'Comprobante exacto duplicado debe ser rechazado');
 r=await api('/api/orders/'+id+'/status','PATCH',{status:'confirmed',bankReference:'ABCD123456',receivedCents:800},owner);
 assert.equal(r.status,409,'Importe distinto no puede validarse');
 r=await api('/api/orders/'+id+'/status','PATCH',{status:'confirmed',bankReference:'ABCD123456',receivedCents:825},owner);
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.paymentStatus,'confirmed');
 r=await api('/api/orders/'+id+'/status','PATCH',{status:'refund_pending',reason:'No hay producto'},owner);
 assert.equal(r.status,200,JSON.stringify(r.data));
 r=await api('/api/orders/'+id+'/status','PATCH',{status:'refunded',refundReference:'DEVOLUCION123',refundCents:825},owner);
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.paymentStatus,'refunded');
 r=await api('/api/payment-ledger','GET',undefined,owner);
 assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data[0].status,'refunded');
 r=await api('/api/admin/restaurants','POST',{slug:'otronegocio',name:'Otro Negocio',ownerUsername:'otro',ownerPassword:'SeguraClave_1234!',subscriptionUntil:dateInDays(7)},admin);
 assert.equal(r.status,200,JSON.stringify(r.data));
 r=await api('/api/login','POST',{role:'owner',restaurantId:'otronegocio',username:'otro',password:'SeguraClave_1234!'});
 assert.equal(r.status,200,JSON.stringify(r.data));const other=r.data.token;
 r=await api('/api/orders/'+id+'/receipt','GET',undefined,other);
 assert.equal(r.status,404,'El otro restaurante no puede leer comprobantes');
 r=await api('/api/orders/'+id+'/status','PATCH',{status:'confirmed',bankReference:'OTRA12345',receivedCents:825},other);
 assert.equal(r.status,404,'El otro restaurante no puede modificar pedidos');
});
