import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/src/index.js';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const dirname=path.dirname(fileURLToPath(import.meta.url));
const indexPath=path.resolve(dirname,'../index.html');
const port=Number(process.env.PORT||8080);
const allowedHosts=(process.env.ALLOWED_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
const limit=8*1024*1024;
const storageReady=['R2_ENDPOINT','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY'].every(k=>Boolean(process.env[k]));
const s3=storageReady?new S3Client({region:'auto',endpoint:process.env.R2_ENDPOINT,forcePathStyle:true,
 credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}}):null;
const receiptStore=s3?{
 async put(key,binary,options){await s3.send(new PutObjectCommand({Bucket:process.env.R2_BUCKET,Key:key,Body:Buffer.from(binary),
 ContentType:options?.httpMetadata?.contentType||'application/octet-stream'}))},
 async get(key){const item=await s3.send(new GetObjectCommand({Bucket:process.env.R2_BUCKET,Key:key}));
 return {arrayBuffer:async()=>{const body=await item.Body.transformToByteArray();return body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength)}}},
 async delete(key){await s3.send(new DeleteObjectCommand({Bucket:process.env.R2_BUCKET,Key:key}))}
}:null;
const environment={...process.env,RECEIPT_STORE:receiptStore,REQUIRE_OBJECT_STORAGE:process.env.NODE_ENV==='production'?'true':process.env.REQUIRE_OBJECT_STORAGE};

const server=http.createServer(async(req,res)=>{
  try{
    const host=req.headers.host||'localhost';
    const [hostname]=host.split(':');
    if(allowedHosts.length&&!allowedHosts.includes(hostname.toLowerCase())){res.writeHead(421);res.end('Host no autorizado');return}
    const proxy=process.env.TRUST_PROXY==='true'&&req.headers['x-forwarded-proto']==='https';
    const scheme=proxy||req.socket.encrypted?'https':'http';
    const url=new URL(req.url||'/',scheme+'://'+host);
    const common={'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'DENY','permissions-policy':'camera=(), microphone=(), geolocation=()','cache-control':'no-store'};
    if(url.pathname==='/healthz'){res.writeHead(200,{...common,'content-type':'application/json'});res.end(JSON.stringify({status:'up'}));return}
    if(!url.pathname.startsWith('/api/')){
      if(!['/','/index.html'].includes(url.pathname)||req.method!=='GET'){res.writeHead(404,common);res.end('No encontrado');return}
      const html=await readFile(indexPath);
      const inlineScript=html.toString('utf8').match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
      const scriptHash="'sha256-"+createHash('sha256').update(inlineScript).digest('base64')+"'";

      res.writeHead(200,{...common,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' "${scriptHash}"; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"});
      res.end(html);return
    }
    let size=0,chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>limit){res.writeHead(413,common);res.end('Solicitud demasiado grande');return}chunks.push(chunk)}
    const body=['GET','HEAD'].includes(req.method||'GET')?undefined:Buffer.concat(chunks);
    const headers=new Headers();
    for(const [k,v] of Object.entries(req.headers)){if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(', '):v)}
    const request=new Request(url,{method:req.method,headers,body,duplex:body?'half':undefined});
    const out=await worker.fetch(request,environment);
    const responseHeaders={...common};
    for(const [k,v] of out.headers.entries()){if(!['content-encoding','transfer-encoding','content-length'].includes(k))responseHeaders[k]=v}
    res.writeHead(out.status,responseHeaders);
    const data=Buffer.from(await out.arrayBuffer());res.end(data);
  }catch(err){console.error('API request failure',err?.stack||err);if(!res.headersSent)res.writeHead(500,{'cache-control':'no-store','content-type':'application/json'});res.end(JSON.stringify({error:'Error interno del servidor'}))}
});
server.listen(port,'0.0.0.0',()=>console.log('Restaurantes by Apps Faro escuchando en puerto '+port));