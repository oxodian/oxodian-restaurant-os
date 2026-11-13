import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database} from '../scripts/database.mjs';
import worker from '../src/worker.mjs';
import {predictReturn,calculate,kolkataDay} from '../src/domain.mjs';
import {readFileSync} from 'node:fs';
function fixture(){const db=database();const env={DB:db,ENVIRONMENT:'test',ASSETS:{fetch:async()=>new Response('shell')}};let counter=0;const call=async(path,method='GET',body,cookie='',key)=>{const response=await worker.fetch(new Request('http://localhost/api/'+path,{method,headers:{Origin:'http://localhost','Content-Type':'application/json','CF-Connecting-IP':'test-'+(++counter),Cookie:cookie,...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:response.status,data:await response.json(),cookie:response.headers.get('Set-Cookie')?.split(';')[0],headers:response.headers};};return {db,env,call};}
async function account(f,name='Shop A'){const result=await f.call('register','POST',{name,email:name.replaceAll(' ','')+'@example.test',password:'correct horse battery staple'});assert.equal(result.status,201,JSON.stringify(result.data));return result.cookie;}
async function product(f,cookie,overrides={}){const r=await f.call('products','POST',{name:'Rice',price:6000,cost:4000,stock:100000,kind:'product',unit:'kg',tax_bps:500,hsn:'1006',...overrides},cookie);assert.equal(r.status,201,JSON.stringify(r.data));return r.data.id;}
async function customer(f,cookie){return (await f.call('customers','POST',{name:'Rahul',phone:'919876543210',address:'Kolkata',state_code:'19'},cookie)).data.id;}
async function sale(f,c,p,cid,overrides={},key=crypto.randomUUID()){return f.call('invoices','POST',{items:[{product_id:p,quantity:5000}],customer_id:cid,paid:20000,method:'upi',...overrides},c,key);}

test('product symbols accept only bounded 400-square JPEGs and remain private to the business',async()=>{const f=fixture();try{const a=await account(f,'Photo Shop'),b=await account(f,'Photo Other'),photo=JSON.parse(readFileSync(new URL('./photo-fixture.json',import.meta.url),'utf8')),pid=await product(f,a,{photo_data:photo});assert.ok(photo.length<48000);const response=await worker.fetch(new Request('http://localhost/api/products/'+pid+'/photo',{headers:{Cookie:a}}),f.env);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/jpeg');assert.match(response.headers.get('Cache-Control'),/no-store/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),Buffer.from(photo.slice(23),'base64'));assert.equal((await f.call('products/'+pid+'/photo','GET',null,b)).status,404);assert.equal((await f.call('products/'+pid+'/photo')).status,401);const bytes=Buffer.from(photo.slice(23),'base64');for(let i=0;i<bytes.length-9;i++)if(bytes[i]===255&&[192,193,194].includes(bytes[i+1])){bytes.writeUInt16BE(399,i+5);break;}assert.equal((await f.call('products','POST',{name:'Bad dimensions',price:100,photo_data:'data:image/jpeg;base64,'+bytes.toString('base64')},a)).status,400);assert.equal((await f.call('products','POST',{name:'External photo',price:100,photo_data:'https://example.test/photo.jpg'},a)).status,400);assert.equal((await f.call('products','POST',{name:'Oversized',price:100,photo_data:photo+'A'.repeat(48000)},a)).status,400);const p=(await f.call('products','GET',null,a)).data[0];assert.equal(p.photo_revision,1);assert.equal((await f.call('products/'+pid,'PATCH',{...p,photo_data:''},a)).status,200);assert.equal((await f.call('products/'+pid+'/photo','GET',null,a)).status,404);}finally{f.db.close();}});

test('currency is independent of country; historical bills, payments and reports preserve monetary units',async()=>{const f=fixture();try{const c=await account(f,'Currency Shop'),p=await product(f,c),cid=await customer(f,c);let profile=(await f.call('me','GET',null,c)).data.business;assert.equal(profile.currency,'USD');assert.equal(profile.country,'');const first=await sale(f,c,p,cid);assert.equal(first.data.currency,'USD');assert.equal((await f.call('business','PATCH',{...profile,country:'IN',currency:'USD'},c)).status,200);assert.equal((await f.call('me','GET',null,c)).data.business.currency,'USD');assert.equal((await f.call('business','PATCH',{...profile,country:'IN',currency:'INR'},c)).status,200);assert.equal((await sale(f,c,p,cid)).status,409);assert.equal((await f.call('dashboard','GET',null,c)).data.summary.sales,0);assert.equal((await f.call('dashboard?currency=USD','GET',null,c)).data.summary.sales,30000);let saved=(await f.call('invoices/'+first.data.id,'GET',null,c)).data;assert.equal(saved.currency,'USD');assert.equal(saved.business.currency,'USD');assert.equal(saved.total,30000);assert.equal((await f.call('invoices/'+first.data.id+'/payments','POST',{amount:10000,method:'bank'},c,'usd-collection')).status,200);assert.equal((await f.call('dues?currency=USD','GET',null,c)).data.length,0);const prod=(await f.call('products','GET',null,c)).data[0];assert.equal((await f.call('products/'+p,'PATCH',{...prod,price:7000},c)).status,400);assert.equal((await f.call('products/'+p,'PATCH',{...prod,price:7000,currency_cost:4500},c)).status,200);const second=await sale(f,c,p,cid);assert.equal(second.data.currency,'INR');assert.equal(second.data.total,35000);const d=(await f.call('dashboard','GET',null,c)).data;assert.equal(d.summary.sales,35000);assert.deepEqual(d.available_currencies.sort(),['INR','USD']);assert.equal((await f.call('dashboard?currency=BAD','GET',null,c)).status,400);assert.equal((await f.call('business','PATCH',{...profile,currency:'BAD'},c)).status,400);assert.throws(()=>f.db.sqlite.prepare("UPDATE invoices SET currency='INR' WHERE id=?").run(first.data.id),/Invoice locked/);assert.equal((await f.call('invoices/'+first.data.id,'GET',null,c)).data.total,30000);}finally{f.db.close();}});

test('form studio protects core accounting, validates typed answers and revisions, isolates tenants and snapshots history',async()=>{const f=fixture();try{const a=await account(f,'Form Shop'),b=await account(f,'Other Form Shop');const original=(await f.call('business/forms/invoice','GET',null,a)).data;let schema=structuredClone(original.schema);schema.optional.total=false;assert.equal((await f.call('business/forms/invoice','PATCH',{expected_revision:0,schema},a)).status,400);schema=structuredClone(original.schema);schema.base_labels.buyer_name='Client';schema.optional.due_date=false;schema.fields=[{id:'cf_stylist',label:'Stylist',type:'select',step:'buyer',required:true,show_on_invoice:true,options:['Alex','Sam']}];const config=await f.call('business/forms/invoice','PATCH',{expected_revision:0,schema},a);assert.equal(config.status,200,JSON.stringify(config.data));assert.equal(config.data.revision,1);assert.equal((await f.call('business/forms/invoice','GET',null,b)).data.schema.fields.length,0);assert.equal((await f.call('business/forms/invoice','PATCH',{expected_revision:0,schema},a)).status,409);const p=await product(f,a),cid=await customer(f,a);assert.equal((await sale(f,a,p,cid)).status,409);assert.equal((await sale(f,a,p,cid,{form_revision:1})).status,400);assert.equal((await sale(f,a,p,cid,{form_revision:1,custom_fields:{cf_stylist:'Unknown'}})).status,400);const bill=await sale(f,a,p,cid,{form_revision:1,custom_fields:{cf_stylist:'Alex'}});assert.equal(bill.status,201);assert.equal(bill.data.form_details.values[0].value,'Alex');schema.fields[0].label='Team member';await f.call('business/forms/invoice','PATCH',{expected_revision:1,schema},a);assert.equal((await f.call('invoices/'+bill.data.id,'GET',null,a)).data.form_details.values[0].label,'Stylist');assert.throws(()=>f.db.sqlite.prepare("UPDATE invoices SET form_snapshot='{}' WHERE id=?").run(bill.data.id),/Invoice locked/);const uid=(await f.call('me','GET',null,a)).data.user.id;f.db.sqlite.prepare("UPDATE members SET role='cashier' WHERE user_id=?").run(uid);assert.equal((await f.call('business/forms/invoice','PATCH',{expected_revision:2,schema},a)).status,403);}finally{f.db.close();}});

test('all configurable record forms retain custom values without changing financial totals',async()=>{const f=fixture();try{const c=await account(f,'Flexible Shop');for(const kind of ['customer','product','supplier','purchase','expense','adjustment','payment','business']){const config=(await f.call('business/forms/'+kind,'GET',null,c)).data;config.schema.fields=[{id:'cf_reference',label:'Internal reference',type:'text',step:'buyer',required:true,show_on_invoice:false,options:[]}];assert.equal((await f.call('business/forms/'+kind,'PATCH',{expected_revision:0,schema:config.schema},c)).status,200);}const extra={form_revision:1,custom_fields:{cf_reference:'SALON-1'}};const p=await product(f,c,extra);const cr=await f.call('customers','POST',{name:'Jane',address:'Park Street',...extra},c,'new-client');assert.equal(cr.status,201);const cid=cr.data.id;const inv=await sale(f,c,p,cid);assert.equal(inv.data.customer.address,'Park Street');const payment=await f.call('invoices/'+inv.data.id+'/payments','POST',{amount:100,method:'cash',...extra},c,'custom-payment');assert.equal(payment.status,200);assert.equal((await f.call('suppliers','POST',{name:'Salon Supply',...extra},c)).status,201);assert.equal((await f.call('expenses','POST',{category:'Rent',amount:100,date:kolkataDay(),...extra},c,'custom-expense')).status,201);assert.equal((await f.call('purchases','POST',{items:[{product_id:p,quantity:1000,cost:4000}],...extra},c,'custom-purchase')).status,201);assert.equal((await f.call('adjustments','POST',{product_id:p,quantity:1000,reason:'Count',...extra},c,'custom-adjust')).status,200);const profile=(await f.call('me','GET',null,c)).data.business;assert.equal((await f.call('business','PATCH',{...profile,...extra},c)).status,200);for(const table of ['customers','products','suppliers','purchases','expenses','payments','inventory_movements','businesses']){const snapshots=f.db.sqlite.prepare(`SELECT form_snapshot FROM ${table}`).all().map(r=>JSON.parse(r.form_snapshot));assert.ok(snapshots.some(s=>s.values?.some(v=>v.value==='SALON-1')),table);}assert.equal((await f.call('invoices/'+inv.data.id,'GET',null,c)).data.total,30000);}finally{f.db.close();}});
test('billing atomically deducts stock, saves COGS and a partial payment; purchases are assets, not expenses',async()=>{const f=fixture();try{const c=await account(f),p=await product(f,c),cid=await customer(f,c);const inv=await sale(f,c,p,cid);assert.equal(inv.status,201,JSON.stringify(inv.data));assert.equal(inv.data.total,30000);assert.equal(inv.data.paid,20000);assert.equal(inv.data.cogs,20000);assert.equal((await f.call('products','GET',null,c)).data[0].stock,95000);assert.equal((await f.call('dues','GET',null,c)).data[0].due,10000);
const payment=await f.call('invoices/'+inv.data.id+'/payments','POST',{amount:10000,method:'cash'},c,'payment-1');assert.equal(payment.status,200);assert.equal(payment.data.paid,30000);const retry=await f.call('invoices/'+inv.data.id+'/payments','POST',{amount:10000,method:'cash'},c,'payment-1');assert.equal(retry.data.paid,30000);assert.equal(retry.data.payments.length,2);
const purchase=await f.call('purchases','POST',{items:[{product_id:p,quantity:10000,cost:5000}]},c,'purchase-1');assert.equal(purchase.status,201);const products=(await f.call('products','GET',null,c)).data;assert.equal(products[0].stock,105000);assert.equal(products[0].cost,4095);const report=(await f.call('dashboard','GET',null,c)).data;assert.equal(report.summary.cogs,20000);assert.equal(report.summary.operating_profit,10000);assert.equal(report.summary.expenses,0);
}finally{f.db.close();}});
test('all tenant references are isolated, including detail, foreign keys, payments, purchases, export and admin',async()=>{const f=fixture();try{const a=await account(f),b=await account(f,'Shop B'),p=await product(f,a),ca=await customer(f,a),cb=await customer(f,b),inv=await sale(f,a,p,ca);
assert.deepEqual((await f.call('products','GET',null,b)).data,[]);assert.deepEqual((await f.call('customers','GET',null,b)).data.map(x=>x.id),[cb]);assert.equal((await f.call('invoices/'+inv.data.id,'GET',null,b)).status,404);assert.equal((await sale(f,b,p,cb)).status,404);const pb=await product(f,b);assert.equal((await sale(f,b,pb,ca)).status,404);
assert.equal((await f.call('invoices/'+inv.data.id+'/payments','POST',{amount:1,method:'cash'},b,'foreign-payment')).status,409);assert.equal((await f.call('purchases','POST',{items:[{product_id:p,quantity:1000,cost:100}]},b,'foreign-purchase')).status,409);assert.equal((await f.call('admin','GET',null,a)).status,403);
const dump=await f.call('export','GET',null,b);assert.equal(dump.status,200);assert.equal(dump.data.invoices.length,0);assert.equal(dump.data.products.length,1);assert.equal(dump.data.products[0].id,pb);
}finally{f.db.close();}});
test('overselling rolls back invoice, line items, payment and audit; idempotency prevents duplicate bills',async()=>{const f=fixture();try{const c=await account(f),p=await product(f,c,{stock:1000}),cid=await customer(f,c);const failed=await sale(f,c,p,cid);assert.equal(failed.status,409);assert.equal((await f.call('invoices','GET',null,c)).data.length,0);assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM invoice_items').get().n,0);assert.equal((await f.call('products','GET',null,c)).data[0].stock,1000);
const first=await sale(f,c,p,cid,{items:[{product_id:p,quantity:1000}],paid:6000},'same-bill');const second=await sale(f,c,p,cid,{items:[{product_id:p,quantity:1000}],paid:6000},'same-bill');assert.equal(first.status,201);assert.equal(second.data.id,first.data.id);assert.equal((await f.call('products','GET',null,c)).data[0].stock,0);assert.equal((await f.call('invoices','GET',null,c)).data.length,1);
}finally{f.db.close();}});
test('stale product versions abort atomically, preventing concurrent stock/price races',async()=>{const f=fixture();try{const c=await account(f),p=await product(f,c),cid=await customer(f,c);const a=await sale(f,c,p,cid);assert.equal(a.status,201);const line={...a.data.items[0],id:crypto.randomUUID()};assert.throws(()=>f.db.sqlite.prepare('INSERT INTO invoice_items(id,business_id,invoice_id,product_id,name,unit,hsn,quantity,price,cost,version,tax_bps,net,tax) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(line.id,line.business_id,line.invoice_id,line.product_id,line.name,line.unit,line.hsn,line.quantity,line.price,line.cost,line.version,line.tax_bps,line.net,line.tax),/Invoice locked/);
}finally{f.db.close();}});
test('GST intra/interstate split and non-GST bills; customer/address and HSN requirements enforced',async()=>{const f=fixture();try{const c=await account(f),p=await product(f,c),cid=await customer(f,c);let r=await f.call('business','PATCH',{name:'GST Shop',category:'retail',address:'Kolkata, West Bengal',phone:'919876543210',gstin:'19ABCDE1234F1Z5',state_code:'19',language:'bn'},c);assert.equal(r.status,200);
const intra=await sale(f,c,p,cid,{paid:0});assert.equal(intra.data.subtotal,30000);assert.equal(intra.data.cgst,750);assert.equal(intra.data.sgst,750);assert.equal(intra.data.igst,0);assert.equal(intra.data.total,31500);
const inter=await sale(f,c,p,cid,{paid:0,place_of_supply:'27'});assert.equal(inter.data.igst,1500);assert.equal(inter.data.cgst,0);assert.equal(inter.data.sgst,0);const bad=await product(f,c,{hsn:''});assert.equal((await sale(f,c,bad,cid)).status,400);
const direct=calculate([{product:{price:101,cost:50,tax_bps:500},quantity:1000}],{gstin:'x',state_code:'19'},'19');assert.equal(direct.total,106);assert.equal(direct.cgst+direct.sgst,5);
}finally{f.db.close();}});
test('overpayment and negative input rejected; partial credits require a customer; services never deduct stock',async()=>{const f=fixture();try{const c=await account(f),p=await product(f,c),cid=await customer(f,c);assert.equal((await sale(f,c,p,null)).status,400);assert.equal((await sale(f,c,p,cid,{paid:30001})).status,400);assert.equal((await sale(f,c,p,cid,{items:[{product_id:p,quantity:-1}]})).status,400);const inv=await sale(f,c,p,cid);assert.equal((await f.call('invoices/'+inv.data.id+'/payments','POST',{amount:10001,method:'cash'},c,'overpay')).status,409);assert.equal((await f.call('invoices/'+inv.data.id,'GET',null,c)).data.paid,20000);
const service=await product(f,c,{name:'Haircut',kind:'service',stock:0,cost:0});const bill=await sale(f,c,service,cid,{paid:0,items:[{product_id:service,quantity:1000}]});assert.equal(bill.status,201);assert.equal((await f.call('products','GET',null,c)).data.find(x=>x.id===service).stock,0);
}finally{f.db.close();}});
test('unpaid reversal restores stock once and preserves original; paid reversal is blocked',async()=>{const f=fixture();try{const c=await account(f),p=await product(f,c),cid=await customer(f,c);const inv=await sale(f,c,p,cid,{paid:0});const reversed=await f.call('invoices/'+inv.data.id+'/void','POST',{reason:'Customer cancelled'},c);assert.equal(reversed.status,200);assert.equal(reversed.data.status,'void');assert.equal((await f.call('products','GET',null,c)).data[0].stock,100000);assert.equal((await f.call('invoices/'+inv.data.id+'/void','POST',{reason:'Again'},c)).status,409);const paid=await sale(f,c,p,cid);assert.equal((await f.call('invoices/'+paid.data.id+'/void','POST',{reason:'Refund'},c)).status,409);assert.equal((await f.call('dashboard','GET',null,c)).data.summary.sales,30000);
}finally{f.db.close();}});
test('stock adjustment and purchase idempotency; weighted inventory cost and expense profit treatment',async()=>{const f=fixture();try{const c=await account(f),p=await product(f,c),cid=await customer(f,c);const adjustment={product_id:p,quantity:-1000,reason:'Damaged'};assert.equal((await f.call('adjustments','POST',adjustment,c,'adjust-1')).status,200);await f.call('adjustments','POST',adjustment,c,'adjust-1');assert.equal((await f.call('products','GET',null,c)).data[0].stock,99000);assert.equal((await f.call('adjustments','POST',{...adjustment,quantity:-100000},c,'adjust-2')).status,409);
const purchase={items:[{product_id:p,quantity:1000,cost:6000}]};await f.call('purchases','POST',purchase,c,'buy-1');await f.call('purchases','POST',purchase,c,'buy-1');assert.equal((await f.call('products','GET',null,c)).data[0].stock,100000);await sale(f,c,p,cid);const expense={category:'Rent',amount:1000,date:new Date().toISOString().slice(0,10)};await f.call('expenses','POST',expense,c,'exp-1');await f.call('expenses','POST',expense,c,'exp-1');const report=(await f.call('dashboard','GET',null,c)).data.summary;assert.equal(report.expenses,1000);assert.equal(report.operating_profit,report.net_sales-report.cogs-1000);
}finally{f.db.close();}});
test('authentication, session expiry, logout, CSRF and security headers',async()=>{const f=fixture();try{const c=await account(f);assert.equal((await f.call('products')).status,401);assert.equal((await f.call('login','POST',{email:'ShopA@example.test',password:'incorrect password'})).status,401);assert.equal((await f.call('login','POST',{email:'ShopA@example.test',password:'correct horse battery staple'})).status,200);const csrf=await worker.fetch(new Request('http://localhost/api/products',{method:'POST',headers:{Origin:'https://evil.test',Cookie:c,'Content-Type':'application/json'},body:'{}'}),f.env);assert.equal(csrf.status,403);assert.equal(csrf.headers.get('X-Frame-Options'),'DENY');assert.match(csrf.headers.get('Content-Security-Policy'),/default-src 'self'/);await f.call('logout','POST',{},c);assert.equal((await f.call('me','GET',null,c)).status,401);
}finally{f.db.close();}});
test('platform owner access is explicit, recent-session only, and returns aggregates without customer data',async()=>{const f=fixture();try{const c=await account(f),who=await f.call('me','GET',null,c);f.env.OWNER_USER_ID=who.data.user.id;const admin=await f.call('admin','GET',null,c);assert.equal(admin.status,200);assert.equal(admin.data.accounts.total,1);assert.equal(JSON.stringify(admin.data).includes(who.data.user.email),false);f.db.sqlite.prepare('UPDATE sessions SET created_at=?').run(Date.now()-1000000);assert.equal((await f.call('admin','GET',null,c)).status,403);
}finally{f.db.close();}});
test('return prediction requires three intervals, deduplicates same-day purchases and uses median',()=>{assert.equal(predictReturn(['2026-01-01','2026-02-01','2026-03-01']).status,'insufficient_history');const prediction=predictReturn(['2026-01-01','2026-01-31','2026-03-02','2026-04-01','2026-04-01']);assert.equal(prediction.interval_days,30);assert.equal(prediction.expected_date,'2026-05-01');assert.equal(prediction.consistency,'regular');});
test('Kolkata reporting day rolls over at local midnight rather than UTC midnight',()=>{assert.equal(kolkataDay(Date.parse('2026-11-08T18:29:59Z')),'2026-11-08');assert.equal(kolkataDay(Date.parse('2026-11-08T18:30:00Z')),'2026-11-09');});
test('inline buyer creation is idempotent, tenant-scoped, and supplies the invoice WhatsApp snapshot',async()=>{const f=fixture();try{const a=await account(f),b=await account(f,'Other Buyer Shop');const details={name:'New Buyer',phone:'919876543210',state_code:'19'};const first=await f.call('customers','POST',details,a,'inline-buyer-1');assert.equal(first.status,201);const retry=await f.call('customers','POST',details,a,'inline-buyer-1');assert.equal(retry.status,200);assert.equal(retry.data.id,first.data.id);assert.equal((await f.call('customers','GET',null,a)).data.length,1);assert.equal((await f.call('customers','POST',{...details,name:'Changed'},a,'inline-buyer-1')).status,409);const other=await f.call('customers','POST',details,b,'inline-buyer-1');assert.equal(other.status,201);assert.notEqual(other.data.id,first.data.id);const p=await product(f,a);const inv=await sale(f,a,p,first.data.id);assert.equal(inv.data.customer.phone,details.phone);const noPhone=await f.call('customers','POST',{name:'No Phone'},a,'inline-no-phone');assert.equal(noPhone.status,201);assert.equal((await f.call('customers','GET',null,a)).data.find(x=>x.id===noPhone.data.id).phone,'');}finally{f.db.close();}});
test('price edits preserve invoice snapshots; customer history is tenant-scoped; numbering has no gap on failed invoice',async()=>{const f=fixture();try{const c=await account(f),b=await account(f,'Other Shop'),p=await product(f,c),cid=await customer(f,c);const first=await sale(f,c,p,cid);assert.match(first.data.number,/^\d{2}-000000001$/);assert.equal((await sale(f,c,p,cid,{items:[{product_id:p,quantity:99999999}],paid:0})).status,409);assert.equal((await f.call('products/'+p,'PATCH',{name:'New Rice',price:7000,unit:'kg',low_stock:5000,tax_bps:500,hsn:'1006'},c)).status,200);const second=await sale(f,c,p,cid);assert.match(second.data.number,/^\d{2}-000000002$/);assert.equal(second.data.total,35000);assert.equal((await f.call('invoices/'+first.data.id,'GET',null,c)).data.items[0].price,6000);assert.equal((await f.call('customers/'+cid,'GET',null,c)).data.invoices.length,2);assert.equal((await f.call('customers/'+cid,'GET',null,b)).status,404);assert.equal((await f.call('products/'+p,'PATCH',{name:'Attack',price:1},b)).status,404);
}finally{f.db.close();}});
test('cashier cannot change stock, purchase, export, profile or read platform admin',async()=>{const f=fixture();try{const c=await account(f),p=await product(f,c);f.db.sqlite.prepare("UPDATE members SET role='cashier'").run();assert.equal((await f.call('products','POST',{name:'Forbidden'},c)).status,403);assert.equal((await f.call('products/'+p,'PATCH',{name:'Forbidden'},c)).status,403);assert.equal((await f.call('purchases','POST',{},c)).status,403);assert.equal((await f.call('export','GET',null,c)).status,403);assert.equal((await f.call('business','PATCH',{},c)).status,403);assert.equal((await f.call('products','GET',null,c)).status,200);
}finally{f.db.close();}});
test('optimistic version check rejects stale draft lines even when enough stock remains',async()=>{const f=fixture();try{const c=await account(f),p=await product(f,c),cid=await customer(f,c);await sale(f,c,p,cid);const original=f.db.sqlite.prepare('SELECT * FROM invoice_items LIMIT 1').get();const iid=crypto.randomUUID();f.db.sqlite.prepare("INSERT INTO invoices(id,business_id,number,customer_id,business_snapshot,customer_snapshot,subtotal,cgst,sgst,igst,total,cogs,place_of_supply,idempotency_key) VALUES(?,?,?,?,'{}','{}',6000,0,0,0,6000,4000,'19',?)").run(iid,original.business_id,'stale-test',cid,'stale-key');assert.throws(()=>f.db.sqlite.prepare('INSERT INTO invoice_items(id,business_id,invoice_id,product_id,name,unit,hsn,quantity,price,cost,version,tax_bps,net,tax) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),original.business_id,iid,p,'Rice','kg','1006',1000,6000,4000,original.version,0,6000,0),/Product changed/);assert.equal((await f.call('products','GET',null,c)).data[0].stock,95000);
}finally{f.db.close();}});
test('invoice logos are owner-only, tenant-isolated, bounded raster data and do not duplicate financial snapshots',async()=>{const f=fixture();try{const a=await account(f),b=await account(f,'Brand Other'),p=await product(f,a),cid=await customer(f,a);const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSqcAAAAASUVORK5CYII=';assert.equal((await f.call('business/logo','POST',{logo_data:'https://evil.test/logo.svg'},a)).status,400);assert.equal((await f.call('business/logo','POST',{logo_data:'data:image/svg+xml;base64,PHN2Zz4='},a)).status,400);assert.equal((await f.call('business/logo','POST',{logo_data:logo},a)).status,200);assert.equal((await f.call('me','GET',null,b)).data.business.logo_data,'');const inv=await sale(f,a,p,cid);assert.equal(inv.status,201);assert.equal(inv.data.brand_logo,logo);assert.equal(JSON.parse(inv.data.business_snapshot).logo_data,undefined);assert.equal((await f.call('invoices/'+inv.data.id,'GET',null,b)).status,404);const uid=(await f.call('me','GET',null,a)).data.user.id;f.db.sqlite.prepare("UPDATE members SET role='cashier' WHERE user_id=?").run(uid);assert.equal((await f.call('business/logo','POST',{logo_data:''},a)).status,403);f.db.sqlite.prepare("UPDATE members SET role='owner' WHERE user_id=?").run(uid);assert.equal((await f.call('business/logo','POST',{logo_data:''},a)).status,200);const reread=(await f.call('invoices/'+inv.data.id,'GET',null,a)).data;assert.equal(reread.brand_logo,'');assert.equal(reread.total,inv.data.total);assert.equal(reread.paid,inv.data.paid);}finally{f.db.close();}});

test('invoice theme is validated, owner-only, and scoped to the business',async()=>{
 const f=fixture();
 try{
  const owner=await account(f,'Theme Shop'),other=await account(f,'Other Theme Shop');
  const change=(theme,cookie)=>f.call('business/invoice-theme','PATCH',{theme},cookie);
  assert.equal((await change('unrecognized',owner)).status,400);
  assert.equal((await change('midnight',owner)).data.theme,'midnight');
  const profile=(await f.call('me','GET',null,owner)).data;
  assert.equal(profile.business.invoice_theme,'midnight');
  assert.equal((await f.call('me','GET',null,other)).data.business.invoice_theme,'emerald');
  f.db.sqlite.prepare("UPDATE members SET role='cashier' WHERE user_id=?").run(profile.user.id);
  assert.equal((await change('classic',owner)).status,403);
 }finally{f.db.close();}
});

test('trash and restore update reports while preserving stock and original payment',async()=>{
 const f=fixture();
 try{
  const a=await account(f,'Trash Shop'),b=await account(f,'Other Trash Shop'),p=await product(f,a),cid=await customer(f,a);
  const created=await sale(f,a,p,cid),invoice=created.data,path='invoices/'+invoice.id;
  assert.equal(created.status,201);
  assert.equal((await f.call(path,'DELETE',{},b)).status,404);
  assert.equal((await f.call(path,'DELETE',{},a)).status,200);
  assert.equal((await f.call(path,'GET',null,a)).status,404);
  assert.equal((await f.call('invoices','GET',null,a)).data.length,0);
  assert.equal((await f.call('customers/'+cid,'GET',null,a)).data.invoices.length,0);
  assert.equal((await f.call('dashboard','GET',null,a)).data.summary.sales,0);
  assert.equal((await f.call('dues','GET',null,a)).data.length,0);
  assert.equal((await f.call('products','GET',null,a)).data[0].stock,95000);
  assert.equal((await f.call(path+'/payments','POST',{amount:100,method:'cash'},a,'trashed-payment')).status,409);
  assert.equal((await f.call('invoices/trash','GET',null,b)).data.length,0);
  assert.equal((await f.call('invoices/trash','GET',null,a)).data[0].id,invoice.id);
  assert.equal((await f.call(path+'/restore','POST',{},b)).status,404);
  assert.equal((await f.call(path+'/restore','POST',{},a)).status,200);
  assert.equal((await f.call('dashboard','GET',null,a)).data.summary.sales,invoice.total);
  assert.equal((await f.call(path,'GET',null,a)).data.paid,invoice.paid);
 }finally{f.db.close();}
});

test('trash purges the oldest invoice at 101 and scheduled cleanup expires 30-day items',async()=>{
 const f=fixture();
 try{
  const a=await account(f,'Capacity Shop'),p=await product(f,a),cid=await customer(f,a),key='oldest-sale';
  const {data:old}=await sale(f,a,p,cid,{},key);
  const bid=(await f.call('me','GET',null,a)).data.business.id;
  await f.call('invoices/'+old.id,'DELETE',{},a);
  const sql=f.db.sqlite,seed=sql.prepare("INSERT INTO invoices(id,business_id,number,business_snapshot,customer_snapshot,subtotal,cgst,sgst,igst,total,place_of_supply,status,idempotency_key) VALUES(?,?,?,'{}','{}',0,0,0,0,0,'19','void',?)");
  for(let i=0;i<100;i++){
   const id=crypto.randomUUID();seed.run(id,bid,'QA-'+i,id);
   sql.prepare('UPDATE invoices SET deleted_at=?,trash_order=? WHERE business_id=? AND id=?').run(Date.now(),i+2,bid,id);
  }
  assert.equal((await f.call('invoices/trash','GET',null,a)).data.length,100);
  for(const table of ['invoices','payments','invoice_items']){
   const col=table==='invoices'?'id':'invoice_id';
   assert.equal(sql.prepare('SELECT COUNT(*) count FROM '+table+' WHERE business_id=? AND '+col+'=?').get(bid,old.id).count,0);
  }
  assert.equal((await sale(f,a,p,cid,{},key)).status,410);
  const oldest=sql.prepare('SELECT id FROM invoices WHERE business_id=? ORDER BY trash_order LIMIT 1').get(bid).id;
  sql.prepare('UPDATE invoices SET deleted_at=? WHERE business_id=? AND id=?').run(Date.now()-31*86400000,bid,oldest);
  assert.equal((await f.call('invoices/'+oldest+'/restore','POST',{},a)).status,404);
  await worker.scheduled({},f.env);
  assert.equal(sql.prepare('SELECT COUNT(*) count FROM invoices WHERE business_id=?').get(bid).count,99);
 }finally{f.db.close();}
});

test('business profile logos can be set on signup and stay separate from invoice logos',async()=>{
 const f=fixture();
 try{
  const logo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSqcAAAAASUVORK5CYII=';
  const signup=await f.call('register','POST',{name:'Profile Logo Shop',email:'logo-profile@example.test',password:'correct horse battery staple',profile_logo_data:logo});
  assert.equal(signup.status,201);
  const a=signup.cookie,b=await account(f,'Other Logo Shop');
  const profile=(await f.call('me','GET',null,a)).data;
  assert.equal(profile.business.profile_logo_data,logo);
  assert.equal(profile.business.logo_data,'');
  assert.equal((await f.call('me','GET',null,b)).data.business.profile_logo_data,'');
  const p=await product(f,a),cid=await customer(f,a),inv=await sale(f,a,p,cid);
  assert.equal(inv.data.brand_logo,'');
  assert.equal(JSON.parse(inv.data.business_snapshot).profile_logo_data,undefined);
  const bytes=Buffer.from(logo.slice(22),'base64');bytes.writeUInt32BE(2,16);
  assert.equal((await f.call('business/profile-logo','POST',{logo_data:'data:image/png;base64,'+bytes.toString('base64')},a)).status,400);
  f.db.sqlite.prepare("UPDATE members SET role='cashier' WHERE user_id=?").run(profile.user.id);
  assert.equal((await f.call('business/profile-logo','POST',{logo_data:''},a)).status,403);
  f.db.sqlite.prepare("UPDATE members SET role='owner' WHERE user_id=?").run(profile.user.id);
  assert.equal((await f.call('business/profile-logo','POST',{logo_data:''},a)).status,200);
  assert.equal((await f.call('me','GET',null,a)).data.business.profile_logo_data,'');
 }finally{f.db.close();}
});

test('restaurant anonymous orders, manual billing, paid totals and session isolation',async()=>{
 const f=fixture();
 try{
  const signup=await f.call('register','POST',{name:'Restaurant QA',email:'restaurant@example.test',password:'correct horse battery staple',category:'restaurant'});
  const a=signup.cookie,other=await account(f,'Non Restaurant');
  assert.equal((await f.call('restaurant/state','GET',null,other)).data.tables.length,0);
  const p=await product(f,a,{name:'Biryani',kind:'service',price:1200,stock:0});
  assert.equal((await f.call('restaurant/table','POST',{name:'Table 1'},a)).status,200);
  assert.equal((await f.call('restaurant/menu','POST',{id:p,section:'Mains',available:true},a)).status,200);
  const state=async()=> (await f.call('restaurant/state','GET',null,a)).data;
  const table=(await state()).tables[0],menu='menu/'+table.qr_token;
  const doAction=(endpoint,data)=>f.call('restaurant/'+endpoint,'POST',data,a);
  assert.equal((await doAction('session',{action:'open',table:table.id})).status,200);
  const publicMenu=(await f.call(menu)).data,session=publicMenu.session;
  assert.equal(publicMenu.items[0].name,'Biryani');
  const payload={session,items:[{id:p,quantity:1}]};
  const placed=await f.call(menu+'/order','POST',payload,'','first');
  assert.equal(placed.status,201);
  assert.equal((await f.call(menu+'/order','POST',payload,'','first')).data.id,placed.data.id);
  assert.equal((await f.call(menu+'/order','POST',payload,'','second')).status,201);
  assert.equal((await f.call(menu+'/request','POST',{session,kind:'waiter'})).status,200);
  await f.call(menu+'/request','POST',{session,kind:'waiter'});
  assert.equal((await state()).requests.length,1);
  await doAction('menu',{id:p,section:'Mains',available:false});
  assert.equal((await f.call(menu+'/order','POST',payload,'','unavailable')).status,409);
  assert.equal((await f.call(menu+'/request','POST',{session,kind:'bill'})).status,200);
  const billAlert=(await state()).requests.find(request=>request.kind==='bill');
  assert.ok(billAlert);
  assert.equal((await doAction('acknowledge',{id:billAlert.id})).status,200);
  assert.equal((await state()).requests.some(request=>request.id===billAlert.id),false);
  f.db.sqlite.prepare('UPDATE products SET price=2000 WHERE id=?').run(p);
  const charge=await product(f,a,{name:'Service charge',kind:'service',stock:0});
  const bill={dining_session:session,paid:0,discount:300,override:{product:p,rate:1100},charge:{product:charge,amount:200},adjustment_reason:'Customer agreement'};
  assert.equal((await f.call('invoices','POST',bill,a,'bill')).status,409);
  for(const order of (await state()).orders)for(const status of ['accepted','preparing','ready','served'])assert.equal((await doAction('order',{id:order.id,status})).status,200);
  const billed=await f.call('invoices','POST',bill,a,'bill');
  assert.equal(billed.status,201);
  assert.equal(billed.data.total,2100);
  assert.equal(billed.data.restaurant_bill.discount,300);
  const adjustments=JSON.parse(billed.data.restaurant_bill.adjustments);
  assert.equal(adjustments.override.original,2400);
  assert.equal(adjustments.charge.amount,200);
  assert.equal(adjustments.reason,'Customer agreement');
  assert.equal((await state()).sales,0);
  const path='invoices/'+billed.data.id+'/payments',payment={amount:2100,method:'cash'};
  assert.equal((await f.call(path,'POST',payment,a,'pay')).status,200);
  assert.equal((await f.call(path,'POST',payment,a,'pay')).status,200);
  assert.equal((await state()).sales,2100);
  const report=(await f.call('restaurant/reports','GET',null,a)).data;
  assert.equal(report.collections.daily,2100);
  assert.equal(report.completed,2);
  assert.equal(report.popular[0].quantity,2000);
  assert.equal(report.payments.length,1);
  assert.equal((await doAction('session',{action:'clean',session})).status,200);
  assert.equal((await doAction('session',{action:'close',session})).status,200);
  await doAction('session',{action:'open',table:table.id});
  assert.equal((await f.call(menu+'/order','POST',payload,'','old-session')).status,409);
 }finally{f.db.close();}
});


test('restaurant employee permissions are enforced independently and revocation ends the session',async()=>{
 const f=fixture();
 try{
  const signup=await f.call('register','POST',{name:'Permission Cafe',email:'permission-cafe@example.test',password:'correct horse battery staple',category:'restaurant'});
  const owner=signup.cookie,employee=await account(f,'Employee'),other=await account(f,'Other Permission Shop');
  const {business}= (await f.call('me','GET',null,owner)).data;
  const {user}= (await f.call('me','GET',null,employee)).data;
  const email='crew.test@gmail.com',access={email,role:'staff',cashier:false,reports:false};
  assert.equal((await f.call('restaurant/staff','GET',null,other)).data.length,0);
  assert.equal((await f.call('restaurant/staff','POST',access,owner)).status,200);
  const db=f.db.sqlite;
  db.prepare("INSERT INTO members(user_id,business_id,role) VALUES(?,?,'cashier')").run(user.id,business.id);
  db.prepare('UPDATE restaurant_staff SET user_id=? WHERE business_id=? AND email=?').run(user.id,business.id,email);
  db.prepare('UPDATE sessions SET business_id=? WHERE user_id=?').run(business.id,user.id);
  assert.equal((await f.call('restaurant/state','GET',null,employee)).data.sales,null);
  const tableRoute=(path,data)=>f.call('restaurant/'+path,'POST',data,owner);
  await tableRoute('table',{name:'Assigned'});
  const table=(await f.call('restaurant/state','GET',null,owner)).data.tables[0];
  const otherMember=await account(f,'Backup Crew'),otherUser=(await f.call('me','GET',null,otherMember)).data.user.id;
  await tableRoute('staff',{...access,email:'backup@gmail.com'});
  db.prepare("UPDATE restaurant_staff SET user_id=? WHERE business_id=? AND email='backup@gmail.com'").run(otherUser,business.id);
  db.prepare("INSERT INTO members VALUES(?,?,'cashier')").run(otherUser,business.id);
  db.prepare('UPDATE sessions SET business_id=? WHERE user_id=?').run(business.id,otherUser);
  assert.equal((await tableRoute('assign',{table:table.id,email:'backup@gmail.com'})).status,200);
  assert.equal((await f.call('restaurant/state','GET',null,employee)).data.tables.length,0);
  assert.equal((await f.call('restaurant/session','POST',{action:'open',table:table.id},employee)).status,404);
  assert.equal((await f.call('restaurant/state','GET',null,otherMember)).data.tables.length,1);
  await f.call('logout','POST',{},otherMember);
  assert.equal((await f.call('restaurant/state','GET',null,employee)).data.tables.length,1);
  const ingredient=await product(f,owner);
  assert.equal((await tableRoute('ingredient',{product:ingredient,category:'Dry goods'})).status,200);
  const waste={product:ingredient,quantity:1000,reason:'Spilled',date:kolkataDay()};
  assert.equal((await f.call('restaurant/wastage','POST',waste,employee,'waste')).status,403);
  assert.equal((await f.call('restaurant/wastage','POST',waste,owner,'waste')).status,200);
  assert.equal((await f.call('restaurant/wastage','POST',waste,owner,'waste')).status,200);
  const inventory=(await f.call('products','GET',null,owner)).data[0];
  assert.equal(inventory.stock,99000);
  assert.equal(inventory.ingredient_category,'Dry goods');
  assert.equal((await f.call('restaurant/state','GET',null,owner)).data.wastage[0].cost,4000);
  assert.equal((await f.call('restaurant/staff','GET',null,employee)).status,403);
  assert.equal((await f.call('restaurant/reports','GET',null,employee)).status,403);
  assert.equal((await f.call('dashboard','GET',null,employee)).status,403);
  assert.equal((await f.call('invoices','POST',{},employee,'denied')).status,403);
  assert.equal((await f.call('business/logo','POST',{logo_data:''},employee)).status,403);
  assert.equal((await f.call('restaurant/staff','POST',{...access,role:'manager',reports:true},owner)).status,200);
  const report=await f.call('restaurant/reports','GET',null,employee);
  assert.equal(report.status,200);
  assert.deepEqual(report.data.collections,{daily:0,weekly:0,monthly:0});
  assert.equal((await f.call('invoices','POST',{},employee,'still-denied')).status,403);
  assert.equal((await f.call('restaurant/staff','POST',{...access,cashier:true},owner)).status,200);
  assert.equal((await f.call('restaurant/reports','GET',null,employee)).status,403);
  assert.equal((await f.call('invoices','POST',{dining_session:crypto.randomUUID()},employee,'cashier-path')).status,409);
  assert.equal((await f.call('restaurant/staff','POST',{email,revoke:true},owner)).status,200);
  assert.equal((await f.call('restaurant/state','GET',null,employee)).status,401);
 }finally{f.db.close();}
});

test('ROS forces restaurant workspaces and ignores the BOS session cookie',async()=>{
 const f=fixture();
 try{
  const result=await f.call('register','POST',{name:'ROS QA',category:'retail',email:'ros-qa@example.test',password:'correct horse battery staple'});
  assert.equal(result.status,201);
  assert.match(result.cookie,/^ros_session=/);
  assert.equal((await f.call('me','GET',null,result.cookie.replace('ros_session=','ox_session='))).status,401);
  const profile=(await f.call('me','GET',null,result.cookie)).data.business;
  assert.equal(profile.category,'restaurant');
  assert.equal((await f.call('business','PATCH',{...profile,category:'retail'},result.cookie)).status,200);
  assert.equal((await f.call('me','GET',null,result.cookie)).data.business.category,'restaurant');
 }finally{f.db.close();}
});
