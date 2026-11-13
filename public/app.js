import {restaurantNavigation} from './ros-navigation.js';
import {mountRestaurant,publicRestaurantMenu} from './restaurant.js';
import {mountWorkspaceLogo} from './workspace-logo.js';
import {whatsappInvoiceMessage} from './whatsapp-invoice.js';
import {createPageCache} from './page-cache.js';
import {formatMoney,currencyScale,currencyDigits,currencySymbol,currencyChoices,countries} from './currency.js';
import {recordExtras} from './form-records.js';
import {mountFormBuilder,applyBusinessForm,applyInvoiceFields,invoiceTranslator,configuredBody,formValues,addCustomFields} from './business-forms.js';
import {mountProductPhoto,photoURL} from './product-photo.js';
import {decorateWorkspace,themeSelects,mountGrowthChart} from './workspace-design.js';
import {invoicePNG,invoicePDF,mountInvoiceLogo,invoiceThemes,renderInvoicePages} from './invoice-export.js';
import {showInvoiceSaving,celebrateSale} from './sale-feedback.js';
import {mountProductPicker,polishInvoiceGuide,themeInvoicePayment,uiIcon} from './invoice-design.js';
import {mountInvoiceGuide,buyerPhone} from './guided-invoice.js';
import {enhanceWorkspace,enhanceModal,enhanceCart} from './easy-ui.js';
const translations=await fetch('/i18n.json').then(r=>r.json());
let language=localStorage.getItem('ox_language')||'en',me=null,page='dashboard',data={},cart=[],pendingInstall=null,authMode='login',invoiceKey=crypto.randomUUID(),providers={google:false};
const app=document.querySelector('#app'),dialog=document.querySelector('#dialog');
const t=k=>(translations[language]?.[k]||translations.en[k]||k).replaceAll('₹',currencySymbol(me?.business.currency||'USD'));
const invoiceTheme=()=>me.business.invoice_theme||'emerald';
const locale=()=>language==='bn'?'bn-IN':language==='hi'?'hi-IN':'en-IN';
const currentCurrency=()=>me?.business.currency||'USD';
const reportMoney=v=>money(v,data.dashboard?.currency||currentCurrency());
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,currency=currentCurrency())=>formatMoney(v,currency,locale());
const metricMoney=v=>formatMoney(v,data.dashboard?.currency||currentCurrency(),locale(),v%currencyScale(data.dashboard?.currency||currentCurrency())===0);
const qty=v=>new Intl.NumberFormat(language==='bn'?'bn-IN':'en-IN',{maximumFractionDigits:3}).format(v/1000);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const button=(label,action,cls='primary',attrs='')=>`<button class="${cls}" data-action="${action}" ${attrs}>${e(t(label))}</button>`;
const field=(name,label,value='',type='text',required=false,extra='')=>`<label>${e(t(label))}<input name="${name}" type="${type==='date'?'text':type}" ${type==='date'?'placeholder="YYYY-MM-DD" inputmode="numeric" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"':''} value="${e(value)}" ${required?'required':''} ${extra}></label>`;
const select=(name,label,options,value='')=>`<label>${e(t(label))}<select name="${name}">${options.map(([v,l])=>`<option value="${e(v)}" ${String(v)===String(value)?'selected':''}>${e(l)}</option>`).join('')}</select></label>`;
const langSelect=()=>`<select aria-label="Language" id="language"><option value="en" ${language==='en'?'selected':''}>English</option><option value="hi" ${language==='hi'?'selected':''}>हिन्दी</option><option value="bn" ${language==='bn'?'selected':''}>বাংলা</option></select>`;
function toast(message,error=false){const el=document.querySelector('#toast');el.textContent=message;el.className=error?'show error':'show';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='',6000);}
async function api(path,method='GET',body,operation){if(!navigator.onLine)throw Error(t('offline'));const session=me;const r=await fetch('/api/'+path,{method,headers:method==='GET'?{}:{'Content-Type':'application/json',...(operation?{'Idempotency-Key':operation}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await r.json();if(!r.ok){if(r.status===401&&session&&session===me)resetSession();throw Error(result.error);}if(method!=='GET')pageCache.clear();return result;}
const icons={restaurant:'▦',dashboard:'◫',billing:'▤',inventory:'▦',customers:'♧',purchases:'↙',suppliers:'◇',expenses:'↗',analytics:'▥',alerts:'◉',addons:'⊞',settings:'⚙',admin:'⌘'};
function auth(){
 document.documentElement.lang=language;
 const registering=authMode==='register';
 const googleMark='<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.67-.34-3.94H24v7.46h11a9.4 9.4 0 0 1-4.08 6.16v5h6.64c3.88-3.57 6.05-8.83 6.05-14.68z"/><path fill="#34A853" d="M24 44c5.51 0 10.13-1.83 13.51-4.95l-6.64-5c-1.83 1.23-4.17 1.95-6.87 1.95-5.33 0-9.85-3.6-11.46-8.44H5.69v5.16A20 20 0 0 0 24 44z"/><path fill="#FBBC05" d="M12.54 27.56a12 12 0 0 1 0-7.12v-5.16H5.69a20 20 0 0 0 0 17.44l6.85-5.16z"/><path fill="#EA4335" d="M24 12c3 0 5.7 1.03 7.82 3.06l5.86-5.86C34.11 5.87 29.49 4 24 4A20 20 0 0 0 5.69 15.28l6.85 5.16C14.15 15.6 18.67 12 24 12z"/></svg>';
 const tools=[['overview','billing','Table billing'],['items','inventory','Ingredients & inventory'],['people','customers','Guest history'],['growth','analytics','Restaurant reports']];
 app.innerHTML=`<main class="login-page">
  <header class="login-header">
   <a class="login-brand" href="/"><img class="bos-brand-image" src="/ros-brand.svg" width="840" height="234" alt="Restaurant OS. Powered by Oxodian Technology"></a>
   <div class="login-language">${uiIcon("globe").outerHTML}${langSelect()}</div>
  </header>
  <div class="login-grid">
   <section id="login-features" class="login-story" aria-labelledby="login-headline">
    <div class="login-story-copy"><p class="login-kicker">${e(t('auth_kicker'))}</p><h1 id="login-headline">${language==="en"?'<span>Run your restaurant.</span><span>From table to <em>bill.</em></span>':e(t("auth_headline"))}</h1><p>${e(t("auth_pitch"))}</p></div>
    <ul class="login-tools">${tools.map(([icon,short,long])=>`<li><span class="login-tool-icon">${uiIcon(icon).outerHTML}</span><span class="tool-long">${language==="en"?long:e(t(short))}</span><span class="tool-short">${e(t(short))}</span></li>`).join("")}</ul>
   </section>
   <section class="login-card" aria-labelledby="login-title">
    <h2 id="login-title">${e(t(registering?'register':'signin_title'))}</h2>
    <p class="login-intro">${e(t(registering?'auth_register_intro':'auth_signin_intro'))}</p>
    <div class="login-methods" role="tablist" aria-label="${e(t('signin'))}">
     <button type="button" role="tab" id="google-method-tab" data-auth-method="google" aria-controls="login-google"><span class="login-google-mark" aria-hidden="true">${googleMark}</span>Google</button>
     <button type="button" role="tab" id="email-method-tab" data-auth-method="email" aria-controls="login-email"><svg class="login-email-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4.5 7 6.3 5a2 2 0 0 0 2.4 0l6.3-5"/></svg> ${e(t('email'))}</button>
    </div>
    <div id="login-google" role="tabpanel" aria-labelledby="google-method-tab" hidden>
     <p>${e(t('google_easy'))}</p>
     ${providers.google?`<a class="login-submit" href="/api/auth/google/start?language=${encodeURIComponent(language)}"><span class="login-google-mark" aria-hidden="true">${googleMark}</span>${e(t('google_signin'))}</a>`:`<p>${e(t('google_setup'))}</p>`}
    </div>
    <div id="login-email" role="tabpanel" aria-labelledby="email-method-tab" hidden>
     <form id="auth-form">
      ${registering?field('name','business','','text',true,'maxlength="120"'):''}
      ${field('email','email','','email',true,'autocomplete="email" maxlength="254"')}
      ${field('password','password','','password',true,`autocomplete="${registering?'new-password':'current-password'}" ${registering?'minlength="12"':''} maxlength="128"`)}
      ${registering?workspaceLogoFields(true):''}
      <button class="login-submit" type="submit">${e(t(registering?'register':'signin'))}</button>
     </form>
    </div>
    <div class="login-switch"><p>${e(t(registering?'auth_existing':'auth_new'))}</p><button type="button" data-action="toggle-auth" class="login-secondary">${registering?'':uiIcon('user-plus').outerHTML}${e(t(registering?'signin':'register'))}</button></div>
   </section>
  </div>
  <ul class="login-trust">${[["shield","auth_secure"],["bolt","auth_fast"],["cloud","auth_cloud"],["devices","auth_devices"]].map(([icon,label])=>`<li>${uiIcon(icon).outerHTML}<span>${e(t(label))}</span></li>`).join("")}</ul>
 </main>`;
 const tabs=[...app.querySelectorAll('[data-auth-method]')];
 function selectMethod(method){
  for(const tab of tabs){
   const selected=tab.dataset.authMethod===method;
   tab.setAttribute('aria-selected',String(selected));
   tab.tabIndex=selected?0:-1;
   app.querySelector('#'+tab.getAttribute('aria-controls')).hidden=!selected;
  }
 }
 for(const [index,tab] of tabs.entries()){
  tab.addEventListener('click',()=>selectMethod(tab.dataset.authMethod));
  tab.addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   event.preventDefault();
   const next=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:1-index];
   selectMethod(next.dataset.authMethod);
   next.focus();
  });
 }
 selectMethod(registering||!providers.google?'email':'google');
 if(registering)mountWorkspaceLogo(app.querySelector('.workspace-logo-fields'),{t});
 themeSelects(app);
 for(const link of app.querySelectorAll(".login-links a"))link.addEventListener("click",event=>{
  event.preventDefault();
  app.querySelector(link.getAttribute("href"))?.scrollIntoView({block:"start"});
 });
}


function workspaceAvatar(){
 const logo=me.business.profile_logo_data;
 return logo?`<img src="${e(logo)}" alt="" width="42" height="42">`:e(me.business.name.slice(0,1).toLocaleUpperCase());
}
function workspaceLogoFields(registration=false){
 return `<div class="workspace-logo-fields">
  <img class="workspace-logo-preview" alt="${e(t('workspace_logo'))}" width="64" height="64" hidden>
  <div class="workspace-logo-actions"><button type="button" class="outline" data-logo-choose>${e(t(registration?'workspace_logo_optional':'choose_logo'))}</button><button type="button" class="text-button" data-logo-remove hidden>${e(t('remove_logo'))}</button></div>
  <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="${e(t('workspace_logo'))}" hidden>
  ${registration?'<input type="hidden" name="profile_logo_data">':''}
  <small class="muted">${e(t('workspace_logo_hint'))}</small>
  <p role="status"></p>
 </div>`;
}
function businessBrandSettings(){
 if(me.user.role!=='owner')return '';
 return `<section class="panel business-brand-settings"><h2>${e(t('workspace_logo'))}</h2>${workspaceLogoFields()}<div class="settings-invoice-logo"></div></section>`;
}
function mountBusinessBrandSettings(){
 const host=app.querySelector('.business-brand-settings');
 if(!host)return;
 const session=me;
 mountWorkspaceLogo(host,{t,logo:me.business.profile_logo_data,upload:async logo=>{
  await api('business/profile-logo','POST',{logo_data:logo});
  if(session!==me)return;
  me.business.profile_logo_data=logo;
  for(const avatar of app.querySelectorAll('[data-workspace-avatar]'))avatar.innerHTML=workspaceAvatar();
 }});
 mountInvoiceLogo(null,{host:host.querySelector('.settings-invoice-logo'),t,logo:me.business.logo_data,
  upload:async logo=>{await api('business/logo','POST',{logo_data:logo});if(session===me)me.business.logo_data=logo;},
  onError:err=>toast(t(err.message),true)});
}
function shell(content){if(me.user.restaurant_staff){app.innerHTML=`<div class="layout overview-layout"><aside class="sidebar"><img class="bos-brand-image" src="/ros-brand.svg" alt="Restaurant OS"><strong>${e(me.business.name)}</strong></aside><div class="main"><header class="topbar"><strong>${e(me.business.name)}</strong>${button('signout','logout','outline')}</header><main class="content">${content}</main></div></div>`;mountRestaurant(app.querySelector('#restaurant-workspace'),{api,business:me.business,staff:me.user.restaurant_staff,products:[],showInvoice});return;}document.documentElement.lang=language;const pages=restaurantNavigation.filter(([route])=>route!=='staff'||me.user.role==='owner');app.innerHTML=`<div class="layout ${page==='dashboard'?'overview-layout':''}"><aside class="sidebar"><a href="#dashboard" class="brand bos-sidebar-brand"><img class="bos-brand-image" src="/ros-brand.svg" width="840" height="234" alt="Restaurant OS. Powered by Oxodian Technology"></a><div class="workspace-card"><div class="avatar workspace-avatar" data-workspace-avatar>${workspaceAvatar()}</div><div><strong>${e(me.business.name)}</strong><small>${e(me.business.category)} · Free</small></div></div><span class="nav-caption">${e(t('workspace_label'))}</span><nav class="ros-navigation">${pages.map(([p,label,icon])=>`<a href="#${p}" class="${page===p?'active':''}">${uiIcon(icon).outerHTML}<span>${e(label)}</span></a>`).join('')}</nav><div class="sidebar-bottom"><a href="#settings">⚙ ${e(t('more_short'))}</a>${me.user.is_platform_owner?`<a href="#admin">⌘ ${e(t('admin'))}</a>`:''}<div class="plan-card"><span>◈</span><strong>${e(t('workspace'))}</strong><small>${e(t('staging'))}</small></div></div></aside><div class="main"><header class="topbar"><div class="breadcrumb"><a href="#dashboard" class="bos-topbar-brand"><img class="bos-brand-image" src="/ros-brand.svg" width="840" height="234" alt="Restaurant OS. Powered by Oxodian Technology"></a><a href="#settings" class="desktop-workspace-brand" aria-label="${e(t('business_profile'))}"><span class="avatar workspace-avatar" data-workspace-avatar>${workspaceAvatar()}</span><span>${e(me.business.name)}</span></a> <span>/</span> <strong>${e(t(page))}</strong></div><div class="topbar-right"><span class="status-dot"></span><small>${e(t('staging'))}</small>${page==='dashboard'?`<div class="overview-language">${uiIcon('globe').outerHTML}${langSelect()}</div><a href="#settings" class="avatar workspace-avatar mobile-workspace-avatar" data-workspace-avatar aria-label="${e(t('business_profile'))}">${workspaceAvatar()}</a>`:`${langSelect()}<a href="#settings" class="avatar workspace-avatar mobile-workspace-avatar" data-workspace-avatar aria-label="${e(t('business_profile'))}">${workspaceAvatar()}</a>`}</div></header><main class="content">${!navigator.onLine?`<p class="banner">${e(t('offline'))}</p>`:''}${content}</main><footer class="footer"><img class="bos-brand-image" src="/ros-brand.svg" width="840" height="234" alt="Restaurant OS. Powered by Oxodian Technology"> <span>${e(t('workspace'))}</span></footer></div><nav class="mobile-nav ros-navigation">${[['dashboard','Home','home'],['restaurant','Tables','grid'],['orders','Orders','bell'],['billing','Bills','overview'],['more','More','more']].map(([p,label,icon])=>`<a href="#${p}" class="${page===p?'active':''}">${uiIcon(icon).outerHTML}<span>${label}</span></a>`).join('')}</nav></div>`;enhanceWorkspace(app,t,page);const profile=app.querySelector('#profile-form');if(profile&&data.forms?.business)applyBusinessForm(profile,data.forms.business,t,me.business);decorateWorkspace(app,t);syncCatalogueView();mountBusinessBrandSettings();const restaurant=app.querySelector('#restaurant-workspace');if(restaurant){const business=me.business;mountRestaurant(restaurant,{api,business,owner:me.user.role==='owner',products:data.products||[],section:page,showInvoice,formRevision:data.forms?.invoice?.revision});}const chart=app.querySelector('.sales-panel');if(chart&&data.dashboard)mountGrowthChart(chart,data.dashboard,{t,money:reportMoney,currency:data.dashboard.currency,monthly:true,locale:language==='bn'?'bn-IN':language==='hi'?'hi-IN':'en-IN'});}
function heading(title,description='',action=''){return `<div class="page-heading"><div><div class="eyebrow">${e(t('connected'))}</div><h1>${e(t(title))}</h1><p>${e(description)}</p></div>${action}</div>`;}
function formatPeriod(from,to){
 const format=new Intl.DateTimeFormat(locale(),{day:'numeric',month:'short',timeZone:'UTC'});
 return format.format(new Date(from))+' – '+format.format(new Date(to));
}
function cards(s){const report=data.dashboard,period=report&&Math.round((Date.parse(report.to)-Date.parse(report.from))/86400000)!==29?(report.from===report.to?report.to:formatPeriod(report.from,report.to)):t('period');return `<div class="metrics">${[['sales',s.sales,'coins'],['profit',s.operating_profit,'growth'],['dues',s.dues,'wallet'],['stock_value',s.inventory_value,'items']].map(([key,value,icon])=>`<article class="metric metric-${key} ${metricMoney(value).length>12?'long-value':''}"><div class="metric-label"><span class="metric-symbol">${uiIcon(icon).outerHTML}</span><span>${e(t(key))}</span></div><strong title="${e(reportMoney(value))}">${metricMoney(value)}</strong><small>${e(key==='dues'?t('balance'):key==='stock_value'?t('onhand'):period)}</small></article>`).join('')}</div>`;}
function table(headers,rows){return rows.length?`<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${e(['price','cost','amount'].includes(h)?t(h).replace(/\s*\([^)]*\)$/,''):t(h))}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:`<div class="empty"><span>◇</span><p>${e(t('empty'))}</p></div>`;}
function invoiceThemeSettings(){
 const current=invoiceTheme();
 return `<section class="panel invoice-theme-settings"><h2>${e(t('invoice_theme'))}</h2><div class="invoice-theme-choices">${Object.keys(invoiceThemes).map(theme=>`<label><input type="radio" name="invoice_theme" value="${theme}" ${me.user.role==='owner'?'':'disabled'} ${current===theme?'checked':''}><span class="theme-swatch theme-${theme}"></span>${e(t('theme_'+theme))}</label>`).join('')}</div></section>`;
}
function catalogueView(kind){
 const current=localStorage.getItem('ox_view_'+kind)||'list';
 const controls=['list','grid'].map(view=>`<button type="button" data-action="catalogue-view" data-view="${view}" aria-pressed="${view===current}">${uiIcon(view).outerHTML}${e(t(view+'_view'))}</button>`).join('');
 return `<div class="catalogue-toggle" role="group" aria-label="${e(t('view'))}">${controls}</div><div class="catalogue-grid" ${current==='grid'?'':'hidden'}>${current==='grid'?catalogueCards(kind):''}</div>`;
}
function catalogueCards(kind){
 const records=kind==='billing'?data.invoices:data.products;
 return records.length?(kind==='billing'?invoiceCards(records):productCards(records)):`<p class="muted">${e(t('empty'))}</p>`;
}
function invoiceCards(invoices){
 return invoices.map(i=>{const name=JSON.parse(i.customer_snapshot).name;
 return `<article class="catalogue-card"><span class="catalogue-thumb">${uiIcon('overview').outerHTML}</span><strong>${e(i.number)}</strong><span>${e(name)}</span><small>${e(i.created_at.slice(0,10))}</small><strong>${money(i.total,i.currency)}</strong><span>${e(t('due'))} · ${money(i.total-i.paid,i.currency)}</span>${button('view','invoice','soft',`data-id="${e(i.id)}"`)}</article>`;
 }).join('');
}
function productCards(products){
 return products.map(p=>`<article class="catalogue-card"><span class="catalogue-thumb">${p.photo_revision?`<img src="${photoURL(p)}" alt="" loading="lazy" width="64" height="64">`:uiIcon('items').outerHTML}</span><strong>${e(p.name)}</strong><small>${e(p.sku)}</small><strong>${money(p.price,p.currency)}</strong>${p.kind==='product'?`<span>${e(t('onhand'))} · ${qty(p.stock)}</span>`:''}${button('edit','product-edit','soft',`data-id="${e(p.id)}"`)}${p.kind==='product'?button('adjust','adjust','soft',`data-id="${e(p.id)}"`):''}</article>`).join('');
}
function invoiceRows(invoices){return table(['invoice','customer','date','total','due','status','actions'],invoices.map(i=>[`<strong>${e(i.number)}</strong>`,e(JSON.parse(i.customer_snapshot).name),e(i.created_at.slice(0,10)),money(i.total,i.currency),money(i.total-i.paid,i.currency),`<span class="badge ${i.status==='void'?'neutral':i.paid===i.total?'green':'amber'}">${e(i.status==='void'?'Void':t(i.paid===i.total?'paid':'due'))}</span>`,button('view','invoice','text-button',`data-id="${e(i.id)}"`)]));}
function inventoryList(products){
 if(!products.length)return table([],[]);
 const fields=['product','sku','price','cost','onhand','gst','actions'];
 return `<div class="overview-invoice-list inventory-compact" role="table" aria-label="${e(t('inventory'))}">
  <div class="overview-invoice-head" role="row">${fields.map(key=>`<span role="columnheader">${e(t(key).replace(/\s*\([^)]*\)$/,''))}</span>`).join('')}</div>
  ${products.map(p=>{
   const physical=p.kind==='product',price=money(p.price,p.currency),stock=physical?qty(p.stock):'—';
   const photo=p.photo_revision?`<img src="${photoURL(p)}" alt="" width="32" height="32" loading="lazy" decoding="async">`:uiIcon('items').outerHTML;
   const actions=(label,action,icon)=>`<button type="button" class="overview-view" data-action="${action}" data-id="${e(p.id)}" aria-label="${e(t(label))}" title="${e(t(label))}">${uiIcon(icon).outerHTML}<span>${e(t(label))}</span></button>`;
   return `<div class="overview-invoice-row inventory-compact-row" role="row">
    <span class="inventory-compact-name" role="cell"><span class="inventory-compact-thumb">${photo}</span><span><strong title="${e(p.name)}">${e(p.name)}</strong><small title="${e(p.sku)}">${e(p.sku||p.unit)}</small></span></span>
    <span class="inventory-compact-sku" role="cell">${e(p.sku)}</span>
    <span class="inventory-compact-price" role="cell"><small>${e(t('price_short'))}</small><b>${e(price)}</b></span>
    <span class="inventory-compact-cost" role="cell">${e(money(p.cost,p.currency))}</span>
    <span class="inventory-compact-stock" role="cell"><small>${e(t('onhand'))}</small><span class="${physical&&p.stock<=p.low_stock?'stock-low':''}">${e(stock)}</span></span>
    <span class="inventory-compact-gst" role="cell">${p.tax_bps/100}%</span>
    <span class="inventory-compact-actions" role="cell">${actions('edit','product-edit','edit')}${physical?actions('adjust','adjust','settings'):''}</span>
   </div>`;
  }).join('')}
 </div>`;
}
function overviewInvoices(invoices,compact=false){
 if(!invoices.length)return invoiceRows(invoices);
 const fields=['invoice','customer','date','total','due','status','actions'];
 return `<div class="overview-invoice-list" role="table" aria-label="${e(t(compact?'billing':'recent'))}">
  <div class="overview-invoice-head" role="row">${fields.map(key=>`<span role="columnheader">${e(t(key))}</span>`).join('')}</div>
  ${(compact?invoices:invoices.slice(0,5)).map(inv=>{
   const status=inv.status==='void'?'neutral':inv.paid===inv.total?'green':'amber',buyer=JSON.parse(inv.customer_snapshot).name;
   return `<div class="overview-invoice-row" role="row">
    <span class="overview-invoice-number" role="cell" title="${e(inv.number)}">${uiIcon('overview').outerHTML}<strong>${e(inv.number)}</strong></span>
    <span class="overview-invoice-customer" role="cell" title="${e(buyer)}">${e(buyer)}</span>
    <span class="overview-invoice-date" role="cell"><small>${e(t('date'))}</small>${e(inv.created_at.slice(0,10))}</span>
    <span class="overview-invoice-total" role="cell"><small>${e(t('total'))}</small><b>${e(money(inv.total,inv.currency))}</b></span>
    <span class="overview-invoice-due" role="cell"><small>${e(t('due'))}</small>${e(money(inv.total-inv.paid,inv.currency))}</span>
    <span class="overview-invoice-status" role="cell"><small>${e(t('status'))}</small><span class="badge ${status}">${e(inv.status==='void'?'Void':t(status==='green'?'paid':'due'))}</span></span>
    <span class="overview-invoice-action" role="cell">${button('view','invoice','overview-view',`data-id="${e(inv.id)}" aria-label="${e(t('view'))}"`)}</span>
   </div>`;
  }).join('')}
 </div>`;
}
function overviewTrust(){
 const items=[['shield','auth_secure'],['bolt','auth_fast'],['cloud','auth_cloud'],['devices','auth_devices']];
 return `<ul class="overview-trust">${items.map(([icon,key])=>`<li>${uiIcon(icon).outerHTML}${e(t(key))}</li>`).join('')}</ul>`;
}

const routes={
 restaurant:['products','forms'],orders:['forms'],food:['products'],staff:[],more:[],
 dashboard:['dashboard','invoices'],
 billing:['invoices','forms'],
 inventory:['products'],
 settings:['forms'],
 analytics:['dashboard'],
 customers:['customers','dues','predictions'],
 purchases:['purchases','products','suppliers'],
 suppliers:['suppliers'],
 expenses:['expenses'],
 alerts:['dashboard','predictions'],
 addons:['addons'],
 admin:['admin']
};
const pageCache=createPageCache(path=>api(path));
let renderVersion=0,viewInteraction=0;

function routePath(key,route){
 if(key==='forms')return 'business/forms';
 if(key!=='dashboard')return key;
 const params=new URLSearchParams({currency:data.reportCurrency||currentCurrency()});
 if(route==='dashboard'){
  params.set('from',new Date(Date.now()+19800000-59*86400000).toISOString().slice(0,10));
  params.set('to',today());
 }
 return 'dashboard?'+params;
}
function routeData(route){
 if(me?.user.restaurant_staff)return [];
 return routes[route].map(key=>[key,routePath(key,route)]);
}
function resetSession(){
 me=null;
 data={};
 pageCache.clear();
 renderVersion++;
 if(dialog.open)dialog.close();
 auth();
}
function prefetch(route){
 if(!me||!navigator.onLine||!Object.hasOwn(routes,route)||route==='admin')return;
 for(const [,path] of routeData(route))pageCache.read(path).catch(()=>{});
}
function warmNavigation(){
 for(const route of ['dashboard','billing','inventory','settings'])prefetch(route);
}
function warmMoreNavigation(session){
 if(navigator.connection?.saveData)return;
 const load=()=>{
  if(me!==session||page!=='settings')return;
  for(const route of ['customers','purchases','suppliers','expenses','analytics','alerts','addons'])prefetch(route);
 };
 if('requestIdleCallback' in window)window.requestIdleCallback(load,{timeout:500});
 else setTimeout(load,0);
}
function settingsNavigation(){
 const links=['purchases','suppliers','expenses','analytics','alerts','addons'];
 return `<nav class="more-grid">${links.map(route=>`<a href="#${route}">${e(t(route))}</a>`).join('')}</nav>`;
}
function routePlaceholder(message,error=false){
 const retry=error?button('retry','retry','soft'):'';
 const status=error?'alert':'status';
 shell(heading(page)+(page==='settings'?settingsNavigation():'')+
  `<section class="panel route-placeholder" role="${status}" aria-busy="${!error}"><p>${e(message)}</p>${retry}</section>`);
}
async function render(){
 if(!me)return auth();
 const session=me;
 const route=page;
 const version=++renderVersion;
 const interaction=viewInteraction;
 const resources=routeData(route);
 const existing=resources.map(([,path])=>pageCache.get(path));
 const ready=existing.every(Boolean);
 let painted=false;
 const isCurrent=()=>session===me&&version===renderVersion&&route===page;
 function paint(entries){
  for(const [index,[key]] of resources.entries()){
   const value=entries[index].value;
   data[key]=key==='forms'?{...value.forms}:value;
  }
  const forms=pageCache.get('business/forms');
  if(forms&&route!=='settings')data.forms={...forms.value.forms};
  paintRoute();
  painted=true;
  if(route==='settings')warmMoreNavigation(session);
 }
 try{
  if(ready)paint(existing);
  else routePlaceholder(t('loading'));
  const updated=await Promise.all(resources.map(([,path])=>pageCache.read(path)));
  if(!isCurrent()||updated.some(entry=>!entry))return;
  if(!ready){
   paint(updated);
   return;
  }
  if(interaction!==viewInteraction||dialog.open)return;
  const changed=updated.some((entry,index)=>entry!==existing[index]&&JSON.stringify(entry.value)!==JSON.stringify(existing[index].value));
  if(changed){
   const scroll=app.querySelector('.content')?.scrollTop||0;
   paint(updated);
   app.querySelector('.content').scrollTop=scroll;
  }
 }catch(error){
  if(isCurrent()&&!painted)routePlaceholder(error.message,true);
 }
}
function currentRoute(){
 const route=location.hash.slice(1);
 return Object.hasOwn(routes,route)?route:'dashboard';
}
function navigate(route,writeHistory=false){
 if(me?.user.restaurant_staff)route='restaurant';
 if(route==='staff'&&me?.user.role!=='owner')route='restaurant';
 if(!me||!Object.hasOwn(routes,route))return;
 if(writeHistory&&location.hash!=='#'+route)history.pushState(null,'','#'+route);
 page=route;
 return render();
}
function paintRoute(){
 let html='';
 if(['restaurant','orders','food','staff'].includes(page))html=heading(page,'',page==='food'?button('add_product','product'):'')+'<section class="panel" id="restaurant-workspace"></section>';
 if(page==='more')html=heading('more')+'<div class="menu-page">'+restaurantNavigation.filter(([route])=>route!=='staff'||me.user.role==='owner').map(([route,label])=>`<a href="#${route}">${e(label)}</a>`).join('')+'</div>';
 if(page==='dashboard'||page==='analytics'){const d=data.dashboard;
  html=page==='dashboard'?`<section class="dashboard-welcome"><div><div class="overview-intro"><p class="business-greeting">${e(me.business.name)}</p><h1>${e(t('business_at_glance'))}</h1></div></div>${button('new_invoice','new-invoice','primary hero-invoice')}</section>`:heading('analytics','',button('new_invoice','new-invoice'));
  html+=`<div class="report-ledger" ${d.available_currencies.length<2?'hidden':''}>${select('report_currency','report_currency',d.available_currencies.map(code=>[code,code]),d.currency)}</div>`+cards(d.summary);
  if(me.business.name.startsWith('Demo Restaurant · ')&&me.business.category==='restaurant')html+='<p class="badge amber">Demo Data</p>';
  if(page==='dashboard')html+='<section class="panel" id="restaurant-workspace"></section>';
  html+=`<section class="panel sales-panel"></section>`;

  if(page==='dashboard')html+=`<section class="quick-launch" aria-label="${e(t('quick_actions'))}">${button('quick_product','product','launch-button')}${button('quick_buyer','customer','launch-button')}${button('quick_purchase','purchase','launch-button')}${button('quick_expense','expense','launch-button')}</section>`;
  if(page==='dashboard')html+=`<section class="panel recent-invoices"><div class="panel-heading"><h2>${uiIcon('overview').outerHTML}${e(t('recent'))}</h2><a class="subtle-link" href="#billing">${e(t('all'))}</a></div>${overviewInvoices(data.invoices)}</section>${overviewTrust()}`;
  else html+=`<section class="panel"><form id="range-form" class="filter-form">${field('from','from',d.from,'date',true)}${field('to','to',d.to,'date',true)}<button class="soft">${e(t('apply'))}</button></form>${table(['category','amount'],['net_sales','cogs','gross','expenses','gst'].map(k=>[e(t(k)),reportMoney(d.summary[{net_sales:'net_sales',cogs:'cogs',gross:'gross_profit',expenses:'expenses',gst:'tax'}[k]])]))}</section>`;
 }
 if(page==='billing')html=heading('billing','',`<div class="billing-actions">${mayManageInvoices()?button('recycle_bin','invoice-recycle-bin','outline'):''}${button('new_invoice','new-invoice')}</div>`)+`<section class="panel invoice-list-panel"><input class="search" id="search" placeholder="${e(t('search_invoices'))}" aria-label="${e(t('search_invoices'))}">${catalogueView('billing')}<div class="catalogue-list">${overviewInvoices(data.invoices,true)}</div></section><section class="panel" id="restaurant-workspace"></section>`;
 if(page==='inventory')html=heading('inventory','',`<div class="billing-actions"><a class="google-button" href="#purchases">Purchases</a><a class="google-button" href="#suppliers">Suppliers</a>${button('add_product','product')}</div>`)+`<section class="panel"><input class="search" id="search" placeholder="${e(t('search'))}" aria-label="${e(t('search'))}">${catalogueView('inventory')}<div class="catalogue-list">${inventoryList(data.products)}</div></section><section class="panel" id="restaurant-workspace"></section>`;
 if(page==='customers')html=heading('customers','',button('add_customer','customer'))+`<section class="panel"><input class="search" id="search" placeholder="${e(t('search'))}" aria-label="${e(t('search'))}">${table(['name','phone','due','prediction','actions'],data.customers.map(c=>{const prediction=data.predictions.find(x=>x.id===c.id);return [`<strong>${e(c.name)}</strong>${recordExtras(c,t)}`,e(c.phone),money(data.dues.find(x=>x.id===c.id)?.due||0),e(prediction.expected_date||t('insufficient_history')),button('details','customer-details','text-button',`data-id="${c.id}"`)];}))}</section>`;
 if(page==='suppliers')html=heading('suppliers','',button('add_supplier','supplier'))+`<section class="panel">${table(['name','phone','address'],data.suppliers.map(s=>[e(s.name)+recordExtras(s,t),e(s.phone),e(s.address)]))}</section>`;
 if(page==='purchases')html=heading('purchases','',button('add_purchase','purchase'))+`<section class="panel">${table(['reference','suppliers','date','total'],data.purchases.map(p=>[e(p.reference||p.id.slice(0,8))+recordExtras(p,t),e(p.supplier_name||'—'),e(p.created_at.slice(0,10)),money(p.total,p.currency)]))}</section>`;
 if(page==='expenses')html=heading('expenses','',button('add_expense','expense'))+`<section class="panel">${table(['category','note','date','amount'],data.expenses.map(p=>[e(t(p.category))+recordExtras(p,t),e(p.note),e(p.date),money(p.amount,p.currency)]))}</section>`;
 if(page==='alerts'){const d=data.dashboard;html=heading('alerts')+`<div class="two-columns"><section class="panel"><h2>${e(t('low_stock'))}</h2>${table(['product','onhand','low_stock'],d.low_stock.map(p=>[e(p.name),qty(p.stock),qty(p.low_stock)]))}</section><section class="panel"><h2>${e(t('dues'))}</h2>${table(['invoice','due_date','due','actions'],d.overdue.map(i=>[e(i.number),e(i.due_date),reportMoney(i.due),button('view','invoice','text-button',`data-id="${i.id}"`)]))}</section></div><section class="panel"><h2>${e(t('prediction'))}</h2><p class="muted">${e(t('history'))}</p>${table(['customer','estimated','status'],data.predictions.filter(x=>x.status==='estimated').map(x=>[e(x.name),e(x.expected_date),e(t(x.consistency))]))}</section>`;}
 if(page==='addons')html=heading('addons')+`<div class="addon-grid">${data.addons.map((a,i)=>`<article class="panel addon"><div class="addon-icon">${['✂','⌁','▦','⌘','⚒','◇'][i]}</div><span class="badge neutral">${e(t('planned'))}</span><h2>${e(a.name)}</h2><p>${a.features.map(e).join(' · ')}</p></article>`).join('')}</div>`;
 if(page==='settings'){const b=me.business;html=heading('settings')+settingsNavigation()+`<section class="panel form-builder-entry"><h2>${e(t('form_builder'))}</h2><p>${e(t('builder_intro'))}</p>${me.user.role==='owner'?button('open_form_builder','form-builder','primary'):''}</section>${businessBrandSettings()}${invoiceThemeSettings()}<section class="panel" id="restaurant-workspace"></section><section class="panel settings-panel"><h2>${e(t('business_profile'))}</h2><form id="profile-form"><div class="form-grid">${field('name','business',b.name,'text',true)}${field('address','address',b.address)}${field('phone','phone',b.phone)}${select('country','country',[['',t('not_selected')],...countries(language)],b.country)}${select('currency','currency',currencyChoices(language),b.currency)}${field('gstin','gstin',b.gstin)}${field('state_code','state',b.state_code,'text',true,'pattern="[0-9]{2}" maxlength="2"')}${select('language','language',[['en','English'],['hi','हिन्दी'],['bn','বাংলা']],b.language)}</div><p class="muted">${e(t('profile_note'))}</p><p class="muted">${e(t('currency_note'))}</p><button class="primary">${e(t('save'))}</button></form></section><section class="panel"><h2>${e(t('security'))}</h2>${me.user.google_connected?`<p class="badge green">✓ ${e(t('google_connected'))}</p>`:providers.google?`<a class="google-button" href="/api/auth/google/start?link=1&language=${language}">G &nbsp; ${e(t('google_connect'))}</a>`:`<p class="muted small">${e(t('google_setup'))}</p>`}<p>${e(me.user.email)}</p><div class="button-row">${button('export','export','soft')}${pendingInstall?button('install','install','soft'):''}${button('signout','logout','outline')}</div></section>`;}
 if(page==='admin')html=heading('admin')+`<section class="panel"><h2>${e(t('platform_overview'))}</h2>${table(['category','total'],data.admin.businesses.map(x=>[e(x.category),e(x.count)]))}<p>${e(t('total_workspaces'))}: ${data.admin.accounts.total} · ${e(t('active_workspaces'))}: ${data.admin.usage.active_businesses} · ${e(t('monthly_invoices'))}: ${data.admin.usage.invoices}</p></section>`;
 shell(html||heading('dashboard'));
}
const formKinds={'product-form':'product','product-edit-form':'product','customer-form':'customer','supplier-form':'supplier','purchase-form':'purchase','expense-form':'expense','adjust-form':'adjustment','payment-form':'payment'};
function modal(title,content,formId,{open=true,ready=false}={}){dialog.classList.remove('business-builder-dialog');dialog.innerHTML=`<div class="dialog-heading"><h2>${e(t(title))}</h2>${button('cancel','close','icon-button')}</div>${formId?`<form id="${formId}" data-key="${crypto.randomUUID()}">${content}<div class="form-actions">${button('cancel','close','outline')}<button type="submit" class="primary">${e(t('save'))}</button></div></form>`:content}`;if(open&&!dialog.open)dialog.showModal();enhanceModal(dialog,t,{ready});if(formId&&formKinds[formId]){const form=dialog.querySelector('form'),kind=formKinds[formId],record=kind==='product'?data.products?.find(p=>p.id===form.querySelector('[name="id"]')?.value):null;form.dataset.currency=currentCurrency();applyBusinessForm(form,data.forms[kind],t,record);if(kind==='product'){const panel=mountProductPhoto(form,{t,product:record});panel.hidden=data.forms.product.schema.optional.photo_data===false;}}themeSelects(dialog);}
async function showNewInvoice(){
 const session=me;
 const [products,customers,invoiceConfig,customerConfig]=await Promise.all([api('products'),api('customers'),api('business/forms/invoice'),api('business/forms/customer')]);
 if(!session||me!==session||dialog.open)return;
 data.products=products.filter(p=>p.currency===currentCurrency());data.customers=customers;cart=[];invoiceKey=crypto.randomUUID();modal('new_invoice',`<form id="invoice-form" data-guided="true"><ol class="invoice-progress" role="tablist" aria-label="${e(t('invoice_steps'))}"></ol><div class="guided-panels"><section class="guided-step buyer-step" data-invoice-step="0"><h3>${e(t('buyer_start'))}</h3><input type="hidden" name="customer_id" value=""><label for="buyer-search">${e(t('buyer_name'))}</label><div id="buyer-matches" hidden></div><div class="buyer-search-wrap"><input id="buyer-search" type="text" maxlength="120" role="combobox" aria-autocomplete="list" aria-controls="buyer-options" aria-expanded="false" autocomplete="off" placeholder="${e(t('buyer_search_placeholder'))}"><button type="button" class="buyer-add" data-buyer-add aria-label="${e(t('add_new_buyer'))}" title="${e(t('add_new_buyer'))}" aria-pressed="false">+</button></div><p class="buyer-hint">${e(t('buyer_add_hint'))}</p><div class="buyer-selection" hidden></div><div class="new-buyer-fields" hidden><label for="new-buyer-phone">${e(t('optional_whatsapp'))}</label><input id="new-buyer-phone" type="tel" inputmode="tel" maxlength="20" placeholder="+91 …"><label for="new-buyer-address">${e(t('address'))}</label><textarea id="new-buyer-address" rows="2" maxlength="500"></textarea><div class="buyer-inline-actions"><button type="button" class="outline" data-buyer-cancel>${e(t('cancel'))}</button><button type="button" class="primary" data-buyer-save>${e(t('save_select_buyer'))}</button></div></div><p class="buyer-notice" role="status" aria-live="polite" hidden></p><button type="button" class="text-button walkin-button" data-walkin>${e(t('continue_walkin'))}</button></section><section class="guided-step" data-invoice-step="1" hidden><h3>${e(t('choose_items'))}</h3><div class="cart-add">${select('product_id','product',data.products.length?data.products.map(x=>[x.id,`${x.name} · ${money(x.price)}`]):[['',t('no_stock')]])}${button('add_product','cart-add','soft')}</div><p class="guide-item-notice error-text" role="status"></p><div id="cart"></div></section><section class="guided-step" data-invoice-step="2" hidden><h3>${e(t('payment_details'))}</h3><div class="payment-switch" role="group" aria-label="${e(t('payment_details'))}"><button type="button" class="soft" data-pay-view="main">${e(t('payment_short'))}</button><button type="button" class="outline" data-pay-view="more">${e(t('more_details'))}</button></div><div class="payment-main">${field('paid','paid','0','number',true,'min="0" step="any"')}${button('paid_in_full','paid-in-full','soft')}${select('method','payment',['cash','upi','card','bank'].map(x=>[x,t(x)]))}</div><div class="payment-more" hidden>${field('due_date','due_date','','text',false,'placeholder="YYYY-MM-DD" inputmode="numeric" pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"')}${field('place_of_supply','place',me.business.state_code,'text',true,'maxlength="2"')}</div></section><section class="guided-step" data-invoice-step="3" hidden><h3>${e(t('review_before_save'))}</h3><div class="invoice-review" aria-live="polite"></div><p class="review-hint">${e(t('edit_using_circles'))}</p></section></div><div class="form-actions guided-actions"><button type="button" class="outline" data-guide-back disabled>← ${e(t('previous'))}</button><button type="button" class="primary" data-guide-next>${e(t('next'))} →</button><button class="primary" type="submit" hidden>${e(t('create_invoice'))}</button></div></form>`,undefined,{open:false});
 const form=dialog.querySelector('#invoice-form'),formT=invoiceTranslator(invoiceConfig,t);form.dataset.currency=currentCurrency();applyInvoiceFields(form,invoiceConfig,t);const buyerBox=form.querySelector('.new-buyer-fields');buyerBox.dataset.formKind='customer';buyerBox.dataset.formRevision=customerConfig.revision;addCustomFields(buyerBox,customerConfig.schema.fields,{},t);themeSelects(form);mountInvoiceGuide(form,{t:formT,buyers:data.customers,money,summary:()=>({...cartTotal(),extra:invoiceConfig.schema.fields.map(f=>({...f,value:formValues(form)[f.id]??''})),items:cart.map(x=>{const p=data.products.find(p=>p.id===x.product_id);return {...x,name:p.name,price:p.price,net:Math.round(p.price*x.quantity/1000)};}),paid:Math.round(Number(form.querySelector('[name="paid"]').value||0)*currencyScale(currentCurrency()))}),createBuyer:async(draft,key)=>{const created=await api('customers','POST',configuredBody(buyerBox,{...draft,state_code:me.business.state_code}),key);return {...draft,id:created.id};}});mountProductPicker(form,{products:data.products,t:formT,money,getCount:()=>cart.length,add:addInvoiceItem});polishInvoiceGuide(form,formT);renderCart();
 dialog.showModal();
}

function cartTotal(){const place=dialog.querySelector('[name="place_of_supply"]')?.value;let net=0,tax=0;for(const x of cart){const product=data.products.find(p=>p.id===x.product_id);const n=Math.round(product.price*x.quantity/1000);net+=n;tax+=Math.round(n*(me.business.gstin?product.tax_bps:0)/10000);}return {net,tax,total:net+tax,place};}
function addInvoiceItem(pid){if(!pid){toast(t('no_stock'),true);return;}const existing=cart.find(x=>x.product_id===pid);if(existing)existing.quantity+=1000;else cart.push({product_id:pid,quantity:1000});const form=dialog.querySelector('#invoice-form');if(form)form.dataset.cartPage=String(cart.findIndex(x=>x.product_id===pid));renderCart();}
function renderCart(){const target=dialog.querySelector('#cart');if(!target)return;const form=target.closest('form');if(form.dataset.guided){const current=Math.max(0,Math.min(cart.length-1,Number(form.dataset.cartPage)||0));form.dataset.cartPage=String(current);target.innerHTML=cart.length?cart.map((x,i)=>{const p=data.products.find(p=>p.id===x.product_id);return `<article class="bill-item-card"><div class="bill-item-top"><div>${p.photo_revision?`<img class="item-thumb" src="${photoURL(p)}" alt="" width="48" height="48">`:''}<strong>${e(p.name)}</strong><span>${money(p.price,p.currency)} / ${e(p.unit)}</span></div></div><div class="bill-item-bottom"><div class="quantity-control"><button type="button" data-action="cart-decrease" data-index="${i}" aria-label="${e(t('decrease_quantity'))}" ${x.quantity<=1000?'disabled':''}>−</button><input aria-label="${e(t('quantity'))} ${e(p.name)}" class="qty" type="number" min="0.001" step="0.001" value="${x.quantity/1000}" data-cart-index="${i}"><button type="button" data-action="cart-increase" data-index="${i}" aria-label="${e(t('increase_quantity'))}">+</button></div><strong>${money(Math.round(x.quantity*p.price/1000))}</strong><button type="button" class="remove-line" data-action="cart-remove" data-index="${i}" aria-label="${e(t('remove_short'))} ${e(p.name)}">${uiIcon('trash').outerHTML}</button></div></article>`;}).join(''):`<div class="bill-empty">${uiIcon('items').outerHTML}<strong>${e(t('bill_empty_title'))}</strong><p>${e(t('bill_empty_hint'))}</p></div>`;if(cart.length)target.innerHTML+=`<button type="button" class="add-another" data-choose-more>+ ${e(t('add_another_item'))}</button>`;target.innerHTML+=`<div class="cart-total-card"><span>${e(t('total'))}</span><strong>${money(cartTotal().total)}</strong></div>`;form.dispatchEvent(new Event('invoice:change'));return;}target.innerHTML=table(['product','quantity','total','actions'],cart.map((x,i)=>{const p=data.products.find(p=>p.id===x.product_id);return [e(p.name),`<input aria-label="${e(t('quantity'))} ${e(p.name)}" class="qty" type="number" min="0.001" step="0.001" value="${x.quantity/1000}" data-cart-index="${i}">`,money(Math.round(x.quantity*p.price/1000)),`<button type="button" class="icon-button" data-action="cart-remove" data-index="${i}" aria-label="Remove ${e(p.name)}">×</button>`];}))+`<div class="bill-total"><span>${e(t('total'))} <small>${e(t('gst'))}: ${money(cartTotal().tax)}</small></span><strong>${money(cartTotal().total)}</strong></div>`;enhanceCart(target,t);form.dispatchEvent(new Event('invoice:change'));}

const mayManageInvoices=()=>['owner','manager'].includes(me?.user.role);
async function showInvoice(iid,created){const session=me,inv=created??await api('invoices/'+iid);if(!session||me!==session)return;const money=value=>formatMoney(value,inv.currency,locale());data.currentInvoice=inv;modal('invoice',`<div id="invoice-document"><div class="receipt-brand"><div><h2>${e(inv.business.name)}</h2><p>${e(inv.business.address)}</p><p>${e(inv.business.phone)}</p>${inv.business.gstin?`<p>GSTIN: ${e(inv.business.gstin)} · State: ${e(inv.business.state_code)}</p>`:''}</div><strong>${inv.business.gstin?'TAX INVOICE':'BILL / RECEIPT'}</strong></div><hr><div class="receipt-meta"><div><strong>${e(inv.number)}</strong><p>${e(inv.created_at.slice(0,10))}</p><p>Place of supply: ${e(inv.place_of_supply)}</p></div><div><strong>${e(inv.customer.name)}</strong><p>${e(inv.customer.address)}</p><p>${e(inv.customer.phone)}</p>${inv.customer.gstin?`<p>GSTIN: ${e(inv.customer.gstin)}</p>`:''}</div></div>${table(['product','hsn','quantity','price','tax','total'],inv.items.map(x=>[e(x.name),e(x.hsn),`${qty(x.quantity)} ${e(x.unit)}`,money(x.price),`${inv.business.gstin?x.tax_bps/100:0}% · ${money(x.tax)}`,money(x.net+x.tax)]))}<div class="receipt-totals">${[['net_sales',inv.subtotal],['CGST',inv.cgst],['SGST',inv.sgst],['IGST',inv.igst],['total',inv.total],['paid',inv.paid],['due',inv.total-inv.paid]].map(([k,v])=>`<div><span>${e(t(k))}</span><strong>${money(v)}</strong></div>`).join('')}</div>${recordExtras(inv,t,{print:true})}<p class="small">Reverse charge: No · ${e(inv.status.toUpperCase())}</p><div class="receipt-platform-brand"><img class="bos-brand-image" src="/ros-brand.svg" width="840" height="234" alt="Restaurant OS. Powered by Oxodian Technology"></div></div><div class="button-row">${button('print','print','primary')}${button('download_pdf','download-pdf','soft')}${button('download','download','soft')}${button('share','share','soft')}${button('whatsapp','whatsapp','soft')}${inv.status==='final'&&inv.paid<inv.total?button('collect','payment','outline'):''}${inv.status==='final'&&inv.paid===0&&mayManageInvoices()?button('void','void','outline'):''}${mayManageInvoices()?button('delete_invoice','invoice-trash','outline invoice-danger'):''}</div><p class="muted small">${e(t('manual'))}</p><section class="payment-history"><h3>${e(t('payment'))}</h3>${table(['date','payment','amount'],inv.payments.map(p=>[e(p.created_at),e(p.method.toUpperCase()),money(p.amount)]))}</section>`,undefined,{ready:!!created});if(!created&&me.user.role==='owner')mountInvoiceLogo(dialog,{t,logo:inv.brand_logo,upload:async logo=>{await api('business/logo','POST',{logo_data:logo});inv.brand_logo=logo;me.business.logo_data=logo;},onError:err=>toast(t(err.message),true)});}
async function previewInvoice(trigger){
 const inv=data.currentInvoice,popup=document.createElement('dialog');
 popup.className='invoice-preview-dialog';
 popup.setAttribute('aria-labelledby','invoice-preview-title');
 popup.innerHTML=`<div class="dialog-heading"><h2 id="invoice-preview-title">${e(t('preview_invoice'))}</h2><button type="button" class="outline">${e(t('close'))}</button></div><div class="invoice-preview-pages" role="status">${e(t('loading'))}</div>`;
 const content=popup.querySelector('.invoice-preview-pages');
 popup.querySelector('button').addEventListener('click',()=>popup.close());
 popup.addEventListener('close',()=>{popup.remove();if(trigger.isConnected)trigger.focus();},{once:true});
 dialog.append(popup);popup.showModal();
 try{
  const pages=await renderInvoicePages(inv,invoiceTheme());
  if(!popup.open)return;
  pages.forEach((canvas,index)=>{canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${t('invoice')} ${inv.number} · ${index+1}/${pages.length}`);});
  content.replaceChildren(...pages);content.removeAttribute('role');
 }catch(error){if(popup.open)content.textContent=t(error.message);}
}
async function quickPrint(trigger){
 const inv=data.currentInvoice;
 if(trigger.disabled)return;
 trigger.disabled=true;
 try{
  const pages=await renderInvoicePages(inv,invoiceTheme());
  if(!trigger.isConnected||!dialog.open||data.currentInvoice!==inv)return;
  const print=document.createElement('div');print.className='invoice-art-print';print.append(...pages);
  document.querySelector('.invoice-art-print')?.remove();
  document.body.append(print);
  const cleanup=()=>print.remove();
  window.addEventListener('afterprint',cleanup,{once:true});
  try{window.print();}catch(error){window.removeEventListener('afterprint',cleanup);cleanup();throw error;}
 }finally{trigger.disabled=false;}
}
async function showInvoiceTrash(){
 const rows=await api('invoices/trash');
 modal('recycle_bin',`<p>${e(t('recycle_bin_note'))}</p>${table(['invoice','customer','total','deleted_on','actions'],rows.map(inv=>[e(inv.number),e(JSON.parse(inv.customer_snapshot).name),money(inv.total,inv.currency),e(new Date(inv.deleted_at).toLocaleDateString(locale())),button('restore_invoice','invoice-restore','soft',`data-id="${e(inv.id)}"`)]))}`);
}
function saveBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;const share=dialog.querySelector('.share-studio');if(share&&/\.(pdf|png)$/i.test(name)){let ready=share.querySelector('.invoice-files-ready');if(!ready){ready=document.createElement('div');ready.className='invoice-files-ready';ready.setAttribute('role','status');share.querySelector('.share-secondary').after(ready);}const type=name.split('.').at(-1).toUpperCase();const old=ready.querySelector('[data-format="'+type+'"]');if(old){URL.revokeObjectURL(old.href);old.remove();}a.dataset.format=type;a.className='invoice-file-ready';a.textContent=type+' · '+t('save_file');ready.append(a);a.click();}else{document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}}
const actionsWithForms=new Set(['form-builder','product','product-edit','customer','supplier','purchase','expense','adjust','payment']);
function syncCatalogueView(){
 const grid=app.querySelector('.catalogue-grid');if(!grid)return;
 const list=app.querySelector('.catalogue-list'),view=localStorage.getItem('ox_view_'+page)||'list';
 if(view==='grid'&&!grid.hasChildNodes())grid.innerHTML=catalogueCards(page);
 grid.hidden=view!=='grid';list.hidden=view==='grid';filterCatalogue();
 app.querySelectorAll('[data-action="catalogue-view"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
}
async function action(name,el){
 if(name==='catalogue-view'){localStorage.setItem('ox_view_'+page,el.dataset.view);syncCatalogueView();return;}
 if(actionsWithForms.has(name)){
  const session=me;
  const entry=await pageCache.read('business/forms');
  if(!entry||session!==me||!el.isConnected)return;
  data.forms={...entry.value.forms};
 }
 if(name==='close'){const builder=dialog.classList.contains('business-builder-dialog');dialog.close();if(builder)await render();return;}if(name==='retry')return render();if(name==='toggle-auth'){authMode=authMode==='login'?'register':'login';return auth();}
 if(name==='form-builder'){modal('form_builder','<div id="business-form-builder"></div>');dialog.classList.add('business-builder-dialog');mountFormBuilder(dialog.querySelector('#business-form-builder'),{t,configs:data.forms,gst:!!me.business.gstin,save:(kind,body)=>api('business/forms/'+kind,'PATCH',body),onSaved:config=>data.forms[config.kind]=config,onError:error=>toast(t(error.message),true),theme:themeSelects});return;}
 if(name==='ready-navigate'){dialog.close();return navigate(el.dataset.route,true);}
 if(name==='ready-new-invoice'){dialog.close();return showNewInvoice();}
 if(name==='invoice-preview')return previewInvoice(el);
 if(name==='new-invoice')return showNewInvoice();if(name==='invoice')return showInvoice(el.dataset.id);
 if(name==='customer-details'){const detail=await api('customers/'+el.dataset.id);return modal('details',`<h2>${e(detail.customer.name)}</h2><p>${e(detail.customer.phone)} · ${e(detail.customer.address)}</p><p class="muted">${e(detail.customer.notes)}</p>${recordExtras(detail.customer,t)}${invoiceRows(detail.invoices)}`);}
 if(name==='product-edit'){const p=data.products.find(x=>x.id===el.dataset.id);return modal('edit',`<input type="hidden" name="id" value="${p.id}"><div class="form-grid">${field('name','name',p.name,'text',true)}${field('sku','sku',p.sku)}${field('unit','unit',p.unit,'text',true)}${field('price','price',p.currency===currentCurrency()?p.price/currencyScale(p.currency):'','number',true,'min="0" step="any"')}${p.currency!==currentCurrency()?field('currency_cost','currency_cost','','number',true,'min="0" step="any"')+'<p class="currency-reprice-note">'+e(t('reprice_currency'))+'</p>':''}${field('low_stock','low_stock',p.low_stock/1000,'number',true,'min="0" step="0.001"')}${field('tax_bps','tax',p.tax_bps/100,'number',true,'min="0" max="40" step="any"')}${field('hsn','hsn',p.hsn)}</div>`,'product-edit-form');}
 if(name==='product')return modal('add_product',`<div class="form-grid">${field('name','name','','text',true,'maxlength="160"')}${select('kind','kind',[['product',t('goods')],['service',t('service')]],page==='food'?'service':'product')}${field('sku','sku')}${field('unit','unit','pcs','text',true)}${field('price','price','','number',true,'min="0" step="any"')}${field('cost','cost','0','number',true,'min="0" step="any"')}${field('stock','stock','0','number',true,'min="0" step="0.001"')}${field('low_stock','low_stock','5','number',true,'min="0" step="0.001"')}${field('tax_bps','tax','0','number',true,'min="0" max="40" step="any"')}${field('hsn','hsn','','text',false,'maxlength="8"')}</div>`,'product-form');
 if(name==='customer'||name==='supplier')return modal(name==='customer'?'add_customer':'add_supplier',field('name','name','','text',true)+field('phone','phone','','tel')+field('address','address')+(name==='customer'?field('gstin','gstin')+field('state_code','state',me.business.state_code)+field('notes','note'):''),name+'-form');
 if(name==='expense')return modal('add_expense',select('category','category',(me.business.category==='restaurant'?['Ingredients','Cooking gas','Electricity','Staff salaries','Rent','Packaging','Cleaning','Repairs','Other']:['Rent','Electricity','Salary','Transport','Packaging','Internet','Marketing','Repairs','Other']).map(x=>[x,t(x)]))+field('amount','amount','','number',true,'min="0.0000001" step="any"')+field('date','date',today(),'date',true)+field('note','note'),'expense-form');
 if(name==='purchase'){data.products=await api('products');data.suppliers=await api('suppliers');return modal('add_purchase',select('product_id','product',data.products.filter(x=>x.kind==='product'&&x.currency===currentCurrency()).map(x=>[x.id,x.name]))+select('supplier_id','suppliers',[['','—'],...data.suppliers.map(x=>[x.id,x.name])])+field('quantity','quantity','1','number',true,'min="0.001" step="0.001"')+field('cost','cost','','number',true,'min="0" step="any"')+field('reference','reference'),'purchase-form');}
 if(name==='adjust')return modal('adjust',`<input type="hidden" name="product_id" value="${e(el.dataset.id)}">`+field('quantity','quantity','','number',true,'step="0.001"')+field('reason','reason','','text',true),'adjust-form');
 if(name==='paid-in-full'){dialog.querySelector('[name="paid"]').value=cartTotal().total/currencyScale(currentCurrency());dialog.querySelector('#invoice-form').dispatchEvent(new Event('invoice:change'));return;}
 if(name==='cart-add')return addInvoiceItem(dialog.querySelector('[name="product_id"]').value);
 if(name==='cart-increase'||name==='cart-decrease'){const x=cart[Number(el.dataset.index)];if(!x)return;x.quantity=Math.max(1000,x.quantity+(name==='cart-increase'?1000:-1000));renderCart();return;}
 if(name==='cart-prev'||name==='cart-next'){const form=dialog.querySelector('#invoice-form');form.dataset.cartPage=String((Number(form.dataset.cartPage)||0)+(name==='cart-next'?1:-1));renderCart();return;}
 if(name==='cart-remove'){cart.splice(Number(el.dataset.index),1);renderCart();return;}
 if(name==='payment'){modal('collect',field('amount','amount',(data.currentInvoice.total-data.currentInvoice.paid)/currencyScale(data.currentInvoice.currency),'number',true,`min="0.0000001" max="${(data.currentInvoice.total-data.currentInvoice.paid)/currencyScale(data.currentInvoice.currency)}" step="any"`)+select('method','payment',['cash','upi','card','bank'].map(x=>[x,t(x)])),'payment-form');dialog.querySelector('form').dataset.currency=data.currentInvoice.currency;dialog.querySelector('[name="amount"]').closest('label').firstChild.textContent=t('amount').replace(/\s*\([^)]*\)$/,'')+' ('+data.currentInvoice.currency+')';themeInvoicePayment(dialog,t);return;}
 if(name==='void')return modal('void',`<p>${e(t('void_note'))}</p>`+field('reason','reason','','text',true),'void-form');
 if(name==='print')return quickPrint(el);
 if(name==='invoice-recycle-bin')return showInvoiceTrash();
 if(name==='invoice-trash'){
  const inv=data.currentInvoice;
  if(!window.confirm(t('delete_invoice_confirm')))return;
  el.disabled=true;
  try{await api('invoices/'+inv.id,'DELETE',{});}finally{el.disabled=false;}
  dialog.close();toast(t('invoice_trashed'));return render();
 }
 if(name==='invoice-restore'){
  el.disabled=true;
  try{await api('invoices/'+el.dataset.id+'/restore','POST',{});}finally{el.disabled=false;}
  toast(t('invoice_restored'));await Promise.all([render(),showInvoiceTrash()]);return;
 }
 if(name==='download-pdf'){return saveBlob(await invoicePDF(data.currentInvoice,invoiceTheme()),data.currentInvoice.number+'.pdf');}
 if(name==='download'||name==='share'){const inv=data.currentInvoice,blob=await invoicePNG(inv,invoiceTheme());if(name==='download')return saveBlob(blob,inv.number+'.png');const file=new File([blob],inv.number+'.png',{type:'image/png'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:inv.number});}catch(err){if(err.name!=='AbortError')throw err;}}else{saveBlob(blob,inv.number+'.png');toast(t('manual'));}return;}
 if(name==='whatsapp'){const inv=data.currentInvoice,phone=buyerPhone(inv.customer.phone);const message=whatsappInvoiceMessage(inv,{language,t,money:value=>formatMoney(value,inv.currency,locale())});window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank','noopener,noreferrer');return;}
 if(name==='export'){const dump=await api('export');return saveBlob(new Blob([JSON.stringify(dump,null,2)],{type:'application/json'}),'oxodian-export-'+today()+'.json');}
 if(name==='install'){await pendingInstall.prompt();pendingInstall=null;return;}
 if(name==='logout'){await api('logout','POST',{});resetSession();}
}
document.addEventListener('click',ev=>{const el=ev.target.closest('[data-action]');if(!el)return;ev.preventDefault();action(el.dataset.action,el).catch(err=>toast(t(err.message),true));});
async function saveInvoiceTheme(input){
 const session=me,options=[...input.closest('.invoice-theme-choices').querySelectorAll('input')];
 options.forEach(option=>option.disabled=true);
 try{
  const {theme}=await api('business/invoice-theme','PATCH',{theme:input.value});
  if(me===session){me.business.invoice_theme=theme;toast(t('success'));}
 }catch(error){
  if(me===session){options.forEach(option=>option.checked=option.value===invoiceTheme());toast(t(error.message),true);}
 }finally{options.forEach(option=>option.disabled=false);}
}
document.addEventListener('change',ev=>{if(ev.target.name==='invoice_theme'){saveInvoiceTheme(ev.target);return;}if(ev.target.name==='report_currency'){data.reportCurrency=ev.target.value;render();return;}if(ev.target.id==='language'){language=ev.target.value;localStorage.setItem('ox_language',language);document.documentElement.lang=language;me?render():auth();}if(ev.target.dataset.cartIndex!==undefined){const q=Number(ev.target.value);if(!Number.isFinite(q)||q<=0){toast('Quantity must be positive',true);return;}cart[Number(ev.target.dataset.cartIndex)].quantity=Math.round(q*1000);renderCart();}});
function filterCatalogue(){
 const value=app.querySelector('#search')?.value.trim().toLocaleLowerCase()||'';
 for(const card of app.querySelectorAll('.catalogue-card,.catalogue-list .overview-invoice-row'))card.hidden=!card.textContent.toLocaleLowerCase().includes(value);
}
document.addEventListener('input',ev=>{if(ev.target.id==='search')filterCatalogue();});
document.addEventListener('submit',async ev=>{if(ev.target.method==='dialog')return;ev.preventDefault();const form=ev.target,raw=Object.fromEntries(new FormData(form)),b=form.dataset.formKind?configuredBody(form,raw):raw,submit=form.querySelector('[type="submit"]')||form.querySelector('button:last-child');if(['invoice-form','product-form','product-edit-form','purchase-form','expense-form'].includes(form.getAttribute('id')))b.expected_currency=form.dataset.currency||currentCurrency();if(form.dataset.busy)return;form.dataset.busy='1';if(submit)submit.disabled=true;try{
 const cents=v=>Math.round(Number(v)*currencyScale(form.dataset.currency||currentCurrency())),milli=v=>Math.round(Number(v)*1000),op=form.dataset.key;
 if(form.getAttribute('id')==='auth-form'){await api(authMode==='login'?'login':'register','POST',{...b,language});me=await api('me');language=localStorage.getItem('ox_language')||me.business.language;const opening=navigate('dashboard',true);warmNavigation();await opening;return;}
 if(form.getAttribute('id')==='product-edit-form')await api('products/'+b.id,'PATCH',{...b,...(b.currency_cost!==undefined?{currency_cost:cents(b.currency_cost)}:{}),price:cents(b.price),low_stock:milli(b.low_stock),tax_bps:Math.round(Number(b.tax_bps)*100)});
 if(form.getAttribute('id')==='product-form')await api('products','POST',{...b,price:cents(b.price),cost:cents(b.cost),stock:milli(b.stock),low_stock:milli(b.low_stock),tax_bps:Math.round(Number(b.tax_bps)*100)});
 if(form.getAttribute('id')==='customer-form')await api('customers','POST',b);
 if(form.getAttribute('id')==='supplier-form')await api('suppliers','POST',b);
 if(form.getAttribute('id')==='expense-form')await api('expenses','POST',{...b,amount:cents(b.amount)},op);
 if(form.getAttribute('id')==='purchase-form')await api('purchases','POST',{...b,supplier_id:b.supplier_id,reference:b.reference,items:[{product_id:b.product_id,quantity:milli(b.quantity),cost:cents(b.cost)}]},op);
 if(form.getAttribute('id')==='adjust-form')await api('adjustments','POST',{...b,quantity:milli(b.quantity)},op);
 if(form.getAttribute('id')==='profile-form'){await api('business','PATCH',b);me=await api('me');data.reportCurrency=me.business.currency;language=me.business.language;localStorage.setItem('ox_language',language);}
 if(form.id==='invoice-form'){
  const finish=showInvoiceSaving(dialog,t);
  let inv;
  try{inv=await api('invoices','POST',{...b,items:cart,paid:cents(b.paid)},invoiceKey);}finally{finish();}
  dialog.close();
  const billing=navigate('billing',true),details=showInvoice(inv.id,inv);
  celebrateSale(inv,{money:value=>money(value,inv.currency),t,host:dialog.open?dialog:document.body});
  await Promise.all([billing,details]);return;
 }
 if(form.getAttribute('id')==='payment-form'){const iid=data.currentInvoice.id;await api('invoices/'+iid+'/payments','POST',{...b,amount:cents(b.amount)},op);dialog.close();await render();await showInvoice(iid);return;}
 if(form.getAttribute('id')==='void-form'){const iid=data.currentInvoice.id;await api('invoices/'+iid+'/void','POST',b,op);dialog.close();await render();await showInvoice(iid);return;}
 if(form.getAttribute('id')==='range-form'){data.dashboard=await api(`dashboard?from=${b.from}&to=${b.to}&currency=${data.reportCurrency||currentCurrency()}`);const d=data.dashboard;app.querySelector('.metrics').outerHTML=cards(d.summary);mountGrowthChart(app.querySelector('.sales-panel'),d,{t,money:reportMoney,currency:d.currency,locale:language==='bn'?'bn-IN':language==='hi'?'hi-IN':'en-IN'});form.closest('section').querySelector('.table-wrap').outerHTML=table(['category','amount'],[['net_sales',d.summary.net_sales],['cogs',d.summary.cogs],['gross',d.summary.gross_profit],['expenses',d.summary.expenses],['gst',d.summary.tax]].map(([k,v])=>[e(t(k)),reportMoney(v)]));enhanceCart(form.closest('section'),t);return;}
 dialog.close();toast(t('success'));await render();
 }catch(err){toast(err.message,true);}finally{delete form.dataset.busy;if(submit)submit.disabled=false;}});
