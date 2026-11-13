import {formatMoney,currencyScale} from './currency.js';
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function showTableQR(table){
 const {default:createQR}=await import('./restaurant-qr.js');
 const qr=createQR(0,'M');qr.addData(new URL('/menu/'+table.token,location.origin).href);qr.make();
 const popup=document.createElement('dialog');popup.className='restaurant-qr-dialog';
 const heading=document.createElement('h2');heading.textContent=table.name;
 const image=document.createElement('img');image.src=qr.createDataURL(7);image.alt='Table menu QR code';
 const print=document.createElement('button');print.className='primary';print.textContent='Print QR';print.addEventListener('click',()=>window.print());
 const close=document.createElement('button');close.className='outline';close.textContent='Close';close.addEventListener('click',()=>popup.close());
 popup.append(heading,image,print,close);popup.addEventListener('close',()=>popup.remove(),{once:true});document.body.append(popup);popup.showModal();
}
const states=['new','accepted','preparing','ready','served'];
const label=value=>value[0].toUpperCase()+value.slice(1);

async function request(path,data,key){
 const response=await fetch('/api/'+path,data?{method:'POST',headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(data)}:undefined);
 const result=await response.json();
 if(!response.ok)throw Error(result.error);
 return result;
}

export async function publicRestaurantMenu(host,token){
 const path='menu/'+token;
 try{
  const menu=await request(path),money=value=>formatMoney(value,menu.currency);
  const sections=[...new Set(menu.items.map(item=>item.section))];
  host.innerHTML=`<main class="restaurant-public"><header class="panel"><h1>${e(menu.name)}</h1><p>Table ${e(menu.table)}</p><p>${e(menu.profile?.description)}</p>${menu.profile?.opens&&menu.profile?.closes?`<p>${e(menu.profile.opens)}–${e(menu.profile.closes)}</p>`:''}${menu.logo?`<img class="restaurant-logo" src="${e(menu.logo)}" alt="">`:''}</header>
   <form><div class="restaurant-cards">${sections.map(section=>`<section class="panel"><h2>${e(section)}</h2>${menu.items.filter(item=>item.section===section).map(item=>`<label class="restaurant-food ${item.available?'':'unavailable'}">${item.photo_revision?`<img class="restaurant-food-photo" src="/api/${path}/photo/${e(item.id)}" alt="" loading="lazy" width="64" height="64">`: ''}<strong>${e(item.name)} · ${money(item.price)}</strong><span>${e(item.description)}</span>${item.available?`<input type="number" min="0" max="30" value="0" data-item="${e(item.id)}" aria-label="Quantity: ${e(item.name)}" ${menu.session?'':'disabled'}>`:'<span>Not available right now.</span>'}</label>`).join('')}</section>`).join('')}</div>
   <section class="panel"><strong data-total></strong><details><summary>Optional contact details</summary><p>Your details will be shared with this restaurant for this order and its bill.</p><label>Name<input name="name" maxlength="120"></label><label>WhatsApp number<input name="phone" type="tel" maxlength="20"></label><label>Short address<input name="address" maxlength="250"></label></details><div class="restaurant-actions"><button class="primary" ${menu.session?'':'disabled'}>Place order</button><button type="button" class="outline" data-request="waiter" ${menu.session?'':'disabled'}>Call waiter</button><button type="button" class="outline" data-request="bill" ${menu.session?'':'disabled'}>Request bill</button></div><p role="status">${menu.session?'':'Ask staff to open this table, then reload the menu.'}</p></section></form></main>`;
  const form=host.querySelector('form'),status=form.querySelector('[role=status]');
  const items=()=>[...form.querySelectorAll('[data-item]')].filter(input=>Number(input.value)>0).map(input=>({id:input.dataset.item,quantity:Number(input.value)}));
  const total=()=>form.querySelector('[data-total]').textContent='Cart total · '+money(items().reduce((sum,line)=>sum+line.quantity*menu.items.find(item=>item.id===line.id).price,0));
  form.addEventListener('input',total);total();
  let operation='',fingerprint='',pending=false;
  form.addEventListener('submit',async event=>{
   event.preventDefault();event.stopPropagation();if(pending)return;
   const input={...Object.fromEntries(new FormData(form)),session:menu.session,items:items()};
   if(!input.items.length){status.textContent='Choose at least one item.';return;}
   if(JSON.stringify(input)!==fingerprint){fingerprint=JSON.stringify(input);operation=crypto.randomUUID();}
   pending=true;const button=form.querySelector('button.primary');button.disabled=true;
   try{await request(path+'/order',input,operation);form.reset();total();fingerprint='';status.textContent='Order received.';}
   catch(error){status.textContent=error.message;}finally{pending=false;button.disabled=false;}
  });
  for(const button of form.querySelectorAll('[data-request]'))button.addEventListener('click',async()=>{
   button.disabled=true;
   try{await request(path+'/request',{session:menu.session,kind:button.dataset.request});status.textContent='Request sent to staff.';}
   catch(error){status.textContent=error.message;}finally{setTimeout(()=>button.disabled=false,3000);}
  });
 }catch(error){host.textContent=error.message;}
}

