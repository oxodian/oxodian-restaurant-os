import {pushEndpoint,wakeRestaurantStaff} from './restaurant-push.mjs';
import {tableAccessSql,limitedStaff} from './restaurant-access.mjs';
import {HttpError,text,integer,kolkataDay,date} from './domain.mjs';
const steps=['new','accepted','preparing','ready','served'];
const id=()=>crypto.randomUUID();

export async function restaurantRoute({path,method,db,session,body,stmt,one,all,json,sha,key,env={},defer,pushSubscription}){
 const publicPath=path.match(/^\/api\/menu\/([a-f0-9-]+)(?:\/(order|request|photo)(?:\/([a-f0-9-]+))?)?$/);
 if(publicPath){
  const table=await one(db,"SELECT t.*,b.name business,b.currency,b.profile_logo_data FROM restaurant_tables t JOIN businesses b ON b.id=t.business_id WHERE qr_token=? AND t.active=1 AND b.category='restaurant'",publicPath[1]);
  if(!table)throw new HttpError(404,'Table unavailable');
  const bid=table.business_id;
  const wake=()=>defer?.(wakeRestaurantStaff({db,all,stmt,env},bid,table.id).catch(error=>console.error('Restaurant push failed',error.name)));
  const dining=await one(db,"SELECT id FROM restaurant_sessions WHERE table_id=? AND state='open'",table.id);
  const menu=()=>all(db,"SELECT p.id,p.name,p.price,p.currency,p.photo_revision,m.section,m.description,m.available FROM restaurant_menu m JOIN products p ON p.business_id=m.business_id AND p.id=m.product_id WHERE m.business_id=? AND p.currency=? ORDER BY m.section,p.name LIMIT 500",bid,table.currency);
  if(method==='GET'&&!publicPath[2]){
   const profile=await one(db,'SELECT whatsapp,fssai,opens,closes,description FROM restaurant_profiles WHERE business_id=?',bid);
   return json({name:table.business,table:table.name,currency:table.currency,logo:table.profile_logo_data,session:dining?.id,profile,items:await menu()});
  }
  if(method==='GET'&&publicPath[2]==='photo'&&publicPath[3]){
   const photo=await one(db,"SELECT p.data FROM product_photos p JOIN restaurant_menu m ON m.business_id=p.business_id AND m.product_id=p.product_id WHERE m.business_id=? AND m.product_id=?",bid,publicPath[3]);
   if(!photo)throw new HttpError(404,'Photo unavailable');
   return new Response(Uint8Array.from(atob(photo.data.slice(23)),char=>char.charCodeAt(0)),{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store'}});
  }
  if(method!=='POST')throw new HttpError(404,'Not found');
  const input=await body();
  if(!dining||input.session!==dining.id)throw new HttpError(409,'Ask staff to open this table or reload the menu');
  if(publicPath[2]==='request'){
   if(!['waiter','bill'].includes(input.kind))throw new HttpError(400,'Invalid request');
   const inserted=await stmt(db,"INSERT OR IGNORE INTO restaurant_requests(id,business_id,session_id,kind) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM restaurant_sessions WHERE id=? AND state='open') AND NOT EXISTS(SELECT 1 FROM restaurant_requests WHERE session_id=? AND kind=? AND created_at>datetime('now','-30 seconds'))",id(),bid,dining.id,input.kind,dining.id,dining.id,input.kind).run();
   if(inserted.meta.changes)wake();
   return json({ok:true});
  }
  if(publicPath[2]!=='order')throw new HttpError(404,'Not found');
  const requestKey=key(),hash=await sha(JSON.stringify(input));
  const lookup=()=>one(db,'SELECT id,request_hash FROM restaurant_orders WHERE session_id=? AND request_key=?',dining.id,requestKey);
  const prior=await lookup();
  if(prior){if(prior.request_hash!==hash)throw new HttpError(409,'Order retry differs');return json({id:prior.id});}
  if(!Array.isArray(input.items)||!input.items.length||input.items.length>30)throw new HttpError(400,'Choose 1–30 items');
  const items=await menu(),seen=new Set();
  const lines=input.items.map(line=>{
   const item=items.find(p=>p.id===line.id&&p.available);
   if(!item||seen.has(item.id))throw new HttpError(409,'Menu changed. Reload and try again');
   seen.add(item.id);
   return {id:item.id,name:item.name,price:item.price,quantity:integer(line.quantity,1,30)};
  });
  const buyer=[text(input.name||'',120),text(input.phone||'',20),text(input.address||'',250)];
  const order=id();
  try{await stmt(db,'INSERT INTO restaurant_orders(id,business_id,session_id,request_key,request_hash,lines,buyer_name,buyer_phone,buyer_address) VALUES(?,?,?,?,?,?,?,?,?)',order,bid,dining.id,requestKey,hash,JSON.stringify(lines),...buyer).run();}
  catch(error){const saved=await lookup();if(saved?.request_hash===hash)return json({id:saved.id});throw error;}
  wake();
  return json({id:order},201);
 }
 if(!path.startsWith('/api/restaurant/'))return;
 const bid=session.business_id;
 const business=await one(db,'SELECT category,currency FROM businesses WHERE id=?',bid);
 if(business.category!=='restaurant')throw new HttpError(404,'Restaurant Mode is unavailable');
 const owner=session.role==='owner';
 const managesTables=owner||session.restaurantStaff?.role==='manager';
 const scope=limitedStaff(session)?' AND '+tableAccessSql:'';
 const scopeArgs=scope?[session.user_id,Date.now()]:[];
 const cashier=owner||!!session.restaurantStaff?.cashier||!session.restaurantStaff;
 const reports=owner||!!session.restaurantStaff?.reports||!session.restaurantStaff;
 if(!['owner','manager','cashier'].includes(session.role))throw new HttpError(403,'Restaurant access required');
 if(path==='/api/restaurant/push'&&method==='GET')return json({key:env.RESTAURANT_VAPID_PRIVATE_JWK&&env.RESTAURANT_VAPID_CONTACT?env.RESTAURANT_VAPID_PUBLIC:null});
 if(path==='/api/restaurant/alerts'&&method==='GET'){
  if(!pushSubscription||!await one(db,'SELECT 1 FROM restaurant_push WHERE endpoint=? AND business_id=? AND user_id=?',pushSubscription,bid,session.user_id))throw new HttpError(403,'Device alerts unavailable');
  const rows=await all(db,`SELECT event.id,event.kind,t.name table_name FROM (
   SELECT id,session_id,'order' kind,business_id FROM restaurant_orders WHERE business_id=? AND status='new'
   UNION ALL SELECT id,session_id,kind,business_id FROM restaurant_requests WHERE business_id=? AND acknowledged=0
  ) event JOIN restaurant_sessions s ON s.id=event.session_id AND s.state='open' JOIN restaurant_tables t ON t.id=s.table_id WHERE t.business_id=?`+scope+' LIMIT 50',bid,bid,bid,...scopeArgs);
  return json(rows);
 }
 if(path==='/api/restaurant/staff'&&method==='GET'){
  if(!owner)throw new HttpError(403,'Owner access required');
  return json(await all(db,'SELECT email,token,role,cashier,reports,user_id FROM restaurant_staff WHERE business_id=? ORDER BY email',bid));
 }
 if(path==='/api/restaurant/reports'&&method==='GET'){
  if(!reports)throw new HttpError(403,'Reports permission required');
  const currency=business.currency;
  const collections=await one(db,"SELECT COALESCE(SUM(CASE WHEN date(p.created_at,'+330 minutes')=date('now','+330 minutes') THEN p.amount END),0) daily,COALESCE(SUM(CASE WHEN date(p.created_at,'+330 minutes')>=date('now','+330 minutes','-6 days') THEN p.amount END),0) weekly,COALESCE(SUM(CASE WHEN date(p.created_at,'+330 minutes')>=date('now','+330 minutes','start of month') THEN p.amount END),0) monthly FROM restaurant_bills b JOIN payments p ON p.business_id=b.business_id AND p.invoice_id=b.invoice_id JOIN invoices i ON i.business_id=b.business_id AND i.id=b.invoice_id WHERE b.business_id=? AND i.currency=? AND i.deleted_at IS NULL AND i.status='final'",bid,currency);
  const outstanding=await one(db,"SELECT COALESCE(SUM(i.total-i.paid),0) amount FROM restaurant_bills b JOIN invoices i ON i.business_id=b.business_id AND i.id=b.invoice_id WHERE b.business_id=? AND i.currency=? AND i.deleted_at IS NULL AND i.status='final'",bid,currency);
  const popular=await all(db,"SELECT x.name,SUM(x.quantity) quantity FROM restaurant_bills b JOIN invoices i ON i.business_id=b.business_id AND i.id=b.invoice_id JOIN invoice_items x ON x.business_id=b.business_id AND x.invoice_id=b.invoice_id WHERE b.business_id=? AND i.currency=? AND i.deleted_at IS NULL AND i.status='final' GROUP BY x.product_id,x.name ORDER BY quantity DESC LIMIT 15",bid,currency);
  const history=await all(db,"SELECT o.id,t.name table_name,o.lines,o.status,o.created_at FROM restaurant_orders o JOIN restaurant_sessions s ON s.business_id=o.business_id AND s.id=o.session_id JOIN restaurant_tables t ON t.business_id=s.business_id AND t.id=s.table_id WHERE o.business_id=? ORDER BY o.created_at DESC,o.rowid DESC LIMIT 100",bid);
  const payments=await all(db,"SELECT p.amount,p.method,p.created_at,i.number,t.name table_name FROM restaurant_bills b JOIN invoices i ON i.business_id=b.business_id AND i.id=b.invoice_id JOIN payments p ON p.business_id=b.business_id AND p.invoice_id=b.invoice_id JOIN restaurant_sessions s ON s.business_id=b.business_id AND s.id=b.session_id JOIN restaurant_tables t ON t.business_id=s.business_id AND t.id=s.table_id WHERE b.business_id=? AND i.currency=? AND i.deleted_at IS NULL ORDER BY p.created_at DESC,p.rowid DESC LIMIT 100",bid,currency);
  const expenses=await one(db,"SELECT COALESCE(SUM(amount),0) amount FROM expenses WHERE business_id=? AND currency=? AND date>=date('now','+330 minutes','start of month') AND date<=date('now','+330 minutes')",bid,currency);
  const gross=await one(db,"SELECT COALESCE(SUM(i.subtotal-i.cogs),0) amount FROM restaurant_bills b JOIN invoices i ON i.business_id=b.business_id AND i.id=b.invoice_id WHERE b.business_id=? AND i.currency=? AND i.deleted_at IS NULL AND i.status='final' AND date(i.created_at,'+330 minutes')>=date('now','+330 minutes','start of month')",bid,currency);
  const completed=await one(db,"SELECT COUNT(*) count FROM restaurant_orders WHERE business_id=? AND status='served'",bid);
  const series=await all(db,"SELECT date(p.created_at,'+330 minutes') day,SUM(p.amount) amount FROM restaurant_bills b JOIN invoices i ON i.business_id=b.business_id AND i.id=b.invoice_id JOIN payments p ON p.business_id=b.business_id AND p.invoice_id=b.invoice_id WHERE b.business_id=? AND i.currency=? AND i.deleted_at IS NULL AND i.status='final' AND date(p.created_at,'+330 minutes') BETWEEN date('now','+330 minutes','-29 days') AND date('now','+330 minutes') GROUP BY day ORDER BY day",bid,currency);
  return json({currency,series,collections,outstanding:outstanding.amount,popular,history,payments,expenses:expenses.amount,operatingProfit:gross.amount-expenses.amount,completed:completed.count});
 }
 if(path==='/api/restaurant/state'&&method==='GET'){
  const tables=await all(db,"SELECT t.id,t.name,t.active,t.qr_token,s.id session,s.state,b.invoice_id,i.total,i.paid,i.currency,a.email assignee FROM restaurant_tables t LEFT JOIN restaurant_sessions s ON s.table_id=t.id AND s.state<>'closed' LEFT JOIN restaurant_bills b ON b.session_id=s.id LEFT JOIN invoices i ON i.id=b.invoice_id AND i.business_id=b.business_id LEFT JOIN restaurant_assignments a ON a.business_id=t.business_id AND a.table_id=t.id WHERE t.business_id=?"+scope+' ORDER BY t.name',bid,...scopeArgs);
  const activeTables=" JOIN restaurant_sessions s ON s.business_id=t.business_id AND s.table_id=t.id AND s.state<>'closed'";
  const orders=await all(db,"SELECT o.id,o.session_id,o.lines,o.status FROM restaurant_tables t"+activeTables+" JOIN restaurant_orders o ON o.business_id=s.business_id AND o.session_id=s.id WHERE t.business_id=?"+scope+" ORDER BY o.created_at",bid,...scopeArgs);
  const requests=await all(db,"SELECT r.id,r.session_id,r.kind FROM restaurant_tables t"+activeTables+" JOIN restaurant_requests r ON r.business_id=s.business_id AND r.session_id=s.id AND r.acknowledged=0 WHERE t.business_id=?"+scope,bid,...scopeArgs);
  const sales=await one(db,"SELECT COALESCE(SUM(p.amount),0) amount FROM restaurant_bills b JOIN payments p ON p.business_id=b.business_id AND p.invoice_id=b.invoice_id JOIN invoices i ON i.id=b.invoice_id AND i.business_id=b.business_id WHERE b.business_id=? AND i.deleted_at IS NULL AND i.status='final' AND i.currency=? AND date(p.created_at,'+330 minutes')=?",bid,business.currency,kolkataDay());
  const menu=owner?await all(db,'SELECT product_id,section,description,available FROM restaurant_menu WHERE business_id=?',bid):[];
  const wastage=owner?await all(db,'SELECT w.*,p.name FROM restaurant_wastage w JOIN products p ON p.id=w.product_id AND p.business_id=w.business_id WHERE w.business_id=? ORDER BY w.occurred_on DESC,w.rowid DESC LIMIT 20',bid):[];
  const profile=owner?await one(db,'SELECT * FROM restaurant_profiles WHERE business_id=?',bid):null;
  const recent=await all(db,"SELECT i.id,i.number,i.total,i.paid,i.currency,t.name table_name FROM restaurant_bills b JOIN invoices i ON i.id=b.invoice_id AND i.business_id=b.business_id JOIN restaurant_sessions s ON s.id=b.session_id JOIN restaurant_tables t ON t.id=s.table_id WHERE b.business_id=? AND i.deleted_at IS NULL ORDER BY i.created_at DESC LIMIT 12",bid);
  return json({tables:tables.map(({qr_token,total,paid,...table})=>({...table,qr_token:owner?qr_token:undefined,settled:table.invoice_id&&total===paid,total:cashier?total:undefined,paid:cashier?paid:undefined})),orders:cashier?orders:orders.map(order=>({...order,lines:JSON.stringify(JSON.parse(order.lines).map(({price,...line})=>line))})),requests,sales:reports?sales.amount:null,menu,profile,wastage,chargeItems:cashier?await all(db,"SELECT id,name FROM products WHERE business_id=? AND currency=? AND kind='service' ORDER BY name LIMIT 500",bid,business.currency):[],recent:cashier&&!scope?recent:[],assignees:managesTables?await all(db,'SELECT email FROM restaurant_staff WHERE business_id=? AND user_id IS NOT NULL ORDER BY email',bid):[]});
 }
 if(method!=='POST')throw new HttpError(404,'Not found');
 const input=await body();
 if(scope){
  const relations={'session':input.action==='open'?['',input.table]:['JOIN restaurant_sessions s ON s.table_id=t.id',input.session],
   order:['JOIN restaurant_sessions s ON s.table_id=t.id JOIN restaurant_orders o ON o.session_id=s.id',input.id],
   acknowledge:['JOIN restaurant_sessions s ON s.table_id=t.id JOIN restaurant_requests r ON r.session_id=s.id',input.id]};
  const operation=path.split('/').at(-1),relation=relations[operation];
  if(Object.hasOwn(relations,operation)){
   const column=operation==='session'?(input.action==='open'?'t.id':'s.id'):operation==='order'?'o.id':'r.id';
   if(!await one(db,'SELECT 1 FROM restaurant_tables t '+relation[0]+' WHERE t.business_id=? AND '+column+'=?'+scope,bid,relation[1]??'',...scopeArgs))throw new HttpError(404,'Table unavailable');
  }
 }
 if(path==='/api/restaurant/push'){
  const endpoint=typeof input.endpoint==='string'&&input.endpoint.length<=2048&&pushEndpoint(input.endpoint);
  if(!endpoint)throw new HttpError(400,'Unsupported push endpoint');
  if(input.remove===true)await stmt(db,'DELETE FROM restaurant_push WHERE endpoint=? AND business_id=? AND user_id=?',endpoint.href,bid,session.user_id).run();
  else {
   if(!env.RESTAURANT_VAPID_PUBLIC)throw new HttpError(503,'Push is unavailable');
   await stmt(db,'INSERT INTO restaurant_push VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET business_id=excluded.business_id,user_id=excluded.user_id,updated_at=excluded.updated_at',endpoint.href,bid,session.user_id,'{}',Date.now()).run();
  }
 }else if(path==='/api/restaurant/ingredient'){
  if(!owner)throw new HttpError(403,'Owner access required');
  const result=await stmt(db,"UPDATE products SET ingredient_category=? WHERE business_id=? AND id=? AND kind='product'",text(input.category,60,true),bid,input.product).run();
  if(!result.meta.changes)throw new HttpError(404,'Ingredient unavailable');
 }else if(path==='/api/restaurant/wastage'){
  if(!owner)throw new HttpError(403,'Owner access required');
  const quantity=integer(input.quantity,1,100000000),reason=text(input.reason,200,true),occurred=date(input.date);
  if(occurred>kolkataDay())throw new HttpError(400,'Choose a past or current date');
  const result=await stmt(db,"INSERT INTO restaurant_wastage(id,business_id,product_id,quantity,cost,currency,reason,occurred_on,user_id) SELECT ?,business_id,id,?,CAST(ROUND(cost*? / 1000.0) AS INTEGER),currency,?,?,? FROM products WHERE id=? AND business_id=? AND kind='product' ON CONFLICT(id) DO NOTHING",key(),quantity,quantity,reason,occurred,session.user_id,input.product,bid).run();
  if(!result.meta.changes&&!await one(db,'SELECT 1 FROM restaurant_wastage WHERE id=? AND business_id=? AND product_id=? AND quantity=? AND reason=? AND occurred_on=?',key(),bid,input.product,quantity,reason,occurred))throw new HttpError(409,'Ingredient unavailable or request changed');
 }else if(path==='/api/restaurant/assign'){
  if(!managesTables)throw new HttpError(403,'Manager access required');
  if(!await one(db,'SELECT 1 FROM restaurant_tables WHERE business_id=? AND id=?',bid,input.table))throw new HttpError(404,'Table unavailable');
  if(input.email){
   if(!await one(db,'SELECT 1 FROM restaurant_staff WHERE business_id=? AND email=? AND user_id IS NOT NULL',bid,input.email))throw new HttpError(404,'Employee unavailable');
   await stmt(db,'INSERT INTO restaurant_assignments VALUES(?,?,?) ON CONFLICT(business_id,table_id) DO UPDATE SET email=excluded.email',bid,input.table,input.email).run();
  }else await stmt(db,'DELETE FROM restaurant_assignments WHERE business_id=? AND table_id=?',bid,input.table).run();
 }else if(path==='/api/restaurant/staff'){
  if(!owner)throw new HttpError(403,'Owner access required');
  const email=text(input.email,254,true).toLowerCase();
  if(!/^[a-z0-9.]+@gmail\.com$/.test(email))throw new HttpError(400,'Enter a Gmail address');
  if(input.revoke===true){
   await db.batch([
    stmt(db,'DELETE FROM restaurant_push WHERE business_id=? AND user_id=(SELECT user_id FROM restaurant_staff WHERE business_id=? AND email=?)',bid,bid,email),
    stmt(db,'DELETE FROM sessions WHERE business_id=? AND user_id=(SELECT user_id FROM restaurant_staff WHERE business_id=? AND email=?)',bid,bid,email),
    stmt(db,"DELETE FROM members WHERE business_id=? AND role='cashier' AND user_id=(SELECT user_id FROM restaurant_staff WHERE business_id=? AND email=?)",bid,bid,email),
    stmt(db,'DELETE FROM restaurant_staff WHERE business_id=? AND email=?',bid,email)
   ]);
  }else{
   if(!['manager','staff'].includes(input.role))throw new HttpError(400,'Invalid employee role');
   await stmt(db,'INSERT INTO restaurant_staff(business_id,email,token,role,cashier,reports) VALUES(?,?,?,?,?,?) ON CONFLICT(business_id,email) DO UPDATE SET role=excluded.role,cashier=excluded.cashier,reports=excluded.reports',bid,email,id(),input.role,input.cashier===true?1:0,input.reports===true?1:0).run();
  }
 }else if(path==='/api/restaurant/table'){
  if(!managesTables)throw new HttpError(403,'Owner access required');
  const name=text(input.name,60,true);
  if(input.id){
   const result=await stmt(db,"UPDATE restaurant_tables SET name=?,active=? WHERE business_id=? AND id=? AND (?=1 OR NOT EXISTS(SELECT 1 FROM restaurant_sessions WHERE table_id=? AND state<>'closed'))",name,input.active===false?0:1,bid,input.id,input.active===false?0:1,input.id).run();
   if(!result.meta.changes)throw new HttpError(409,'Close the dining session first');
  }else await stmt(db,'INSERT INTO restaurant_tables(id,business_id,name,qr_token) VALUES(?,?,?,?)',id(),bid,name,id()).run();
 }else if(path==='/api/restaurant/profile'){
  if(!owner)throw new HttpError(403,'Owner access required');
  const fssai=text(input.fssai||'',14),opens=text(input.opens||'',5),closes=text(input.closes||'',5);
  if(fssai&&!/^\d{14}$/.test(fssai))throw new HttpError(400,'Enter a 14-digit FSSAI number');
  if([opens,closes].some(value=>value&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)))throw new HttpError(400,'Use HH:MM opening hours');
  await stmt(db,'INSERT INTO restaurant_profiles VALUES(?,?,?,?,?,?) ON CONFLICT(business_id) DO UPDATE SET whatsapp=excluded.whatsapp,fssai=excluded.fssai,opens=excluded.opens,closes=excluded.closes,description=excluded.description',bid,text(input.whatsapp||'',20),fssai,opens,closes,text(input.description||'',500)).run();
 }else if(path==='/api/restaurant/menu'){
  if(!owner)throw new HttpError(403,'Owner access required');
  const product=await one(db,"SELECT id FROM products WHERE business_id=? AND id=? AND currency=?",bid,input.id,business.currency);
  if(!product)throw new HttpError(404,'Item not found');
  await stmt(db,'INSERT INTO restaurant_menu VALUES(?,?,?,?,?) ON CONFLICT(business_id,product_id) DO UPDATE SET section=excluded.section,description=excluded.description,available=excluded.available',bid,input.id,text(input.section,60,true),text(input.description||'',500),input.available===true?1:0).run();
 }else if(path==='/api/restaurant/session'){
  if(input.action==='open'){
   const result=await stmt(db,'INSERT INTO restaurant_sessions(id,business_id,table_id) SELECT ?,business_id,id FROM restaurant_tables WHERE id=? AND business_id=? AND active=1',id(),input.table,bid).run();
   if(!result.meta.changes)throw new HttpError(404,'Table unavailable');
  }else{
   const target=input.action==='clean'?'cleaning':input.action==='close'?'closed':null;
   if(!target)throw new HttpError(400,'Invalid action');
   const result=await stmt(db,"UPDATE restaurant_sessions SET state=? WHERE business_id=? AND id=? AND ((?='closed' AND state='cleaning') OR (?='cleaning' AND ((state='open' AND NOT EXISTS(SELECT 1 FROM restaurant_orders WHERE session_id=restaurant_sessions.id)) OR (state='billed' AND EXISTS(SELECT 1 FROM restaurant_bills b JOIN invoices i ON i.id=b.invoice_id AND i.business_id=b.business_id WHERE b.session_id=restaurant_sessions.id AND i.deleted_at IS NULL AND i.paid=i.total)))))",target,bid,input.session,target,target).run();
   if(!result.meta.changes)throw new HttpError(409,'Finish orders and collect payment first');
  }
 }else if(path==='/api/restaurant/order'){
  const before=steps[steps.indexOf(input.status)-1];
  if(!before)throw new HttpError(400,'Invalid order status');
  const result=await stmt(db,"UPDATE restaurant_orders SET status=? WHERE business_id=? AND id=? AND status=? AND session_id IN(SELECT id FROM restaurant_sessions WHERE business_id=? AND state='open')",input.status,bid,input.id,before,bid).run();
  if(!result.meta.changes)throw new HttpError(409,'Order status changed');
 }else if(path==='/api/restaurant/acknowledge'){
  await stmt(db,'UPDATE restaurant_requests SET acknowledged=1 WHERE business_id=? AND id=?',bid,input.id).run();
 }else throw new HttpError(404,'Not found');
 return json({ok:true});
}
