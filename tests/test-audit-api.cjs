const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const mongoose=require('mongoose');
require('@next/env').loadEnvConfig(process.cwd());
const base=process.env.TEST_BASE_URL||'http://localhost:3001';
const marker='secret-'+crypto.randomBytes(12).toString('hex');
const ids=[];let userId;let admin;const login='audit-test-'+crypto.randomBytes(5).toString('hex');
async function call(path,method='GET',body,cookie=admin,extra={}){
 const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const id=r.headers.get('x-audit-event-id');if(id)ids.push(new mongoose.Types.ObjectId(id));
 return {status:r.status,data:r.status===204?null:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],id};
}
(async()=>{
 await mongoose.connect(process.env.MONGO_URI);
 let r=await call('/api/auth/login','POST',{login:(process.env.TEST_ADMIN_LOGIN||process.env.CUISINE_LOGIN),password:(process.env.TEST_ADMIN_PASSWORD||process.env.CUISINE_PASSWORD)},'');assert.equal(r.status,200);admin=r.cookie;
 const event=await mongoose.connection.collection('auditevents').findOne({_id:new mongoose.Types.ObjectId(r.id)});assert.equal(event.actor,(process.env.TEST_ADMIN_LOGIN||process.env.CUISINE_LOGIN));assert.equal(event.result,'success');
 r=await call('/api/users','POST',{login,name:'Audit test',password:marker,role:'serveur'});assert.equal(r.status,201);userId=r.data._id;
 const account=await call('/api/auth/login','POST',{login,password:marker},'');
 assert.equal((await call('/api/audit','GET',undefined,account.cookie)).status,403);
 assert.equal((await call('/api/audit','GET',undefined,'')).status,401);
 for(let i=0;i<5;i++)assert.equal((await call('/api/auth/login?token='+marker,'POST',{login:marker,password:marker},'',{'x-whatsapp-agent-token':marker,'authorization':'Bearer '+marker})).status,401);
 r=await call('/api/orders?secret='+marker,'POST',{secret:marker},'',{'x-whatsapp-agent-token':process.env.WHATSAPP_AGENT_TOKEN});assert.equal(r.status,400);
 const agentEvent=await mongoose.connection.collection('auditevents').findOne({_id:new mongoose.Types.ObjectId(r.id)});assert.equal(agentEvent.actorType,'whatsapp_agent');
 r=await call('/api/orders','POST',{secret:marker},'',{'x-whatsapp-agent-token':marker});assert.equal(r.status,401);
 const unverified=await mongoose.connection.collection('auditevents').findOne({_id:new mongoose.Types.ObjectId(r.id)});assert.equal(unverified.actorType,'unverified_agent');
 const report=await call('/api/audit');assert.equal(report.status,200);assert.ok(report.data.alerts.some(a=>a._id.operation==='POST /api/auth/login'&&a.count>=5));assert.ok(report.data.events.length<=25);
 const filtered=await call('/api/audit?result=denied&actorType=anonymous');assert.ok(filtered.data.events.every(e=>e.result==='denied'&&e.actorType==='anonymous'));
 assert.equal((await call('/api/audit?page=-1')).status,400);
 const stored=await mongoose.connection.collection('auditevents').find({_id:{$in:ids}}).toArray();assert.ok(stored.length>=10);assert.equal(JSON.stringify(stored).includes(marker),false);
 for(const e of stored)assert.deepEqual(Object.keys(e).sort(),['_id','actor','actorType','occurredAt','operation','restaurantId','result','status'].sort());
 const foreignId=new mongoose.Types.ObjectId();ids.push(foreignId);await mongoose.connection.collection('auditevents').insertOne({_id:foreignId,restaurantId:'audit-test-other',actor:'other',actorType:'management',operation:'POST /test',occurredAt:new Date(),status:200,result:'success'});
 const isolated=await call('/api/audit');assert.equal(isolated.data.events.some(e=>e._id===String(foreignId)),false);
 console.log('PASS: auteur authentifié, Agent WhatsApp, accès admin, filtres, alertes, isolation restaurant, absence de secrets et données de requête.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 if(userId)await mongoose.connection.collection('users').deleteOne({_id:new mongoose.Types.ObjectId(userId),login});
 if(ids.length)await mongoose.connection.collection('auditevents').deleteMany({_id:{$in:ids}});
 await mongoose.disconnect();
});
