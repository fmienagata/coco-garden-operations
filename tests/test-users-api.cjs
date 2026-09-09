const assert=require('node:assert/strict');
const crypto=require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const base=process.env.TEST_BASE_URL || 'http://localhost:3001';
const login='crud-test-'+crypto.randomBytes(5).toString('hex');
const password=crypto.randomBytes(18).toString('base64url');
let id; let admin;
async function call(path,method='GET',body,cookie=admin){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=r.status===204?null:await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function signIn(login,password){return call('/api/auth/login','POST',{login,password},'');}
(async()=>{
 const auth=await signIn(process.env.CUISINE_LOGIN,process.env.CUISINE_PASSWORD);assert.equal(auth.status,200);admin=auth.cookie;
 assert.equal((await call('/api/users','GET',undefined,'')).status,401);
 assert.equal((await call('/api/users','POST',{login,name:'Test',password,role:'unknown'})).status,400);
 const created=await call('/api/users','POST',{login,name:'Test CRUD temporaire',password,role:'serveur'});assert.equal(created.status,201);id=created.data._id;assert.equal(created.data.passwordHash,undefined);
 assert.equal((await call('/api/users','POST',{login,name:'Duplicate',password})).status,409);
 const path='/api/users/'+id;
 assert.equal((await call(path)).data.login,login);
 let account=await signIn(login,password);assert.equal(account.status,200);
 assert.equal((await call('/api/users','GET',undefined,account.cookie)).status,403);
 assert.equal((await call(path,'PATCH',{name:'Forbidden'},account.cookie)).status,403);
 assert.equal((await call(path,'DELETE',undefined,account.cookie)).status,403);
 assert.equal((await call(path,'PATCH',{name:'Test modifié',role:'cuisinier'})).status,200);
 assert.equal((await call('/api/auth/session','GET',undefined,account.cookie)).data.role,'cuisinier');
 assert.equal((await call(path,'PATCH',{active:false})).status,200);
 assert.equal((await signIn(login,password)).status,401);
 assert.equal((await call('/api/orders','GET',undefined,account.cookie)).status,401);
 assert.equal((await call(path,'PATCH',{active:true,password:password+'new'})).status,200);
 assert.equal((await signIn(login,password)).status,401);
 account=await signIn(login,password+'new');assert.equal(account.status,200);
 const self=(await call('/api/users')).data.find(u=>u.login===process.env.CUISINE_LOGIN);
 assert.equal((await call('/api/users/'+self._id,'DELETE')).status,400);
 assert.equal((await call('/api/users/'+self._id,'PATCH',{active:false})).status,400);
 assert.equal((await call(path,'DELETE')).status,204);
 assert.equal((await call(path)).status,404);
 assert.equal((await signIn(login,password+'new')).status,401);
 assert.equal((await call('/api/orders','GET',undefined,account.cookie)).status,401);
 assert.equal((await call('/api/users')).data.some(u=>u._id===id),false);
 console.log('PASS: création, lecture, édition, suppression, validation, droits, protection du compte courant et révocation des sessions.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 if(!id)return;
 const mongoose=require('mongoose');await mongoose.connect(process.env.MONGO_URI);
 await mongoose.connection.collection('users').deleteOne({_id:new mongoose.Types.ObjectId(id),login});await mongoose.disconnect();
});