function onHistoryChange(){
 const route=currentRoute();
 if(route!==page)navigate(route);
}
window.addEventListener('hashchange',onHistoryChange);
window.addEventListener('popstate',onHistoryChange);
for(const event of ['pointerdown','keydown','input'])app.addEventListener(event,()=>viewInteraction++);
function routeLink(event){
 const link=event.target.closest('a[href^="#"]');
 if(!link||!app.contains(link))return null;
 const route=link.getAttribute('href').slice(1);
 return Object.hasOwn(routes,route)?route:null;
}
app.addEventListener('click',event=>{
 if(!me||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const route=routeLink(event);
 if(!route)return;
 event.preventDefault();
 navigate(route,true);
});
for(const event of ['pointerover','focusin'])app.addEventListener(event,ev=>{
 const route=routeLink(ev);
 if(route&&route!==page)prefetch(route);
});window.addEventListener('offline',()=>toast(t('offline'),true));window.addEventListener('beforeinstallprompt',ev=>{ev.preventDefault();pendingInstall=ev;});
const menuToken=location.pathname.match(/^\/menu\/([a-f0-9-]+)\/?$/)?.[1];
if(menuToken){await publicRestaurantMenu(app,menuToken);}else{
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
app.innerHTML=`<main class="boot"><img class="bos-brand-image" src="/ros-brand.svg" width="840" height="234" alt="Restaurant OS. Powered by Oxodian Technology"><p>${e(t('loading'))}</p></main>`;
const providerRequest=api('auth/providers').then(value=>providers=value).catch(()=>{});
const sessionRequest=api('me');
const authError=new URL(location.href).searchParams.get('auth_error');if(authError){toast(authError,true);history.replaceState({},'',location.pathname+location.hash);}
try{
 me=await sessionRequest;
 language=localStorage.getItem('ox_language')||me.business.language;
 const opening=navigate(currentRoute());
 warmNavigation();
 await Promise.all([opening,providerRequest]);
 if(page==='settings'&&!dialog.open&&!viewInteraction)render();
}catch{await providerRequest;auth();}

}
