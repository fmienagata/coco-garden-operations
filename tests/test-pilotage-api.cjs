// Integration tests create and remove only their own explicitly marked demo fixtures.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
require('@next/env').loadEnvConfig(process.cwd());
const { localDay } = require('../src/lib/pilotage.ts');
(async () => {
 const base = process.env.BASE_URL || 'http://127.0.0.1:3001';
 const restaurantId = process.env.RESTAURANT_ID || 'coco-garden';
 const id = new mongoose.Types.ObjectId(); const foreignId = new mongoose.Types.ObjectId(); const run = crypto.randomUUID();
 try {
  assert.equal((await fetch(base+'/api/pilotage')).status,401);
  assert.equal((await fetch(base+'/api/pilotage/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  const login = await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:process.env.CUISINE_LOGIN||'cuisine',password:process.env.CUISINE_PASSWORD||'cuisine'})});
  assert.equal(login.status,200); const headers = { 'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0] };
  assert.equal((await fetch(base+'/api/pilotage?from=2026-02-30&to=2026-03-01',{headers})).status,400);
  await mongoose.connect(process.env.MONGO_URI);
  const orders = mongoose.connection.db.collection('orders'); const settlements = mongoose.connection.db.collection('settlements');
  const now = new Date();
  await orders.insertMany([id,foreignId].map((_id,i)=>({_id,restaurantId:i?`pilotage-test-${run}`:restaurantId,orderNumber:`TEST-PILOTAGE-${run}-${i}`,fulfillmentType:'takeaway',total:1200,status:'ready',createdAt:now,updatedAt:now,isDemo:true,items:[{name:'Test pilotage',qty:1,price:1200}]})));
  const action = body => fetch(base+'/api/pilotage/actions',{method:'POST',headers,body:JSON.stringify({orderId:String(id),confirmed:true,...body})});
  assert.equal((await action({action:'pay',method:'cash',confirmed:false})).status,400,'confirmation explicite');
  assert.equal((await action({action:'pay',method:'cash',orderId:String(foreignId)})).status,404,'isolation restaurant');
  assert.equal((await action({action:'refund',reason:'Test remboursement'})).status,409,'remboursement avant paiement doit être refusé');
  assert.equal((await action({action:'pay',method:'invalid'})).status,400,'moyen de paiement invalide');
  const concurrent = await Promise.all([action({action:'pay',method:'cash'}),action({action:'pay',method:'cash'})]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409],'paiement concurrent');
  assert.equal((await action({action:'collect'})).status,200,'retrait');
  assert.equal((await action({action:'collect'})).status,409,'retrait répété');
  assert.equal((await action({action:'refund',reason:'Recette du module'})).status,200,'remboursement');
  assert.equal((await action({action:'refund',reason:'Recette du module'})).status,409,'remboursement répété');
  const day=localDay();
  const getReport = async demo => { const r=await fetch(`${base}/api/pilotage?from=${day}&to=${day}&demo=${demo}`,{headers}); assert.equal(r.status,200); return r.json(); };
  const real = await getReport(false); assert.equal(real.rows.some(r=>r._id===String(id)),false);
  const demo = await getReport(true); const row=demo.rows.find(r=>r._id===String(id));
    assert.ok(row); assert.equal(row.status,'completed'); assert.equal(row.settlement.amount,1200); assert.ok(row.settlement.refundedAt); assert.equal(demo.rows.some(r=>r._id===String(foreignId)),false);
  assert.equal((await fetch(base+'/api/orders/delete',{method:'POST',headers,body:JSON.stringify({id:String(id)})})).status,409);
  assert.equal((await fetch(base+'/api/orders/'+id,{method:'DELETE',headers})).status,409);
  assert.equal((await fetch(base+'/api/orders/update',{method:'POST',headers,body:JSON.stringify({id:String(id),patch:{total:1}})})).status,400);
  const kitchen = await (await fetch(base+'/api/orders',{headers})).json(); assert.equal(kitchen.find(r=>r._id===String(id)).status,'completed');
  assert.ok(demo.summary.sales>=1200); assert.ok(demo.summary.refunds>=1200);
  console.log('PASS: authentication, date validation, tenant isolation, demo exclusion, receipt concurrency, pickup, refund, report persistence.');
 } finally {
  if(mongoose.connection.readyState===1){
   await mongoose.connection.db.collection('orders').deleteMany({_id:{$in:[id,foreignId]},orderNumber:{$regex:`^TEST-PILOTAGE-${run}-`}});
   await mongoose.connection.db.collection('settlements').deleteMany({_id:{$in:[`${restaurantId}:${id}`,`pilotage-test-${run}:${foreignId}`]}});
   await mongoose.disconnect();
  }
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
