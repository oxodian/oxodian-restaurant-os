import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pushEndpoint,wakeRestaurantStaff} from '../src/restaurant-push.mjs';

test('push only contacts approved providers and removes expired subscriptions',async()=>{
 for(const endpoint of ['http://fcm.googleapis.com/test','https://fcm.googleapis.com.evil.test/test','https://user@fcm.googleapis.com/test','https://localhost/test'])assert.equal(pushEndpoint(endpoint),null);
 const endpoint='https://fcm.googleapis.com/test';
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const env={RESTAURANT_VAPID_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',pair.privateKey)),RESTAURANT_VAPID_PUBLIC:'test-key',RESTAURANT_VAPID_CONTACT:'mailto:qa@example.test'};
 const calls=[],original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{calls.push([url.href,options]);return new Response(null,{status:410});};
 try{
  const removed=[];
  await wakeRestaurantStaff({db:{},env,all:async()=>[{endpoint}],stmt:(_db,_sql,...args)=>({run:async()=>removed.push(args)})},'business','table');
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],endpoint);
  assert.equal(calls[0][1].redirect,'error');
  assert.match(calls[0][1].headers.Authorization,/^vapid t=[^.]+\.[^.]+\.[^,]+, k=test-key$/);
  assert.equal(calls[0][1].body,undefined);
  assert.deepEqual(removed,[[endpoint,'business']]);
 }finally{globalThis.fetch=original;}
});
