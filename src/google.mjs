import {HttpError} from './domain.mjs';
const encode=new TextEncoder();
const base64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const random=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
const hash=async value=>base64url(await crypto.subtle.digest('SHA-256',encode.encode(value)));
function decode(value){try{return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/').padEnd(Math.ceil(value.length/4)*4,'=')),c=>c.charCodeAt(0));}catch{throw new HttpError(400,'Invalid Google token');}}
const object=value=>JSON.parse(new TextDecoder().decode(decode(value)));
let keyCache=null;
export async function verifyGoogleToken(token,{clientId,nonce,fetcher=fetch,now=Date.now(),keys=null}){
 if(typeof token!=='string'||token.length>16000)throw new HttpError(400,'Invalid Google token');const parts=token.split('.');if(parts.length!==3)throw new HttpError(400,'Invalid Google token');
 let header,claims;try{header=object(parts[0]);claims=object(parts[1]);}catch{throw new HttpError(400,'Invalid Google token');}
 if(header.alg!=='RS256'||typeof header.kid!=='string')throw new HttpError(400,'Invalid Google signature algorithm');
 if(!keys){if(!keyCache||keyCache.until<now||!keyCache.keys.some(k=>k.kid===header.kid)){const response=await fetcher('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new HttpError(503,'Google verification is temporarily unavailable');keyCache={keys:(await response.json()).keys,until:now+600000};}keys=keyCache.keys;}
 const jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig');if(!jwk)throw new HttpError(400,'Unknown Google signing key');const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),encode.encode(parts[0]+'.'+parts[1])))throw new HttpError(400,'Invalid Google signature');
 if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||claims.aud!==clientId||claims.azp&&claims.azp!==clientId||!Number.isFinite(claims.exp)||claims.exp*1000<=now||!Number.isFinite(claims.iat)||claims.iat*1000>now+60000||claims.nonce!==nonce||claims.email_verified!==true||typeof claims.sub!=='string'||!claims.sub||typeof claims.email!=='string'||claims.email.length>254)throw new HttpError(400,'Google identity could not be verified');
 return claims;
}
function stateCookie(request,value,age=600){return `ros_google_state=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/google/; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
function redirect(url,request,headers=[]){const h=new Headers({Location:url,'Cache-Control':'no-store'});for(const [k,v]of headers)h.append(k,v);return new Response(null,{status:302,headers:h});}
export async function googleRoute(request,env,{session,issueSession}){
 const url=new URL(request.url),db=env.DB,callback=url.origin+'/api/auth/google/callback';const configured=!!env.GOOGLE_CLIENT_ID&&!!env.GOOGLE_CLIENT_SECRET;
 if(url.pathname==='/api/auth/providers')return Response.json({google:configured},{headers:{'Cache-Control':'no-store'}});
 if(!configured)throw new HttpError(503,'Google sign-in is awaiting account configuration. Use email and password for now.');
 if(url.pathname==='/api/auth/google/start'){
  const link=url.searchParams.get('link')==='1'?await session(request,db):null;const state=random(),verifier=random(),nonce=random(),language=['en','bn','hi'].includes(url.searchParams.get('language'))?url.searchParams.get('language'):'en';
  await db.batch([db.prepare('DELETE FROM oauth_states WHERE expires_at<?').bind(Date.now()),db.prepare('INSERT INTO oauth_states(state_hash,verifier,nonce,link_user_id,language,expires_at,restaurant_invite) VALUES(?,?,?,?,?,?,?)').bind(await hash(state),verifier,nonce,link?.user_id||null,language,Date.now()+600000,url.searchParams.get('invite')?.slice(0,36)||null)]);
  const destination=new URL('https://accounts.google.com/o/oauth2/v2/auth');for(const [k,v]of Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:callback,response_type:'code',scope:'openid email profile',state,nonce,code_challenge:await hash(verifier),code_challenge_method:'S256',prompt:'select_account'}))destination.searchParams.set(k,v);
  return redirect(destination.href,request,[['Set-Cookie',stateCookie(request,state)]]);
 }
 if(url.pathname==='/api/auth/google/callback'){
  try{
   const state=url.searchParams.get('state'),browserState=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)ros_google_state=([^;]+)/)?.[1];if(!state||state!==browserState)throw new HttpError(400,'Google login expired. Please try again.');
   const saved=await db.prepare('DELETE FROM oauth_states WHERE state_hash=? AND expires_at>? RETURNING *').bind(await hash(state),Date.now()).first();if(!saved)throw new HttpError(400,'Google login expired. Please try again.');
   if(url.searchParams.has('error'))throw new HttpError(400,'Google sign-in was cancelled');const code=url.searchParams.get('code');if(!code)throw new HttpError(400,'Missing Google authorization');
   const exchange=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:callback,grant_type:'authorization_code',code_verifier:saved.verifier}),signal:AbortSignal.timeout(10000)});if(!exchange.ok)throw new HttpError(400,'Google login could not be completed');
   const token=await exchange.json(),claims=await verifyGoogleToken(token.id_token,{clientId:env.GOOGLE_CLIENT_ID,nonce:saved.nonce});
   let identity=await db.prepare("SELECT user_id FROM identities WHERE provider='google' AND subject=?").bind(claims.sub).first();
   if(saved.link_user_id){const current=await session(request,db);if(current.user_id!==saved.link_user_id)throw new HttpError(403,'Sign in to your original account before linking Google');if(identity&&identity.user_id!==current.user_id)throw new HttpError(409,'This Google account is already connected to another workspace');if(!identity)await db.prepare("INSERT INTO identities(provider,subject,user_id) VALUES('google',?,?)").bind(claims.sub,current.user_id).run();return redirect('/#settings',request,[['Set-Cookie',stateCookie(request,'',0)]]);}
   if(saved.restaurant_invite){
    const email=claims.email.toLowerCase();
    const invitation=await db.prepare("SELECT r.* FROM restaurant_staff r JOIN businesses b ON b.id=r.business_id WHERE r.token=? AND r.email=? AND b.category='restaurant'").bind(saved.restaurant_invite,email).first();
    if(!invitation)throw new HttpError(403,'This invitation is unavailable for this Google account');
    const uid=identity?.user_id||crypto.randomUUID();
    if(invitation.user_id&&invitation.user_id!==uid)throw new HttpError(403,'Invitation belongs to another account');
    if(await db.prepare("SELECT 1 FROM members WHERE user_id=? AND business_id=? AND role<>'cashier'").bind(uid,invitation.business_id).first())throw new HttpError(409,'This Google account already manages this workspace');
    const statements=[];
    if(!identity){
     if(await db.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first())throw new HttpError(409,'Connect Google to your existing BOS account first');
     statements.push(db.prepare('INSERT INTO users(id,email,password) VALUES(?,?,?)').bind(uid,email,'google-only:'+random()),db.prepare("INSERT INTO identities(provider,subject,user_id) VALUES('google',?,?)").bind(claims.sub,uid));
    }
    statements.push(
     db.prepare('UPDATE restaurant_staff SET user_id=? WHERE token=? AND (user_id IS NULL OR user_id=?)').bind(uid,invitation.token,uid),
     db.prepare("INSERT OR IGNORE INTO members(user_id,business_id,role) SELECT user_id,business_id,'cashier' FROM restaurant_staff WHERE token=? AND user_id=?").bind(invitation.token,uid)
    );
    await db.batch(statements);
    if(!await db.prepare('SELECT 1 FROM restaurant_staff WHERE token=? AND user_id=?').bind(invitation.token,uid).first())throw new HttpError(403,'Invitation revoked');
    return redirect('/#restaurant',request,[['Set-Cookie',await issueSession(db,uid,invitation.business_id,request)],['Set-Cookie',stateCookie(request,'',0)]]);
   }
   if(!identity&&env.ENVIRONMENT==='ros-preview'&&claims.email.toLowerCase()===env.QA_DEMO_OWNER_EMAIL){
    const owner=await db.prepare("SELECT u.id FROM users u JOIN members m ON m.user_id=u.id AND m.role='owner' JOIN businesses b ON b.id=m.business_id WHERE u.email=? AND b.name='Demo Restaurant · Gariahat Table' AND u.password='disabled'").bind(env.QA_DEMO_OWNER_EMAIL).first();
    if(owner){
     await db.prepare("INSERT INTO identities(provider,subject,user_id) VALUES('google',?,?) ON CONFLICT DO NOTHING").bind(claims.sub,owner.id).run();
     identity=await db.prepare("SELECT user_id FROM identities WHERE provider='google' AND subject=? AND user_id=?").bind(claims.sub,owner.id).first();
    }
   }
   if(!identity){
    if(env.QA_REGISTRATION_CLOSED==='1')throw new HttpError(403,'Use an invitation on this test site');
    const email=claims.email.toLowerCase();const existing=await db.prepare('SELECT id FROM users WHERE email=?').bind(email).first();if(existing)throw new HttpError(409,'This email already has a workspace. Sign in with your password, then connect Google in Settings.');
    const uid=crypto.randomUUID(),bid=crypto.randomUUID();await db.batch([db.prepare('INSERT INTO users(id,email,password) VALUES(?,?,?)').bind(uid,email,'google-only:'+random()),db.prepare("INSERT INTO businesses(id,name,language,currency,category) VALUES(?,?,?,'USD','restaurant')").bind(bid,typeof claims.name==='string'?claims.name.slice(0,100)+"’s restaurant":'My restaurant',saved.language),db.prepare("INSERT INTO members(user_id,business_id,role) VALUES(?,?,'owner')").bind(uid,bid),db.prepare("INSERT INTO identities(provider,subject,user_id) VALUES('google',?,?)").bind(claims.sub,uid)]);identity={user_id:uid};
   }
   const member=await db.prepare("SELECT business_id FROM members WHERE user_id=? ORDER BY CASE WHEN role='owner' THEN 0 ELSE 1 END,business_id LIMIT 1").bind(identity.user_id).first();if(!member)throw new HttpError(403,'Workspace membership unavailable');return redirect('/#dashboard',request,[['Set-Cookie',await issueSession(db,identity.user_id,member.business_id,request)],['Set-Cookie',stateCookie(request,'',0)]]);
  }catch(error){const message=error instanceof HttpError?error.message:'Google sign-in is temporarily unavailable';return redirect('/?auth_error='+encodeURIComponent(message),request,[['Set-Cookie',stateCookie(request,'',0)]]);}
 }
 throw new HttpError(404,'Not found');
}
