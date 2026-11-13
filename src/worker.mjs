import {tableAccessSql,limitedStaff} from './restaurant-access.mjs';
import {restaurantRoute} from './restaurant.mjs';
import {validCurrency} from '../public/currency.js';
import {COUNTRY_CURRENCY} from '../public/countries.js';
import {comparisonWindow,businessComparison} from './comparison.mjs';
import {FORM_CATALOG} from '../public/form-catalog.js';
import {businessForm,validateFormSchema,snapshotForm} from './invoice-forms.mjs';
import {validateProductPhoto} from './product-photos.mjs';
import {validateLogo,validateProfileLogo} from './branding.mjs';
import {HttpError,text,integer,date,calculate,predictReturn,addons,kolkataDay} from './domain.mjs';
import {googleRoute} from './google.mjs';
const encoder=new TextEncoder();
const invoiceRetention=30*86400000;
const purgeInvoiceTrash=db=>stmt(db,'DELETE FROM invoices WHERE rowid IN (SELECT rowid FROM invoices WHERE deleted_at<=? ORDER BY deleted_at LIMIT 100)',Date.now()-invoiceRetention).run();
let cleanupAt=0,cleanupTask;
function maintainInvoiceTrash(db){
 const now=Date.now();
 if(cleanupTask)return cleanupTask;
 if(now<cleanupAt)return Promise.resolve();
 cleanupAt=now+15*60*1000;
 cleanupTask=purgeInvoiceTrash(db).catch(error=>{cleanupAt=0;throw error;}).finally(()=>{cleanupTask=null;});
 return cleanupTask;
}
const id=()=>crypto.randomUUID();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=async s=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
async function hashPassword(password,salt=hex(crypto.getRandomValues(new Uint8Array(16)))){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return salt+':'+hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256));}
function equal(a,b){let result=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)result|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return result===0;}
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const one=(db,sql,...args)=>stmt(db,sql,...args).first();
const all=async(db,sql,...args)=>(await stmt(db,sql,...args).all()).results;
const audit=(db,s,action,reference)=>stmt(db,'INSERT INTO audit_logs(business_id,user_id,action,reference) VALUES(?,?,?,?)',s.business_id,s.user_id,action,reference);
function key(request){return text(request.headers.get('Idempotency-Key'),100,true);}
function cookie(request,token,expires=604800){return `${new URL(request.url).protocol==='https:'?'__Host-':''}ros_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${expires}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
async function body(request){let size=0;const chunks=[],reader=request.body?.getReader();if(!reader)throw new HttpError(400,'JSON body required');while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new HttpError(413,'Request too large');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{const b=JSON.parse(new TextDecoder().decode(bytes));if(!b||Array.isArray(b)||typeof b!=='object')throw Error();return b;}catch{throw new HttpError(400,'Invalid JSON');}}
function passwordValue(value){if(typeof value!=='string'||value.length<1||value.length>128)throw new HttpError(400,'Invalid password');return value;}
async function rate(db,name,limit){const now=Math.floor(Date.now()/1000);await stmt(db,'INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END',name,now+900,now,now).run();const r=await one(db,'SELECT count FROM rate_limits WHERE key=?',name);if(r.count>limit)throw new HttpError(429,'Too many attempts. Try again in 15 minutes.');}
async function session(request,db){const token=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)(?:__Host-)?ros_session=([^;]+)/)?.[1];if(!token)throw new HttpError(401,'Please sign in');const s=await one(db,'SELECT s.*,m.role,u.email FROM sessions s JOIN members m ON m.user_id=s.user_id AND m.business_id=s.business_id JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?',await sha(token),Date.now());if(!s)throw new HttpError(401,'Session expired. Please sign in');return s;}
function manager(s){if(!['owner','manager'].includes(s.role))throw new HttpError(403,'Manager access required');}
async function issueSession(db,uid,bid,request){const token=hex(crypto.getRandomValues(new Uint8Array(32)));const now=Date.now();await db.batch([stmt(db,'DELETE FROM sessions WHERE expires_at<?',now),stmt(db,'INSERT INTO sessions(token_hash,user_id,business_id,expires_at,created_at) VALUES(?,?,?,?,?)',await sha(token),uid,bid,now+7*86400000,now)]);return cookie(request,token);}
async function invoice(db,bid,iid){const inv=await one(db,"SELECT * FROM invoices WHERE business_id=? AND id=? AND status<>'draft' AND deleted_at IS NULL",bid,iid);if(!inv)throw new HttpError(404,'Invoice not found');inv.items=await all(db,'SELECT * FROM invoice_items WHERE business_id=? AND invoice_id=?',bid,iid);inv.payments=await all(db,'SELECT * FROM payments WHERE business_id=? AND invoice_id=? ORDER BY created_at',bid,iid);inv.restaurant_bill=await one(db,'SELECT discount,adjustments FROM restaurant_bills WHERE business_id=? AND invoice_id=?',bid,iid);if(inv.restaurant_bill)for(const item of inv.items)item.price=Math.round(item.net*1000/item.quantity);inv.business=JSON.parse(inv.business_snapshot);inv.customer=JSON.parse(inv.customer_snapshot);inv.form_details=JSON.parse(inv.form_snapshot||'{}');inv.brand_logo=(await one(db,'SELECT logo_data FROM businesses WHERE id=?',bid))?.logo_data||'';return inv;}
async function configuredSnapshot(db,bid,kind,payload,business,previous){business??=await one(db,'SELECT * FROM businesses WHERE id=?',bid);const row=await one(db,'SELECT * FROM business_forms WHERE business_id=? AND kind=?',bid,kind);const revision=row?.revision||0;if((payload.form_revision!==undefined&&payload.form_revision!==revision)||(payload.form_revision===undefined&&revision>0))throw new HttpError(409,'Form changed. Reopen this form');const next=snapshotForm(business,payload.custom_fields||{},row,kind);if(previous){const old=JSON.parse(previous);const ids=new Set(next.values.map(x=>x.id));next.archived=[...(old.archived||[]),...(old.values||[]).filter(x=>!ids.has(x.id)||next.values.find(n=>n.id===x.id)?.type!==x.type)];}return JSON.stringify(next);}
function checkCurrency(payload,currency){if(payload.expected_currency!==undefined&&payload.expected_currency!==currency)throw new HttpError(409,'Currency changed. Reopen this form before saving');}
function photoStatements(db,bid,pid,value){if(value===undefined)return [];return [value?stmt(db,'INSERT INTO product_photos(business_id,product_id,data) VALUES(?,?,?) ON CONFLICT(business_id,product_id) DO UPDATE SET data=excluded.data',bid,pid,value):stmt(db,'DELETE FROM product_photos WHERE business_id=? AND product_id=?',bid,pid),stmt(db,'UPDATE products SET photo_revision=photo_revision+1 WHERE business_id=? AND id=?',bid,pid)];}
async function route(request,env,ctx){
 const url=new URL(request.url),p=url.pathname,method=request.method,db=env.DB;
 if(p==='/api/health')return json({status:'ok',environment:env.ENVIRONMENT||'local',version:'0.1.0'});
 if(!db)throw new HttpError(503,'Database has not been configured');
 if(method==='GET'&&(p==='/api/auth/providers'||p.startsWith('/api/auth/google/')))return googleRoute(request,env,{session,issueSession});
 if(method!=='GET'&&method!=='HEAD'){
  if(request.headers.get('Origin')!==url.origin)throw new HttpError(403,'Invalid request origin');
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new HttpError(415,'JSON required');
 }
 if(p==='/api/register'&&method==='POST'){
  if(env.QA_REGISTRATION_CLOSED==='1')throw new HttpError(403,'Registration is closed on this test site');
  const b=await body(request);await rate(db,'register:'+await sha(request.headers.get('CF-Connecting-IP')||'local'),5);
  const email=text(b.email,254,true).toLowerCase(),password=passwordValue(b.password),name=text(b.name,120,true);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<12)throw new HttpError(400,'Enter a valid email and a password of at least 12 characters');
  const uid=id(),bid=id(),profileLogo=validateProfileLogo(b.profile_logo_data??'');try{await db.batch([stmt(db,'INSERT INTO users(id,email,password) VALUES(?,?,?)',uid,email,await hashPassword(password)),stmt(db,"INSERT INTO businesses(id,name,category,language,currency,profile_logo_data) VALUES(?,?,?,?,'USD',?)",bid,name,'restaurant',['en','hi','bn'].includes(b.language)?b.language:'en',profileLogo),stmt(db,"INSERT INTO members(user_id,business_id,role) VALUES(?,?,'owner')",uid,bid)]);}catch(e){if(String(e).includes('UNIQUE'))throw new HttpError(409,'Unable to register with these details');throw e;}
  return json({ok:true},201,{'Set-Cookie':await issueSession(db,uid,bid,request)});
 }
 if(p==='/api/login'&&method==='POST'){
  const b=await body(request),email=text(b.email,254,true).toLowerCase();await rate(db,'login-ip:'+await sha(request.headers.get('CF-Connecting-IP')||'local'),30);await rate(db,'login-email:'+await sha(email),10);
  const u=await one(db,'SELECT * FROM users WHERE email=?',email);const password=passwordValue(b.password),stored=u?.password||'00000000000000000000000000000000:'+ '0'.repeat(64);if(!equal(await hashPassword(password,stored.split(':')[0]),stored)||!u)throw new HttpError(401,'Email or password is incorrect');
  const m=await one(db,'SELECT business_id FROM members WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM restaurant_staff r WHERE r.business_id=members.business_id AND r.user_id=members.user_id) ORDER BY business_id LIMIT 1',u.id);if(!m)throw new HttpError(403,'Use the restaurant Google invitation link');return json({ok:true},200,{'Set-Cookie':await issueSession(db,u.id,m.business_id,request)});
 }
 const restaurantArgs={path:p,method,db,body:()=>body(request),key:()=>key(request),stmt,one,all,json,sha,env,pushSubscription:request.headers.get('X-BOS-Push-Endpoint'),defer:ctx?promise=>ctx.waitUntil(promise):null};
 if(p.startsWith('/api/menu/'))return restaurantRoute(restaurantArgs);
 const s=await session(request,db),bid=s.business_id;
 s.restaurantStaff=await one(db,'SELECT role,cashier,reports FROM restaurant_staff WHERE business_id=? AND user_id=?',bid,s.user_id);
 if(p.startsWith('/api/restaurant/'))return restaurantRoute({...restaurantArgs,session:s});
 if(s.restaurantStaff){
  if(!await one(db,"SELECT 1 FROM businesses WHERE id=? AND category='restaurant'",bid)&&p!=='/api/logout')throw new HttpError(403,'Restaurant access is inactive');
  const billing=/^\/api\/invoices(?:\/[a-f0-9-]+(?:\/payments)?)?$/.test(p);
  const allowed=['/api/me','/api/logout'].includes(p)||(billing&&s.restaurantStaff.cashier);
  if(!allowed)throw new HttpError(403,'Restaurant permission required');
 }
 const ledger=async()=>{const business=await one(db,'SELECT * FROM businesses WHERE id=?',bid),currency=url.searchParams.get('currency')||business.currency;if(!validCurrency(currency))throw new HttpError(400,'Choose a valid currency');return {business,currency};};
 if(p==='/api/logout'&&method==='POST'){await db.batch([stmt(db,'DELETE FROM sessions WHERE token_hash=?',s.token_hash),stmt(db,'DELETE FROM restaurant_push WHERE business_id=? AND user_id=? AND NOT EXISTS(SELECT 1 FROM sessions WHERE business_id=? AND user_id=? AND expires_at>?)',bid,s.user_id,bid,s.user_id,Date.now())]);return json({ok:true},200,{'Set-Cookie':cookie(request,'',0)});}
 if(p==='/api/me'&&method==='GET')return json({user:{id:s.user_id,email:s.email,role:s.role,restaurant_staff:s.restaurantStaff,google_connected:!!await one(db,"SELECT 1 FROM identities WHERE provider='google' AND user_id=?",s.user_id),is_platform_owner:!!env.OWNER_USER_ID&&env.OWNER_USER_ID===s.user_id},business:await one(db,s.restaurantStaff?'SELECT id,name,category,currency,language,profile_logo_data FROM businesses WHERE id=?':'SELECT * FROM businesses WHERE id=?',bid)});
 if(p==='/api/business/forms'&&method==='GET'){const business=await one(db,'SELECT * FROM businesses WHERE id=?',bid),rows=await all(db,'SELECT * FROM business_forms WHERE business_id=?',bid);return json({forms:Object.fromEntries(Object.keys(FORM_CATALOG).map(kind=>[kind,businessForm(business,rows.find(x=>x.kind===kind),kind)]))});}
 const formMatch=p.match(/^\/api\/business\/forms\/(invoice|customer|product|supplier|purchase|expense|adjustment|payment|business)$/);
 if(formMatch){const kind=formMatch[1],business=await one(db,'SELECT * FROM businesses WHERE id=?',bid),row=await one(db,'SELECT * FROM business_forms WHERE business_id=? AND kind=?',bid,kind);if(method==='GET')return json(businessForm(business,row,kind));if(method==='PATCH'){if(s.role!=='owner')throw new HttpError(403,'Owner access required');const b=await body(request),expected=integer(b.expected_revision,0,1000000);if(expected!==(row?.revision||0))throw new HttpError(409,'Form was changed elsewhere. Reload settings');const schema=validateFormSchema(b.schema,!!business.gstin,kind),result=await stmt(db,'INSERT INTO business_forms(business_id,kind,schema,revision) VALUES(?,?,?,1) ON CONFLICT(business_id,kind) DO UPDATE SET schema=excluded.schema,revision=business_forms.revision+1 WHERE business_forms.revision=?',bid,kind,JSON.stringify(schema),expected).run();if(!result.meta.changes)throw new HttpError(409,'Form was changed elsewhere. Reload settings');await audit(db,s,'form.configure',kind).run();return json(businessForm(business,await one(db,'SELECT * FROM business_forms WHERE business_id=? AND kind=?',bid,kind),kind));}}
 const photoMatch=p.match(/^\/api\/products\/([a-f0-9-]+)\/photo$/);if(photoMatch&&method==='GET'){const photo=await one(db,'SELECT data FROM product_photos WHERE business_id=? AND product_id=?',bid,photoMatch[1]);if(!photo)throw new HttpError(404,'Photo not found');return new Response(Uint8Array.from(atob(photo.data.slice(23)),c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store'}});}
 if(p==='/api/business/invoice-theme'&&method==='PATCH'){
  if(s.role!=='owner')throw new HttpError(403,'Owner access required');
  const {theme}=await body(request);
  if(!['emerald','midnight','classic'].includes(theme))throw new HttpError(400,'Choose a valid invoice theme');
  await db.batch([stmt(db,'UPDATE businesses SET invoice_theme=? WHERE id=?',theme,bid),audit(db,s,'business.invoice_theme.update',bid)]);
  return json({theme});
 }
 if(p==='/api/business/profile-logo'&&method==='POST'){
  if(s.role!=='owner')throw new HttpError(403,'Owner access required');
  const logo=validateProfileLogo((await body(request)).logo_data);
  await db.batch([stmt(db,'UPDATE businesses SET profile_logo_data=? WHERE id=?',logo,bid),audit(db,s,'business.profile_logo.update',bid)]);
  return json({ok:true});
 }
 if(p==='/api/business/logo'&&method==='POST'){
  if(s.role!=='owner')throw new HttpError(403,'Owner access required');const b=await body(request),logo=validateLogo(b.logo_data);await db.batch([stmt(db,'UPDATE businesses SET logo_data=? WHERE id=?',logo,bid),audit(db,s,'business.logo.update',bid)]);return json({ok:true});
 }
 if(p==='/api/business'&&method==='PATCH'){
  if(s.role!=='owner')throw new HttpError(403,'Owner access required');const b=await body(request);const gstin=text(b.gstin||'',15).toUpperCase(),state=text(b.state_code||'19',2);if(!/^(0[1-9]|[12][0-9]|3[0-8]|97)$/.test(state)||gstin&&(!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)||!gstin.startsWith(state)))throw new HttpError(400,'Check GSTIN and state code');
  if(!['en','hi','bn'].includes(b.language))throw new HttpError(400,'Invalid language');
  
  const current=await one(db,'SELECT * FROM businesses WHERE id=?',bid),currency=b.currency??current.currency,country=b.country??current.country;if(!validCurrency(currency)||country&&!Object.hasOwn(COUNTRY_CURRENCY,country))throw new HttpError(400,'Choose a valid currency and country');const formSnapshot=await configuredSnapshot(db,bid,'business',b,undefined,(await one(db,'SELECT form_snapshot FROM businesses WHERE id=?',bid)).form_snapshot);await db.batch([stmt(db,'UPDATE businesses SET name=?,category=?,address=?,phone=?,language=?,gstin=?,state_code=?,currency=?,country=? WHERE id=?',text(b.name,120,true),'restaurant',text(b.address,500),text(b.phone,20),b.language,gstin,state,currency,country,bid),stmt(db,'UPDATE businesses SET form_snapshot=? WHERE id=?',formSnapshot,bid),audit(db,s,'business.update',bid)]);return json({ok:true});
 }
 if(p==='/api/products'&&method==='GET')return json(await all(db,'SELECT * FROM products WHERE business_id=? ORDER BY name LIMIT 1000',bid));
 if(p==='/api/products'&&method==='POST'){
  manager(s);const b=await body(request),pid=id(),stock=integer(b.stock||0,0,100000000),kind=b.kind==='service'?'service':'product';if(kind==='service'&&stock)throw new HttpError(400,'Services cannot hold stock');const currency=(await ledger()).business.currency;checkCurrency(b,currency);const formSnapshot=await configuredSnapshot(db,bid,'product',b),photo=b.photo_data===undefined?undefined:validateProductPhoto(b.photo_data);
  await db.batch([stmt(db,'INSERT INTO products(id,business_id,name,sku,kind,unit,price,cost,stock,low_stock,tax_bps,hsn,currency) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',pid,bid,text(b.name,160,true),text(b.sku||'',80),kind,text(b.unit||'pcs',20,true),integer(b.price),integer(b.cost||0),stock,integer(b.low_stock??5000,0,100000000),integer(b.tax_bps||0,0,4000),text(b.hsn||'',8),currency),stmt(db,"INSERT INTO inventory_movements(business_id,product_id,quantity,reason,reference) VALUES(?,?,?,'opening',?)",bid,pid,stock,pid),stmt(db,'UPDATE products SET form_snapshot=? WHERE business_id=? AND id=?',formSnapshot,bid,pid),...photoStatements(db,bid,pid,photo),audit(db,s,'product.create',pid)]);return json({id:pid},201);
 }
 const productMatch=p.match(/^\/api\/products\/([a-f0-9-]+)$/);
 if(productMatch&&method==='PATCH'){
  manager(s);const b=await body(request),pid=productMatch[1];const previous=await one(db,'SELECT * FROM products WHERE business_id=? AND id=?',bid,pid);if(!previous)throw new HttpError(404,'Product not found');const currency=(await ledger()).business.currency;checkCurrency(b,currency);if(previous.currency!==currency&&b.currency_cost===undefined)throw new HttpError(400,'Enter a new selling price and cost in the selected currency');const formSnapshot=await configuredSnapshot(db,bid,'product',b,undefined,previous.form_snapshot),photo=b.photo_data===undefined?undefined:validateProductPhoto(b.photo_data);
  await db.batch([stmt(db,'UPDATE products SET name=?,sku=?,unit=?,price=?,low_stock=?,tax_bps=?,hsn=?,currency=?,cost=?,version=version+1 WHERE business_id=? AND id=?',text(b.name,160,true),text(b.sku||'',80),text(b.unit||'pcs',20,true),integer(b.price),integer(b.low_stock??5000,0,100000000),integer(b.tax_bps||0,0,4000),text(b.hsn||'',8),currency,previous.currency===currency?previous.cost:integer(b.currency_cost),bid,pid),stmt(db,'UPDATE products SET form_snapshot=? WHERE business_id=? AND id=?',formSnapshot,bid,pid),...photoStatements(db,bid,pid,photo),audit(db,s,'product.update',pid)]);return json({ok:true});
 }
 const customerMatch=p.match(/^\/api\/customers\/([a-f0-9-]+)$/);
 if(customerMatch&&method==='GET'){
  const c=await one(db,'SELECT * FROM customers WHERE business_id=? AND id=?',bid,customerMatch[1]);if(!c)throw new HttpError(404,'Customer not found');const invoices=await all(db,"SELECT id,number,total,paid,status,created_at,due_date,customer_snapshot,currency FROM invoices WHERE business_id=? AND customer_id=? AND status<>'draft' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500",bid,c.id);return json({customer:c,invoices});
 }
 if(p==='/api/adjustments'&&method==='POST'){
  manager(s);const b=await body(request),pid=text(b.product_id,40,true),q=integer(b.quantity,-100000000,100000000),reason=text(b.reason,200,true),operation=key(request);
  const formSnapshot=await configuredSnapshot(db,bid,'adjustment',b);if(!q)throw new HttpError(400,'Quantity cannot be zero');const existing=await one(db,"SELECT id FROM inventory_movements WHERE business_id=? AND reference=? AND reason LIKE 'adjustment:%'",bid,operation);if(existing)return json({ok:true});
  const prod=await one(db,"SELECT id FROM products WHERE business_id=? AND id=? AND kind='product'",bid,pid);if(!prod)throw new HttpError(404,'Product not found');
  await db.batch([stmt(db,'INSERT INTO adjustment_keys(business_id,key) VALUES(?,?)',bid,operation),stmt(db,'UPDATE products SET stock=stock+?,version=version+1 WHERE business_id=? AND id=?',q,bid,pid),stmt(db,'INSERT INTO inventory_movements(business_id,product_id,quantity,reason,reference) VALUES(?,?,?,?,?)',bid,pid,q,'adjustment:'+reason,operation),stmt(db,'UPDATE inventory_movements SET form_snapshot=? WHERE business_id=? AND product_id=? AND reference=?',formSnapshot,bid,pid,operation),audit(db,s,'stock.adjust',pid)]);return json({ok:true});
 }
 for(const table of ['customers','suppliers']){
  if(p===`/api/${table}`&&method==='GET')return json(await all(db,`SELECT * FROM ${table} WHERE business_id=? ORDER BY name LIMIT 1000`,bid));
  if(p===`/api/${table}`&&method==='POST'){
   if(table==='suppliers')manager(s);const b=await body(request),rid=id(),requestKey=table==='customers'&&request.headers.has('Idempotency-Key')?key(request):null,requestHash=requestKey?await sha(JSON.stringify(b)):null;
   if(requestKey){const prior=await one(db,'SELECT id,request_hash FROM customers WHERE business_id=? AND request_key=?',bid,requestKey);if(prior){if(prior.request_hash!==requestHash)throw new HttpError(409,'Idempotency key belongs to a different buyer');return json({id:prior.id});}}
   const formSnapshot=await configuredSnapshot(db,bid,table==='customers'?'customer':'supplier',b);const args=[rid,bid,text(b.name,120,true),text(b.phone||'',20),text(b.address||'',500)];const columns=table==='customers'?',gstin,state_code,notes,request_key,request_hash':'';if(table==='customers'){const gst=text(b.gstin||'',15).toUpperCase(),st=text(b.state_code||'19',2);if(!/^\d{2}$/.test(st)||gst&&!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst))throw new HttpError(400,'Invalid GSTIN or state');args.push(gst,st,text(b.notes||'',1000),requestKey,requestHash);}
   try{await db.batch([stmt(db,`INSERT INTO ${table}(id,business_id,name,phone,address${columns}) VALUES(${args.map(()=>'?').join(',')})`,...args),stmt(db,`UPDATE ${table} SET form_snapshot=? WHERE business_id=? AND id=?`,formSnapshot,bid,rid),audit(db,s,table+'.create',rid)]);}catch(error){if(requestKey){const prior=await one(db,'SELECT id,request_hash FROM customers WHERE business_id=? AND request_key=?',bid,requestKey);if(prior&&prior.request_hash===requestHash)return json({id:prior.id});}throw error;}return json({id:rid},201);
  }
 }
 if(p==='/api/invoices'&&method==='GET'&&s.restaurantStaff)throw new HttpError(403,'Open a restaurant table to view its bill');
 if(p==='/api/invoices'&&method==='GET')return json(await all(db,"SELECT id,number,total,paid,status,created_at,due_date,customer_snapshot,currency FROM invoices WHERE business_id=? AND status<>'draft' AND deleted_at IS NULL ORDER BY created_at DESC,rowid DESC LIMIT 500",bid));
 if(p==='/api/invoices'&&method==='POST'){
  const b=await body(request),ik=key(request),requestHash=await sha(JSON.stringify(b));if(await one(db,'SELECT 1 FROM purged_invoice_keys WHERE business_id=? AND idempotency_key=?',bid,ik))throw new HttpError(410,'Invoice was permanently deleted');let existing=await one(db,'SELECT id,request_hash FROM invoices WHERE business_id=? AND idempotency_key=?',bid,ik);if(existing){if(existing.request_hash!==requestHash)throw new HttpError(409,'Idempotency key belongs to a different invoice');return json(await invoice(db,bid,existing.id));}
  if(s.restaurantStaff&&!b.dining_session)throw new HttpError(403,'Open a restaurant table to create its invoice');
  let diningOrders,discount=0,adjustments={};
  if(b.dining_session){
   if(b.paid!==undefined&&b.paid!==0)throw new HttpError(400,'Confirm payment after creating the table bill');
   const dining=await one(db,"SELECT s.id FROM restaurant_sessions s JOIN businesses b ON b.id=s.business_id WHERE s.business_id=? AND s.id=? AND s.state='open' AND b.category='restaurant'",bid,b.dining_session);
   if(dining&&limitedStaff(s)&&!await one(db,'SELECT 1 FROM restaurant_sessions rs JOIN restaurant_tables t ON t.id=rs.table_id WHERE rs.id=? AND '+tableAccessSql,dining.id,s.user_id,Date.now()))throw new HttpError(404,'Table unavailable');
   if(!dining)throw new HttpError(409,'Dining session is unavailable');
   diningOrders=await all(db,'SELECT * FROM restaurant_orders WHERE business_id=? AND session_id=? ORDER BY created_at,rowid',bid,dining.id);
   if(!diningOrders.length||diningOrders.some(order=>order.status!=='served'))throw new HttpError(409,'Serve all orders before creating the bill');
   const quantities=new Map();
   for(const order of diningOrders)for(const line of JSON.parse(order.lines)){const previous=quantities.get(line.id);quantities.set(line.id,{product_id:line.id,agreedNet:(previous?.agreedNet||0)+line.price*line.quantity,quantity:(previous?.quantity||0)+line.quantity*1000});}
   b.items=[...quantities.values()];
   const override=b.override,charge=b.charge;
   if(override||charge){
    adjustments={actor:s.user_id,at:new Date().toISOString(),reason:text(b.adjustment_reason,200,true)};
    if(override){
     const line=b.items.find(item=>item.product_id===override.product);
     if(!line)throw new HttpError(400,'Choose an ordered item');
     const rate=integer(override.rate,0,100000000);
     adjustments.override={product:line.product_id,original:line.agreedNet,rate,quantity:line.quantity};
     line.agreedNet=Math.round(rate*line.quantity/1000);
    }
    if(charge){
     const product=await one(db,"SELECT id FROM products WHERE business_id=? AND id=? AND kind='service'",bid,charge.product);
     if(!product||quantities.has(product.id))throw new HttpError(400,'Choose a separate service item for the charge');
     const amount=integer(charge.amount,1,100000000);
     adjustments.charge={product:product.id,original:0,amount};
     b.items.push({product_id:product.id,quantity:1000,agreedNet:amount});
    }
   }
   const original=b.items.reduce((sum,line)=>sum+line.agreedNet,0);
   discount=integer(b.discount??0,0,original);
   if(discount){
    adjustments={...adjustments,actor:s.user_id,at:new Date().toISOString(),discount,reason:adjustments.reason||text(b.adjustment_reason||'Bill discount',200,true)};
    let cumulative=0,allocated=0;
    for(const line of b.items){
     cumulative+=line.agreedNet;
     const share=Number(BigInt(cumulative)*BigInt(discount)/BigInt(original));
     line.agreedNet-=share-allocated;
     allocated=share;
    }
   }
  }
  if(!Array.isArray(b.items)||!b.items.length||b.items.length>50)throw new HttpError(400,'Add 1–50 invoice items');const seen=new Set(),lines=[];
  const ids=b.items.map(line=>text(line.product_id,40,true));const products=await all(db,`SELECT * FROM products WHERE business_id=? AND id IN (${ids.map(()=>'?').join(',')})`,bid,...ids);
  for(const line of b.items){const pid=line.product_id;if(seen.has(pid))throw new HttpError(400,'Combine duplicate products');seen.add(pid);const product=products.find(x=>x.id===pid);if(!product)throw new HttpError(404,'Product not found');lines.push({product,quantity:integer(line.quantity,1,100000000),agreedNet:diningOrders?line.agreedNet:undefined});}
  const business=await one(db,'SELECT * FROM businesses WHERE id=?',bid);checkCurrency(b,business.currency);if(products.some(p=>p.currency!==business.currency))throw new HttpError(409,'Item currency differs. Edit its price and cost in Inventory first');let customer={name:'Walk-in customer',phone:'',address:'',gstin:''};const cid=b.customer_id?text(b.customer_id,40,true):null;if(cid){customer=await one(db,'SELECT * FROM customers WHERE business_id=? AND id=?',bid,cid);if(!customer)throw new HttpError(404,'Customer not found');}
  if(diningOrders&&!cid){const buyer=diningOrders.find(order=>order.buyer_name||order.buyer_phone||order.buyer_address);if(buyer)customer={name:buyer.buyer_name||customer.name,phone:buyer.buyer_phone,address:buyer.buyer_address,gstin:''};}
  if(diningOrders)business.fssai=(await one(db,'SELECT fssai FROM restaurant_profiles WHERE business_id=?',bid))?.fssai||'';
  const place=text(b.place_of_supply||business.state_code,2,true);if(!/^(0[1-9]|[12][0-9]|3[0-8]|97)$/.test(place))throw new HttpError(400,'Invalid place of supply');
  const formSnapshot=await configuredSnapshot(db,bid,'invoice',b,business);const totals=calculate(lines,business,place),paid=integer(b.paid||0,0,totals.total);if(totals.total>paid&&!cid&&!diningOrders)throw new HttpError(400,'Select a customer for credit sales');
  if(business.gstin&&(!business.address||lines.some(x=>!/^\d{4,8}$/.test(x.product.hsn))))throw new HttpError(400,'GST invoices need a business address and HSN/SAC on every item');
  if(business.gstin&&totals.total>=5000000&&(!cid||!customer.address))throw new HttpError(400,'Customer details and address required for this GST invoice');
  if(business.gstin&&place!==business.state_code&&!customer.address)throw new HttpError(400,'Customer address required for interstate GST invoice');
  const iid=id(),now=new Date(Date.now()+19800000),fy=now.getUTCMonth()>=3?now.getUTCFullYear():now.getUTCFullYear()-1;const due=b.due_date?date(b.due_date):null;
  const queries=[stmt(db,'INSERT INTO invoice_counters(business_id,financial_year,sequence) VALUES(?,?,1) ON CONFLICT(business_id,financial_year) DO UPDATE SET sequence=sequence+1',bid,fy),stmt(db,"INSERT INTO invoices(id,business_id,number,customer_id,business_snapshot,customer_snapshot,subtotal,cgst,sgst,igst,total,cogs,due_date,place_of_supply,idempotency_key,request_hash,currency) VALUES(?,?,(SELECT printf('%02d-%09d',financial_year%100,sequence) FROM invoice_counters WHERE business_id=? AND financial_year=?),?,?,?,?,?,?,?,?,?,?,?,?,?,?)",iid,bid,bid,fy,cid,JSON.stringify({...business,logo_data:undefined,profile_logo_data:undefined,form_snapshot:undefined}),JSON.stringify(customer),totals.subtotal,totals.cgst,totals.sgst,totals.igst,totals.total,totals.cogs,due,place,ik,requestHash,business.currency)];
  queries.push(stmt(db,'UPDATE invoices SET form_snapshot=? WHERE business_id=? AND id=?',formSnapshot,bid,iid));
  for(const x of totals.items)queries.push(stmt(db,'INSERT INTO invoice_items(id,business_id,invoice_id,product_id,name,unit,hsn,quantity,price,cost,version,tax_bps,net,tax) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id(),bid,iid,x.id,x.name,x.unit,x.hsn,x.quantity,x.price,x.cost,x.version,business.gstin?x.tax_bps:0,x.net,x.tax));
  queries.push(stmt(db,"UPDATE invoices SET status='final' WHERE business_id=? AND id=?",bid,iid));if(paid)queries.push(stmt(db,'INSERT INTO payments(id,business_id,invoice_id,amount,method,idempotency_key) VALUES(?,?,?,?,?,?)',id(),bid,iid,paid,text(b.method||'cash',10,true),ik+':initial'));queries.push(audit(db,s,'invoice.finalize',iid));
  if(diningOrders){
   queries.push(stmt(db,'INSERT INTO restaurant_bills(business_id,session_id,invoice_id,order_count,discount,adjustments) VALUES(?,?,?,?,?,?)',bid,b.dining_session,iid,diningOrders.length,discount,JSON.stringify(adjustments)));
   queries.push(stmt(db,"UPDATE restaurant_sessions SET state='billed' WHERE id=? AND business_id=?",b.dining_session,bid));
  }
  try{await db.batch(queries);}catch(e){existing=await one(db,'SELECT id,request_hash FROM invoices WHERE business_id=? AND idempotency_key=?',bid,ik);if(existing&&existing.request_hash===requestHash)return json(await invoice(db,bid,existing.id));throw e;}
  return json(await invoice(db,bid,iid),201);
 }
 if(p==='/api/invoices/trash'&&method==='GET'){
  manager(s);
  return json(await all(db,"SELECT id,number,customer_snapshot,total,currency,deleted_at FROM invoices WHERE business_id=? AND deleted_at>? ORDER BY trash_order DESC",bid,Date.now()-invoiceRetention));
 }
 const match=p.match(/^\/api\/invoices\/([a-f0-9-]+)(?:\/(payments|void|restore))?$/);
 if(match){const [,iid,action]=match;if(s.restaurantStaff&&!await one(db,'SELECT 1 FROM restaurant_bills WHERE business_id=? AND invoice_id=?',bid,iid))throw new HttpError(404,'Invoice not found');if(limitedStaff(s)&&!await one(db,'SELECT 1 FROM restaurant_bills b JOIN restaurant_sessions rs ON rs.id=b.session_id JOIN restaurant_tables t ON t.id=rs.table_id WHERE b.business_id=? AND b.invoice_id=? AND '+tableAccessSql,bid,iid,s.user_id,Date.now()))throw new HttpError(404,'Table unavailable');if(method==='GET'&&!action)return json(await invoice(db,bid,iid));
  if(method==='DELETE'&&!action){
   manager(s);
   const result=await db.batch([
    stmt(db,"INSERT INTO audit_logs(business_id,user_id,action,reference) SELECT business_id,?,'invoice.trash',id FROM invoices WHERE business_id=? AND id=? AND status<>'draft' AND deleted_at IS NULL",s.user_id,bid,iid),
    stmt(db,"UPDATE invoices SET deleted_at=?,trash_order=(SELECT COALESCE(MAX(trash_order),0)+1 FROM invoices WHERE business_id=? AND deleted_at IS NOT NULL) WHERE business_id=? AND id=? AND status<>'draft' AND deleted_at IS NULL RETURNING id",Date.now(),bid,bid,iid)
   ]);
   if(!result[1].results.length)throw new HttpError(404,'Invoice not found');
   return json({ok:true});
  }
  if(method==='POST'&&action==='restore'){
   manager(s);
   const cutoff=Date.now()-invoiceRetention;
   const result=await db.batch([
    stmt(db,"INSERT INTO audit_logs(business_id,user_id,action,reference) SELECT business_id,?,'invoice.restore',id FROM invoices WHERE business_id=? AND id=? AND deleted_at>?",s.user_id,bid,iid,cutoff),
    stmt(db,"UPDATE invoices SET deleted_at=NULL,trash_order=NULL WHERE business_id=? AND id=? AND deleted_at>? RETURNING id",bid,iid,cutoff)
   ]);
   if(!result[1].results.length)throw new HttpError(404,'Invoice not found');
   return json({ok:true});
  }
  if(method==='POST'&&action==='payments'){const b=await body(request),ik=key(request);const lookup=()=>one(db,'SELECT invoice_id,amount,method FROM payments WHERE business_id=? AND idempotency_key=?',bid,ik);const old=await lookup();if(old){if(old.invoice_id!==iid||old.amount!==b.amount||old.method!==b.method)throw new HttpError(409,'Idempotency key belongs to a different payment');return json(await invoice(db,bid,iid));}const formSnapshot=await configuredSnapshot(db,bid,'payment',b);try{await db.batch([stmt(db,'INSERT INTO payments(id,business_id,invoice_id,amount,method,idempotency_key) VALUES(?,?,?,?,?,?)',id(),bid,iid,integer(b.amount,1),text(b.method,10,true),ik),stmt(db,'UPDATE payments SET form_snapshot=? WHERE business_id=? AND invoice_id=? AND idempotency_key=?',formSnapshot,bid,iid,ik),audit(db,s,'payment.record',iid)]);}catch(error){const saved=await lookup();if(!saved)throw error;if(saved.invoice_id!==iid||saved.amount!==b.amount||saved.method!==b.method)throw new HttpError(409,'Idempotency key belongs to a different payment');}return json(await invoice(db,bid,iid));}
  if(method==='POST'&&action==='void'){manager(s);const b=await body(request),reason=text(b.reason,200,true);await db.batch([stmt(db,"INSERT INTO invoice_reversals(business_id,invoice_id,reason) VALUES(?,?,?)",bid,iid,reason),audit(db,s,'invoice.void',iid)]);return json(await invoice(db,bid,iid));}
 }
 if(p==='/api/purchases'&&method==='GET')return json(await all(db,'SELECT p.*,s.name supplier_name FROM purchases p LEFT JOIN suppliers s ON s.business_id=p.business_id AND s.id=p.supplier_id WHERE p.business_id=? ORDER BY p.created_at DESC LIMIT 500',bid));
 if(p==='/api/purchases'&&method==='POST'){
  manager(s);const b=await body(request),ik=key(request);const old=await one(db,'SELECT id FROM purchases WHERE business_id=? AND idempotency_key=?',bid,ik);if(old)return json(old);const currency=(await ledger()).business.currency,formSnapshot=await configuredSnapshot(db,bid,'purchase',b);
  if(!Array.isArray(b.items)||!b.items.length||b.items.length>50)throw new HttpError(400,'Add 1–50 purchase items');const items=b.items.map(x=>({product_id:text(x.product_id,40,true),quantity:integer(x.quantity,1,100000000),cost:integer(x.cost)}));for(const item of items){const product=await one(db,'SELECT currency FROM products WHERE business_id=? AND id=?',bid,item.product_id);if(!product)throw new HttpError(409,'Product not found');if(product.currency!==currency)throw new HttpError(409,'Item currency differs. Update its price and cost in Inventory first');}const total=items.reduce((v,x)=>v+Math.round(x.cost*x.quantity/1000),0);integer(total);const pid=id();
  const queries=[stmt(db,'INSERT INTO purchases(id,business_id,supplier_id,reference,total,idempotency_key,currency) VALUES(?,?,?,?,?,?,?)',pid,bid,b.supplier_id?text(b.supplier_id,40,true):null,text(b.reference||'',100),total,ik,currency)];items.forEach(x=>queries.push(stmt(db,'INSERT INTO purchase_items(id,business_id,purchase_id,product_id,quantity,cost) VALUES(?,?,?,?,?,?)',id(),bid,pid,x.product_id,x.quantity,x.cost)));queries.push(stmt(db,'UPDATE purchases SET form_snapshot=? WHERE business_id=? AND id=?',formSnapshot,bid,pid),audit(db,s,'purchase.create',pid));await db.batch(queries);return json({id:pid},201);
 }
 if(p==='/api/expenses'&&method==='GET')return json(await all(db,'SELECT * FROM expenses WHERE business_id=? ORDER BY date DESC LIMIT 500',bid));
 if(p==='/api/expenses'&&method==='POST'){manager(s);const b=await body(request),ik=key(request),old=await one(db,'SELECT id FROM expenses WHERE business_id=? AND idempotency_key=?',bid,ik);if(old)return json(old);const currency=(await ledger()).business.currency,formSnapshot=await configuredSnapshot(db,bid,'expense',b),eid=id();await db.batch([stmt(db,'INSERT INTO expenses(id,business_id,category,note,amount,date,idempotency_key,currency) VALUES(?,?,?,?,?,?,?,?)',eid,bid,text(b.category,60,true),text(b.note||'',300),integer(b.amount,1),date(b.date),ik,currency),stmt(db,'UPDATE expenses SET form_snapshot=? WHERE business_id=? AND id=?',formSnapshot,bid,eid),audit(db,s,'expense.create',eid)]);return json({id:eid},201);}
 if(p==='/api/dashboard'&&method==='GET'){
  const {currency}=await ledger();const start=url.searchParams.get('from')||kolkataDay(Date.now()-29*86400000),end=url.searchParams.get('to')||kolkataDay();date(start);date(end);if(start>end)throw new HttpError(400,'Invalid date range');
  const compare=comparisonWindow(kolkataDay()),compareStart=compare.start60<compare.previousFrom?compare.start60:compare.previousFrom;const result=await db.batch([
   stmt(db,"SELECT COALESCE(SUM(total),0) sales,COALESCE(SUM(subtotal),0) net_sales,COALESCE(SUM(cogs),0) cogs,COALESCE(SUM(cgst+sgst+igst),0) tax,COUNT(*) invoices FROM invoices WHERE business_id=? AND currency=? AND status='final' AND deleted_at IS NULL AND date(created_at,'+5 hours','+30 minutes') BETWEEN ? AND ?",bid,currency,start,end),
   stmt(db,'SELECT COALESCE(SUM(amount),0) expenses FROM expenses WHERE business_id=? AND currency=? AND date BETWEEN ? AND ?',bid,currency,start,end),
   stmt(db,"SELECT COALESCE(SUM(total-paid),0) dues FROM invoices WHERE business_id=? AND currency=? AND status='final' AND deleted_at IS NULL",bid,currency),
   stmt(db,"SELECT COALESCE(SUM(ROUND(cost*stock/1000.0)),0) inventory_value FROM products WHERE business_id=? AND currency=? AND kind='product'",bid,currency),
   stmt(db,"SELECT date(created_at,'+5 hours','+30 minutes') day,SUM(total) total FROM invoices WHERE business_id=? AND currency=? AND status='final' AND deleted_at IS NULL AND date(created_at,'+5 hours','+30 minutes') BETWEEN ? AND ? GROUP BY day ORDER BY day",bid,currency,start,end),
   stmt(db,"SELECT id,name,stock,low_stock,unit FROM products WHERE business_id=? AND currency=? AND kind='product' AND stock<=low_stock ORDER BY stock LIMIT 30",bid,currency),
   stmt(db,"SELECT id,number,total-paid due,due_date,customer_snapshot FROM invoices WHERE business_id=? AND currency=? AND status='final' AND deleted_at IS NULL AND total>paid AND due_date<date('now','+5 hours','+30 minutes') ORDER BY due_date LIMIT 30",bid,currency),
   stmt(db,"SELECT i.product_id,i.name,SUM(i.quantity) quantity,SUM(i.net) net FROM invoice_items i JOIN invoices v ON v.business_id=i.business_id AND v.id=i.invoice_id WHERE i.business_id=? AND v.currency=? AND v.status='final' AND v.deleted_at IS NULL AND date(v.created_at,'+5 hours','+30 minutes') BETWEEN ? AND ? GROUP BY i.product_id ORDER BY net DESC LIMIT 5",bid,currency,start,end),
   stmt(db,"SELECT date(created_at,'+5 hours','+30 minutes') day,SUM(total) sales,SUM(subtotal-cogs) gross,COUNT(*) orders FROM invoices WHERE business_id=? AND currency=? AND status='final' AND deleted_at IS NULL AND date(created_at,'+5 hours','+30 minutes') BETWEEN ? AND ? GROUP BY day ORDER BY day",bid,currency,compareStart,compare.today),
   stmt(db,'SELECT date day,SUM(amount) expenses FROM expenses WHERE business_id=? AND currency=? AND date BETWEEN ? AND ? GROUP BY date',bid,currency,compareStart,compare.today)
  ]);const r=result.map(x=>x.results);const summary={...r[0][0],...r[1][0],...r[2][0],...r[3][0]};const available=await all(db,'SELECT currency FROM businesses WHERE id=? UNION SELECT currency FROM invoices WHERE business_id=? UNION SELECT currency FROM expenses WHERE business_id=? UNION SELECT currency FROM products WHERE business_id=? UNION SELECT currency FROM purchases WHERE business_id=?',bid,bid,bid,bid,bid);return json({currency,available_currencies:available.map(x=>x.currency),from:start,to:end,summary:{...summary,gross_profit:summary.net_sales-summary.cogs,operating_profit:summary.net_sales-summary.cogs-summary.expenses},daily:r[4],low_stock:r[5],overdue:r[6],top_products:r[7],month_comparison:businessComparison(compare.today,r[8],r[9])});
 }
 if(p==='/api/dues'&&method==='GET'){const {currency}=await ledger();return json(await all(db,"SELECT c.id,c.name,c.phone,SUM(i.total-i.paid) due FROM customers c JOIN invoices i ON i.business_id=c.business_id AND i.customer_id=c.id WHERE c.business_id=? AND i.currency=? AND i.status='final' AND i.deleted_at IS NULL GROUP BY c.id HAVING due>0 ORDER BY due DESC LIMIT 500",bid,currency));}
 if(p==='/api/predictions'&&method==='GET'){const visits=await all(db,"SELECT customer_id,date(created_at,'+5 hours','+30 minutes') day FROM invoices WHERE business_id=? AND customer_id IS NOT NULL AND status='final' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 10000",bid);const cs=await all(db,'SELECT id,name FROM customers WHERE business_id=? LIMIT 1000',bid);return json(cs.map(c=>({...c,...predictReturn(visits.filter(x=>x.customer_id===c.id).map(x=>x.day))})));}
 if(p==='/api/addons'&&method==='GET')return json(addons);
 if(p==='/api/export'&&method==='GET'){manager(s);if((await one(db,'SELECT COALESCE(SUM(length(data)),0) size FROM product_photos WHERE business_id=?',bid)).size>5000000)throw new HttpError(413,'Photo backup exceeds 5 MB. Ask support for a full export');const tables=['businesses','products','customers','suppliers','invoices','invoice_items','payments','purchases','purchase_items','inventory_movements','expenses','invoice_reversals','audit_logs','business_forms','product_photos'];const data={version:1,exported_at:new Date().toISOString()};for(const t of tables)data[t]=await all(db,`SELECT * FROM ${t} WHERE ${t==='businesses'?'id':'business_id'}=? LIMIT 10001`,bid);if(tables.some(t=>data[t].length>10000))throw new HttpError(413,'Export exceeds 10,000 rows per table. Ask support for a database export.');return json(data,200,{'Content-Disposition':'attachment; filename="oxodian-export.json"'});}
 if(p==='/api/admin'&&method==='GET'){if(!env.OWNER_USER_ID||s.user_id!==env.OWNER_USER_ID)throw new HttpError(403,'Platform owner access required');if(Date.now()-s.created_at>900000)throw new HttpError(403,'Sign in again to access administration');return json({businesses:await all(db,'SELECT category,COUNT(*) count FROM businesses GROUP BY category'),usage:await one(db,"SELECT COUNT(*) invoices,COUNT(DISTINCT business_id) active_businesses FROM invoices WHERE status='final' AND deleted_at IS NULL AND created_at>=datetime('now','-30 days')"),accounts:await one(db,'SELECT COUNT(*) total FROM businesses')});}
 throw new HttpError(404,'Not found');
}
export default {
 async scheduled(_event,env){await purgeInvoiceTrash(env.DB);},
 async fetch(request,env,ctx){let response;try{const url=new URL(request.url);if(url.pathname.startsWith('/api/')){if(env.DB&&url.pathname==='/api/health'&&request.method==='GET'&&url.searchParams.get('maintenance')==='invoice-trash')await maintainInvoiceTrash(env.DB);else if(ctx&&env.DB)ctx.waitUntil(maintainInvoiceTrash(env.DB).catch(error=>console.error('Invoice trash cleanup failed',error.name)));response=await route(request,env,ctx);}else response=await env.ASSETS.fetch(request);}catch(e){let status=e.status||500,message=e.message;if(!e.status){if(/CHECK constraint|FOREIGN KEY|Product changed|Restaurant session changed|Invoice locked|Invalid invoice|Payment exceeds|Invalid stock|reversal|UNIQUE constraint/i.test(message)){status=409;message=/stock>=0/.test(message)?'Insufficient stock. Refresh and try again.':/Product changed/.test(message)?'Product changed. Refresh and try again.':'Transaction rejected. Check stock, payment balance and references.';}else{console.error(JSON.stringify({event:'request_error',path:new URL(request.url).pathname,type:e.name}));message='Something went wrong. Please try again.';}}response=json({error:message},status);}
  const h=new Headers(response.headers);h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','no-referrer');h.set('X-Frame-Options','DENY');h.set('Permissions-Policy','camera=(self), microphone=(), geolocation=()');h.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");if(new URL(request.url).protocol==='https:')h.set('Strict-Transport-Security','max-age=31536000');return new Response(response.body,{status:response.status,headers:h});
 }
};
