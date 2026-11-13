import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import worker from '../src/worker.mjs';
import {database} from './database.mjs';

const base='http://127.0.0.1:8794',db=database();
const root=resolve('public');
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const env={DB:db,ENVIRONMENT:'restaurant-demo',ASSETS:{async fetch(request){
 const pathname=new URL(request.url).pathname;
 const path=resolve(root,'.'+(extname(pathname)?pathname:'/index.html'));
 if(!path.startsWith(root+sep))return new Response('Not found',{status:404});
 try{return new Response(await readFile(path),{headers:{'Content-Type':types[extname(path)]||'application/octet-stream'}});}
 catch{return new Response('Not found',{status:404});}
}}};
const name='Demo Restaurant · Gariahat Table';
const email='owner@restaurant-demo.example.test';
const password=crypto.randomUUID();
const end=process.argv[2]||new Date(Date.now()+19800000).toISOString().slice(0,10);
if(!/^\d{4}-\d{2}-\d{2}$/.test(end)||Number.isNaN(Date.parse(end)))throw Error('Use YYYY-MM-DD');
let cookie='';
async function call(path,body,method='POST',key=crypto.randomUUID(),guest=false){
 const response=await worker.fetch(new Request(base+'/api/'+path,{method:body?method:'GET',headers:{Origin:base,'Content-Type':'application/json',Cookie:guest?'':cookie,'Idempotency-Key':key},body:body?JSON.stringify(body):undefined}),env);
 if(!response.ok)throw Error(path+': '+response.status+' '+await response.text());
 if(response.headers.has('Set-Cookie'))cookie=response.headers.get('Set-Cookie').split(';')[0];
 return response.json();
}
const dayAt=offset=>new Date(Date.parse(end)+offset*86400000).toISOString().slice(0,10);
function stamp(day,hour){
 return new Date(Date.parse(day)+hour*3600000-19800000).toISOString().slice(0,19).replace('T',' ');
}
await call('register',{name,email,password,category:'restaurant'});
const profile=await call('me'),bid=profile.business.id;
await call('business',{...profile.business,currency:'INR'},'PATCH');
const names=['Chicken Biryani','Mutton Kosha','Paneer Butter Masala','Fish Curry','Dal Tadka','Vegetable Pulao','Chicken Roll','Fish Fry','Chilli Paneer','Masala Papad','Lachha Paratha','Steamed Rice','Mishti Doi','Rosogolla','Nolen Gur Ice Cream','Fresh Lime Soda','Masala Chai','Cold Coffee'];
const sections=['Mains','Starters','Sides','Desserts','Drinks'];
const items=[];
for(const [index,item] of names.entries()){
 const price=[290,395,250,305,165,195,145,180,215,75,65,95,95,55,135,85,55,125][index]*100;
 const product=await call('products',{name:item,kind:'service',unit:'portion',price,cost:Math.round(price*.36),stock:0,low_stock:0,tax_bps:0});
 await call('restaurant/menu',{id:product.id,section:sections[index<6?0:index<10?1:index<12?2:index<15?3:4],available:index!==14&&index!==17});
 items.push(product.id);
}
for(let i=1;i<=10;i++)await call('restaurant/table',{name:'Table '+String(i).padStart(2,'0')});
const tables=(await call('restaurant/state')).tables;
const crew=[];
for(const [handle,role,cashier,reports] of [['manager','manager',false,true],['waiter.one','staff',false,false],['waiter.two','staff',false,false],['cashier','staff',true,false]]){
 const email='bos.demo.'+handle+'@gmail.com';
 await call('restaurant/staff',{email,role,cashier,reports});
 // Synthetic local fixtures have no usable password or Google identity.
 const user=crypto.randomUUID();
 db.sqlite.prepare('INSERT INTO users(id,email,password) VALUES(?,?,?)').run(user,handle+'@restaurant-demo.example.test','disabled');
 db.sqlite.prepare("INSERT INTO members VALUES(?,?,'cashier')").run(user,bid);
 db.sqlite.prepare('UPDATE restaurant_staff SET email=?,user_id=? WHERE business_id=? AND email=?').run(handle+'@restaurant-demo.example.test',user,bid,email);
 crew.push(handle+'@restaurant-demo.example.test');
}
await call('restaurant/assign',{table:tables[0].id,email:crew[1]});
await call('restaurant/assign',{table:tables[1].id,email:crew[2]});
const buyers=[];
for(const [index,buyer] of ['Ananya Sen','Rohan Das','Ishita Roy','Arjun Dutta','Meera Bose','Kabir Shah','Nisha Mitra','Dev Patel','Tara Ghosh','Aditi Rao','Neel Basu','Diya Paul'].entries()){
 buyers.push((await call('customers',{name:buyer,address:index%3===0?'Kolkata (demo)':''})).id);
}
const supplier=await call('suppliers',{name:'Demo Market Produce'});
const ingredient=await call('products',{name:'Basmati rice',kind:'product',unit:'kg',price:8000,cost:6200,stock:0,low_stock:2000,tax_bps:0});
await call('restaurant/ingredient',{product:ingredient.id,category:'Dry goods'});
async function dining(table){
 await call('restaurant/session',{action:'open',table:table.id});
 return (await call('menu/'+table.qr_token,undefined,'GET','',true)).session;
}
async function order(table,session,lines,served=true){
 const result=await call('menu/'+table.qr_token+'/order',{session,items:lines},'POST',crypto.randomUUID(),true);
 if(served)for(const status of ['accepted','preparing','ready','served'])await call('restaurant/order',{id:result.id,status});
 return result.id;
}
let sequence=0,seed=41013;
const rand=max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};
const menuIndices=names.map((_,i)=>i).filter(i=>i!==14&&i!==17);
const line=()=>({id:items[menuIndices[rand(menuIndices.length)]],quantity:1+rand(3)});
for(let i=0;i<60;i++){
 const date=dayAt(i-59),weekend=[0,6].includes(new Date(date).getUTCDay());
 if(i%5===0){
  await call('purchases',{supplier_id:supplier.id,items:[{product_id:ingredient.id,quantity:12000,cost:6200+rand(900)}],reference:'Demo produce '+date});
  const purchase=db.sqlite.prepare('SELECT id FROM purchases WHERE business_id=? ORDER BY rowid DESC LIMIT 1').get(bid);
  db.sqlite.prepare('UPDATE purchases SET created_at=? WHERE id=?').run(stamp(date,10),purchase.id);
  db.sqlite.prepare('UPDATE inventory_movements SET created_at=? WHERE business_id=? AND reference=?').run(stamp(date,10),bid,purchase.id);
 }
 if(i%4===0)await call('restaurant/wastage',{product:ingredient.id,quantity:250+rand(750),reason:'Demo preparation waste',date});
 if(i%2===0)await call('expenses',{category:['Ingredients','Cooking gas','Cleaning','Staff salaries'][i%4],amount:28000+i*420+rand(12000),date,note:'Demo operating expense'});
 const count=Math.max(1,2+Math.floor(i/8)+(weekend?2:0)+rand(3)-(i%13===5?3:0));
 for(let k=0;k<count;k++){
  const table=tables[sequence%tables.length],session=await dining(table);
  const first=line(),second=line(),ids=[await order(table,session,first.id===second.id?[first]:[first,second])];
  if(sequence%3!==0)ids.push(await order(table,session,[line()]));
  const stampAt=stamp(date,12+(k%8));
  for(const id of ids)db.sqlite.prepare('UPDATE restaurant_orders SET created_at=? WHERE id=?').run(stampAt,id);
  db.sqlite.prepare('UPDATE restaurant_sessions SET created_at=? WHERE id=?').run(stampAt,session);
  const inv=await call('invoices',{dining_session:session,customer_id:sequence%4===0?buyers[sequence%buyers.length]:undefined,paid:0,discount:sequence%11===0?2500:0});
  db.sqlite.prepare('UPDATE invoices SET created_at=? WHERE id=?').run(stampAt,inv.id);
  await call('invoices/'+inv.id+'/payments',{amount:inv.total,method:['cash','upi','card','bank'][sequence%4]});
  db.sqlite.prepare('UPDATE payments SET created_at=? WHERE invoice_id=?').run(stampAt,inv.id);
  await call('restaurant/session',{action:'clean',session});
  await call('restaurant/session',{action:'close',session});
  sequence++;
 }
}
const live=await dining(tables[0]);
await order(tables[0],live,[{id:items[0],quantity:2}],false);
await call('menu/'+tables[0].qr_token+'/request',{session:live,kind:'waiter'},'POST','',true);
await call('menu/'+tables[0].qr_token+'/request',{session:live,kind:'bill'},'POST','',true);
const pending=await dining(tables[1]);
await order(tables[1],pending,[{id:items[1],quantity:2}]);
await call('invoices',{dining_session:pending,paid:0});
const summary=await call('dashboard?currency=INR&from='+dayAt(-59)+'&to='+end);
const counts={};
for(const table of ['restaurant_orders','invoices','payments','expenses','purchases','restaurant_wastage'])counts[table]=db.sqlite.prepare('SELECT COUNT(*) n FROM '+table+' WHERE business_id=?').get(bid).n;
const paid=db.sqlite.prepare('SELECT SUM(amount) n FROM payments WHERE business_id=?').get(bid).n;
const first20=summary.daily.slice(0,20).reduce((sum,row)=>sum+row.total,0);
const last20=summary.daily.slice(-20).reduce((sum,row)=>sum+row.total,0);
if(summary.daily.length!==60||last20<=first20||paid+summary.summary.dues!==summary.summary.sales)throw Error('Demo reconciliation failed');
console.log(JSON.stringify({name,email,...(process.argv.includes('--export-qa')?{}:{password}),from:dayAt(-59),to:end,counts,paid,first20,last20,summary:summary.summary},null,2));
if(process.argv.includes('--export-qa')){
 const tables=['users','businesses','members','products','customers','suppliers','restaurant_tables','restaurant_sessions','restaurant_menu','restaurant_orders','restaurant_requests','restaurant_staff','restaurant_assignments','purchases','purchase_items','expenses','restaurant_wastage','invoice_counters','invoices','invoice_items','payments','restaurant_bills','inventory_movements'];
 const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
 const triggers=db.sqlite.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY rowid").all();
 const sql=triggers.map(trigger=>'DROP TRIGGER '+trigger.name+';');
 for(const table of tables)for(const row of db.sqlite.prepare('SELECT * FROM '+table).all()){
  if(table==='users'){row.password='disabled';if(row.email===email)row.email='oxodian.lab@gmail.com';}
  sql.push('INSERT OR IGNORE INTO '+table+' ('+Object.keys(row).join(',')+') VALUES ('+Object.values(row).map(literal).join(',')+');');
 }
 sql.push(...triggers.map(trigger=>trigger.sql+';'));
 await mkdir('.local',{recursive:true});
 await writeFile('.local/restaurant-qa-seed.sql',sql.join('\n'),{flag:'wx'});
 db.close();
}else{
const server=http.createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const response=await worker.fetch(new Request(base+req.url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined}),env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Local preview error');}
});
server.listen(8794,'127.0.0.1',()=>console.log(base));

}
