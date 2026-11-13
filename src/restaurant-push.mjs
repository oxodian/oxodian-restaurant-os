import {tableAccessSql} from './restaurant-access.mjs';

const encoder=new TextEncoder();
const base64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export function pushEndpoint(value){
 try{
  const url=new URL(value);
  const hosts=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'];
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||!hosts.includes(url.hostname)||url.pathname.length<2)return null;
  return url;
 }catch{return null;}
}

export async function wakeRestaurantStaff({db,all,stmt,env},business,table){
 if(!env.RESTAURANT_VAPID_PRIVATE_JWK||!env.RESTAURANT_VAPID_PUBLIC||!env.RESTAURANT_VAPID_CONTACT)return;
 const now=Date.now(),subscriptions=await all(db,`SELECT p.endpoint FROM restaurant_push p JOIN members m ON m.business_id=p.business_id AND m.user_id=p.user_id
  JOIN restaurant_tables t ON t.business_id=p.business_id AND t.id=?
  LEFT JOIN restaurant_staff r ON r.business_id=p.business_id AND r.user_id=p.user_id
  WHERE p.business_id=? AND p.updated_at>? AND EXISTS(SELECT 1 FROM sessions s WHERE s.business_id=p.business_id AND s.user_id=p.user_id AND s.expires_at>?)
  AND (r.role IS NULL OR r.role='manager' OR ${tableAccessSql.replace('r.user_id<>?','r.user_id<>p.user_id')}) LIMIT 50`,table,business,now-30*86400000,now,now);
 if(!subscriptions.length)return;
 const signingKey=await crypto.subtle.importKey('jwk',JSON.parse(env.RESTAURANT_VAPID_PRIVATE_JWK),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const header=base64(encoder.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
 const tokens=new Map();
 await Promise.allSettled(subscriptions.map(async({endpoint})=>{
  const url=pushEndpoint(endpoint);if(!url)return;
  if(!tokens.has(url.origin))tokens.set(url.origin,(async()=>{
   const payload=base64(encoder.encode(JSON.stringify({aud:url.origin,exp:Math.floor(now/1000)+600,sub:env.RESTAURANT_VAPID_CONTACT})));
   const jwt=header+'.'+payload;
   const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signingKey,encoder.encode(jwt));
   return jwt+'.'+base64(new Uint8Array(signature));
  })());
  const token=await tokens.get(url.origin);
  const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{TTL:'90',Topic:'restaurant-activity',Authorization:'vapid t='+token+', k='+env.RESTAURANT_VAPID_PUBLIC}});
  if(response.status===404||response.status===410)await stmt(db,'DELETE FROM restaurant_push WHERE endpoint=? AND business_id=?',endpoint,business).run();
 }));
}