export function mountRestaurant(host,{api,business,owner,staff,products,section,showInvoice,formRevision}){
 const canBill=!staff||staff.cashier;
 const managesTables=owner||staff?.role==='manager';
 const canReport=!staff||staff.reports;
 let busy=false,refreshing=false,lastAlerts=null,lastState='';
 const money=value=>formatMoney(value,business.currency);
 const push=document.createElement('button');push.type='button';push.className='outline';push.textContent='Enable device alerts';push.hidden=true;host.append(push);
 if('serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window){
  void api('restaurant/push').then(({key})=>{if(!key||!host.isConnected)return;push.hidden=Notification.permission==='denied';push.onclick=async()=>{
   push.disabled=true;
   try{
    if(await Notification.requestPermission()!=='granted'){push.hidden=true;return;}
    const worker=await navigator.serviceWorker.ready;
    const subscription=await worker.pushManager.getSubscription()||await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await api('restaurant/push','POST',{endpoint:subscription.endpoint});push.textContent='Device alerts enabled';
   }catch(error){status.textContent=error.message;push.disabled=false;}
  };}).catch(()=>{});
 }
 const status=document.createElement('p');status.setAttribute('role','status');host.append(status);
 const content=document.createElement('div');host.append(content);
 const field=(name,placeholder,value='')=>`<input name="${name}" aria-label="${placeholder}" placeholder="${placeholder}" value="${e(value)}">`;
 const action=(endpoint,title,values)=>`<button type="button" class="outline" data-endpoint="${endpoint}" data-values="${e(JSON.stringify(values))}">${title}</button>`;
 function paint(state){
  const tables=state.tables.filter(table=>table.active);
  const shown=section==='orders'?state.tables.filter(table=>table.session&&table.state==='open'):section==='billing'?state.tables.filter(table=>table.session&&table.state!=='cleaning'):state.tables;
  content.innerHTML=`<div class="restaurant-metrics">${state.sales===null?'':`<strong>Paid today · ${money(state.sales)}</strong>`}<span>Available · ${tables.filter(table=>!table.session).length}</span><span>Active · ${tables.filter(table=>table.session).length}</span><span>New orders · ${state.orders.filter(order=>order.status==='new').length}</span><span>Preparing · ${state.orders.filter(order=>order.status==='preparing').length}</span><span>Waiter calls · ${state.requests.filter(item=>item.kind==='waiter').length}</span><span>Bill requests · ${state.requests.filter(item=>item.kind==='bill').length}</span><span>Unpaid bills · ${tables.filter(table=>table.invoice_id&&table.paid<table.total).length}</span></div>
  ${owner&&section==='staff'?`<details open><summary>Team and permissions</summary><form data-endpoint="staff" class="panel"><label>Gmail address<input type="email" name="email" required></label><label>Role<select name="role"><option value="staff">Staff</option><option value="manager">Manager</option></select></label><label><input type="checkbox" name="cashier"> Cashier access</label><label><input type="checkbox" name="reports"> Reports access</label><button class="primary">Save access</button></form>${state.team.map(member=>`<div class="restaurant-actions"><span>${e(member.email)} · ${e(member.role)}</span><input aria-label="Invitation link" readonly value="${e(location.origin+'/api/auth/google/start?invite='+member.token)}">${action('staff','Revoke access',{email:member.email,revoke:true})}</div>`).join('')}</details>`:''}
  ${managesTables&&section==='restaurant'?`<form data-endpoint="table" class="restaurant-actions">${field('name','Table name')}<button class="primary">Add table</button></form>`:''}
  ${[undefined,'orders','restaurant','billing'].includes(section)?`<div class="restaurant-cards">${shown.map(table=>{
   const orders=state.orders.filter(order=>order.session_id===table.session),requests=state.requests.filter(item=>item.session_id===table.session);
   const paid=table.settled;
   const running=orders.flatMap(order=>JSON.parse(order.lines)).reduce((sum,item)=>sum+item.price*item.quantity,0);
   return `<article class="panel restaurant-table"><h3>${e(table.name)}</h3><span class="badge green">${!table.active?'Inactive':!table.session?'Available':table.state==='cleaning'?'Cleaning':paid?'Paid':table.invoice_id?'Awaiting payment':'Occupied'}</span>
   ${managesTables?`<details><summary>Table settings</summary><form data-endpoint="assign"><input type="hidden" name="table" value="${e(table.id)}"><label>Assigned employee<select name="email"><option value="">Anyone on duty</option>${state.assignees.map(person=>`<option ${person.email===table.assignee?'selected':''}>${e(person.email)}</option>`).join('')}</select></label><button class="outline">Save assignment</button></form><form data-endpoint="table">${field('id','Table ID',table.id).replace('<input ','<input type="hidden" ')}${field('name','Table name',table.name)}<button class="outline">Save name</button></form>${table.qr_token?`<a href="/menu/${table.qr_token}" target="_blank" rel="noopener">Open table menu</a>${action('qr','Table QR',{token:table.qr_token,name:table.name})}`:''}<div>${action('table',table.active?'Deactivate':'Activate',{id:table.id,name:table.name,active:!table.active})}</div></details>`:''}
   ${!table.session&&table.active?action('session','Open table',{action:'open',table:table.id}):''}
   ${orders.map(order=>`<div><strong>${label(order.status)}</strong><ul>${JSON.parse(order.lines).map(line=>`<li>${line.quantity} × ${e(line.name)}${canBill?' · '+money(line.price):''}</li>`).join('')}</ul>${order.status==='served'?'':action('order',label(states[states.indexOf(order.status)+1]),{id:order.id,status:states[states.indexOf(order.status)+1]})}</div>`).join('')}
   ${requests.map(item=>`<div class="banner">${item.kind==='waiter'?'Waiter requested':'Bill requested'} ${action('acknowledge','Acknowledge',{id:item.id})}</div>`).join('')}
   ${canBill&&table.state==='open'&&orders.length?`<strong>Running total · ${money(running)}</strong>`:''}
   ${canBill&&table.state==='open'&&orders.length&&orders.every(order=>order.status==='served')?action('bill','Generate bill',{session:table.session,running,items:[...new Map(orders.flatMap(order=>JSON.parse(order.lines)).map(item=>[item.id,item.name]))],charges:state.chargeItems}):''}
   ${canBill&&table.invoice_id?action('view','View invoice',{id:table.invoice_id}):''}
   ${canBill&&table.invoice_id&&!paid?action('paid','Mark as paid',{id:table.invoice_id,amount:table.total-table.paid,currency:table.currency}):''}
   ${(paid&&table.state==='billed'||table.state==='open'&&!orders.length)?action('session','Start cleaning',{action:'clean',session:table.session}):''}
   ${table.state==='cleaning'?action('session','Table ready',{action:'close',session:table.session}):''}</article>`;
  }).join('')}</div>`:''}
  ${owner&&section==='inventory'&&products.length?`<details><summary>Ingredients and wastage</summary><p>Use BOS Inventory for units and low-stock thresholds, and Purchases for supplier, cost and purchase date.</p>${products.filter(item=>item.kind==='product').map(item=>`<div class="panel"><strong>${e(item.name)} · ${item.stock/1000} ${e(item.unit)}</strong><form data-endpoint="ingredient"><input type="hidden" name="product" value="${e(item.id)}">${field('category','Ingredient category',item.ingredient_category)}<button class="outline">Save category</button></form><form data-endpoint="wastage"><input type="hidden" name="product" value="${e(item.id)}"><label>Wasted quantity<input name="quantity" type="number" min=".001" step=".001" required></label>${field('reason','Reason')}<label>Date<input name="date" type="date" value="${new Date(Date.now()+19800000).toISOString().slice(0,10)}" required></label><button class="outline">Record wastage</button></form></div>`).join('')}${state.wastage.map(row=>`<p>${e(row.occurred_on)} · ${e(row.name)} · ${row.quantity/1000} · ${formatMoney(row.cost,row.currency)} · ${e(row.reason)}</p>`).join('')}</details>`:''}
  ${canReport?action('reports','Restaurant reports',{}):''}
  ${state.recent.length?`<details><summary>Recent restaurant bills</summary>${state.recent.map(bill=>`<div class="restaurant-actions"><strong>${e(bill.table_name)} · ${e(bill.number)}</strong><span>${formatMoney(bill.total,bill.currency)} · ${bill.total===bill.paid?'Paid':'Unpaid'}</span>${action('view','View invoice',{id:bill.id})}</div>`).join('')}</details>`:''}
  ${owner&&section==='settings'?`<details open><summary>Restaurant profile</summary><form data-endpoint="profile" class="panel">${field('whatsapp','WhatsApp number',state.profile?.whatsapp)}${field('fssai','FSSAI number',state.profile?.fssai)}${field('opens','Opening time (HH:MM)',state.profile?.opens)}${field('closes','Closing time (HH:MM)',state.profile?.closes)}${field('description','Restaurant description',state.profile?.description)}<button class="outline">Save restaurant profile</button></form></details>`:''}
  ${owner&&section==='food'?`<details open><summary>Food menu management</summary><p>Add food from this page. Set its price and photo there, then publish it here.</p>${products.map(product=>({...product,...state.menu.find(item=>item.product_id===product.id)})).map(item=>`<form data-endpoint="menu" class="panel"><strong>${e(item.name)} · ${money(item.price)}</strong><input type="hidden" name="id" value="${e(item.id)}">${field('section','Menu category',item.section||'Menu')}${field('description','Description',item.description||'')}<label><input type="checkbox" name="available" ${item.available?'checked':''}> Available</label><button class="outline">Save menu item</button></form>`).join('')}</details>`:''}`;
 }
 async function refresh(force=false){
  if(refreshing||!host.isConnected)return;
  if(!force&&busy)return;
  refreshing=true;
  try{const [state,team]=await Promise.all([api('restaurant/state'),owner?api('restaurant/staff'):[]]);state.team=team;if(!host.isConnected)return;const alerts=[...state.orders.filter(order=>order.status==='new'),...state.requests].map(item=>item.id);if(lastAlerts&&alerts.some(id=>!lastAlerts.includes(id))){status.textContent='New table activity · '+alerts.length+' pending';navigator.vibrate?.(150);}lastAlerts=alerts;const snapshot=JSON.stringify(state);if(force||snapshot!==lastState&&!host.querySelector('details[open]')&&!host.contains(document.activeElement)){lastState=snapshot;paint(state);}}
  catch(error){status.textContent=error.message;}finally{refreshing=false;}
 }
 async function submit(endpoint,values){
  if(busy)return;
  busy=true;
  try{
   if(endpoint==='bill'){
    const popup=document.createElement('dialog'),scale=currencyScale(business.currency);
    popup.innerHTML=`<form method="dialog"><h2>Review table bill</h2><p>Items before tax · ${money(values.running)}</p><details><summary>Price adjustment or additional charge</summary><label>Ordered item<select name="override"><option value="">No price override</option>${values.items.map(([id,name])=>`<option value="${e(id)}">${e(name)}</option>`).join('')}</select></label><label>New unit price<input name="rate" type="number" min="0" step="any"></label><label>Charge service<select name="charge"><option value="">No additional charge</option>${values.charges.map(item=>`<option value="${e(item.id)}">${e(item.name)}</option>`).join('')}</select></label><label>Charge amount<input name="chargeAmount" type="number" min="0" step="any"></label></details><label>Adjustment reason<input name="adjustment_reason" maxlength="200"></label><label>Discount<input name="discount" type="number" min="0" step="${1/scale}" value="0" required></label><div class="restaurant-actions"><button class="outline" value="cancel" formnovalidate>Cancel</button><button class="primary" value="create">Create unpaid bill</button></div></form>`;
    document.body.append(popup);popup.showModal();
    const input=await new Promise(resolve=>popup.addEventListener('close',()=>{resolve(popup.returnValue==='create'?Object.fromEntries(new FormData(popup.querySelector('form'))):null);popup.remove();},{once:true}));
    if(!input)return;
    const minor=value=>value===''?null:Math.round(Number(value)*scale);
    const discount=minor(input.discount);
    const override=input.override?{product:input.override,rate:minor(input.rate)}:undefined;
    const charge=input.charge?{product:input.charge,amount:minor(input.chargeAmount)}:undefined;
    const invoice=await api('invoices','POST',{dining_session:values.session,form_revision:formRevision,paid:0,discount,override,charge,adjustment_reason:input.adjustment_reason},'restaurant-'+values.session);
    await showInvoice(invoice.id);
   }
   else if(endpoint==='reports'){
    const report=await api('restaurant/reports'),format=value=>formatMoney(value,report.currency);
    const popup=document.createElement('dialog');
    popup.innerHTML=`<div class="dialog-heading"><h2>Restaurant reports</h2><button type="button" class="outline">Close</button></div>
    <section class="panel"><h3>Paid collections</h3><details open><summary>Show / hide chart</summary><div class="restaurant-report-chart" role="img" aria-label="Daily paid collections over 30 days"></div></details><p>Today · ${format(report.collections.daily)}</p><p>Last 7 days · ${format(report.collections.weekly)}</p><p>This month · ${format(report.collections.monthly)}</p><p>Outstanding · ${format(report.outstanding)}</p><p>Completed orders · ${report.completed}</p><p>Expenses this month · ${format(report.expenses)}</p><p>Accrual operating profit this month · ${format(report.operatingProfit)}</p></section>
    <section class="panel"><h3>Popular items</h3>${report.popular.map(row=>`<p>${e(row.name)} · ${row.quantity/1000}</p>`).join('')}</section>
    <section class="panel"><h3>Table order history</h3>${report.history.map(row=>`<p>${e(row.table_name)} · ${e(row.created_at)} · ${e(row.status)} · ${JSON.parse(row.lines).map(line=>`${line.quantity} × ${e(line.name)}`).join(', ')}</p>`).join('')}</section>
    <section class="panel"><h3>Payments</h3>${report.payments.map(row=>`<p>${e(row.table_name)} · ${e(row.number)} · ${format(row.amount)} · ${e(row.method)} · ${e(row.created_at)}</p>`).join('')}</section>`;
    const chart=popup.querySelector('.restaurant-report-chart'),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 600 150');svg.setAttribute('aria-hidden','true');
    const max=Math.max(1,...report.series.map(row=>row.amount)),days=new Map(report.series.map(row=>[row.day,row.amount]));
    const end=new Date(Date.now()+19800000).toISOString().slice(0,10);
    for(let i=0;i<30;i++){
     const day=new Date(Date.parse(end)-(29-i)*86400000).toISOString().slice(0,10),amount=days.get(day)||0;
     const bar=document.createElementNS(ns,'rect'),title=document.createElementNS(ns,'title'),height=amount/max*130;
     bar.setAttribute('x',String(i*20+3));bar.setAttribute('y',String(145-height));bar.setAttribute('width','14');bar.setAttribute('height',String(height));bar.setAttribute('fill','#098638');bar.setAttribute('rx','3');title.textContent=day+' · '+format(amount);bar.append(title);svg.append(bar);
    }
    chart.append(svg);
    popup.querySelector('button').onclick=()=>popup.close();
    popup.addEventListener('close',()=>popup.remove(),{once:true});
    document.body.append(popup);popup.showModal();
   }
   else if(endpoint==='qr')await showTableQR(values);
   else if(endpoint==='view')await showInvoice(values.id);
   else if(endpoint==='paid'){
    const popup=document.createElement('dialog');
    popup.innerHTML=`<form method="dialog"><h2>Confirm payment</h2><p>Record only after receiving ${formatMoney(values.amount,values.currency)}.</p><label>Payment method<select name="method"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option></select></label><div class="restaurant-actions"><button class="outline" value="cancel">Cancel</button><button class="primary" value="paid">Mark as paid</button></div></form>`;
    popup.querySelector('form').addEventListener('submit',event=>{event.stopPropagation();});
    document.body.append(popup);popup.showModal();
    const method=await new Promise(resolve=>popup.addEventListener('close',()=>{resolve(popup.returnValue==='paid'?popup.querySelector('select').value:null);popup.remove();},{once:true}));
    if(!method)return;
    await api('invoices/'+values.id+'/payments','POST',{amount:values.amount,method},'restaurant-paid-'+values.id);
   }else{
    await api('restaurant/'+endpoint,'POST',values,values.operation);
    if(owner&&['ingredient','wastage'].includes(endpoint))products=await api('products');
   }
   status.textContent='Saved.';
  }catch(error){status.textContent=error.message;}
  finally{busy=false;await refresh(true);}
 }
 host.addEventListener('submit',event=>{
  const form=event.target;if(!form.dataset.endpoint)return;
  event.preventDefault();event.stopPropagation();
  const values=Object.fromEntries(new FormData(form));if(form.dataset.endpoint==='wastage'){values.quantity=Math.round(Number(values.quantity)*1000);form.dataset.operation||=crypto.randomUUID();values.operation=form.dataset.operation;}if(form.dataset.endpoint==='menu')values.available=values.available==='on';if(form.dataset.endpoint==='staff'){values.cashier=values.cashier==='on';values.reports=values.reports==='on';}
  void submit(form.dataset.endpoint,values);
 });
 host.addEventListener('click',event=>{const button=event.target.closest('button[data-values]');if(button)void submit(button.dataset.endpoint,JSON.parse(button.dataset.values));});
 void refresh(true);
 const timer=setInterval(()=>{if(!host.isConnected)clearInterval(timer);else if(!document.hidden)void refresh();},4000);
}
