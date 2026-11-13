// Continuous screens keep every record and field available in one scrolling workspace.
import {uiIcon,createShareView} from './invoice-design.js';
let translator=k=>k;
function el(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
function formSteps(form){if(form)form.classList.add('continuous-form');}
function tables(root){for(const wrap of root.querySelectorAll('.table-wrap')){
 if(wrap.closest('.print-invoice')||wrap.dataset.easyTable)continue;wrap.dataset.easyTable='true';const table=wrap.querySelector('table'),rows=[...table.tBodies[0].rows],headers=[...table.tHead.rows[0].cells].map(c=>c.textContent);table.classList.add('flow-table');
 for(const row of rows){[...row.cells].forEach((cell,i)=>{cell.dataset.label=headers[i];if(i===0)cell.classList.add('flow-title');if(cell.querySelector('button,a'))cell.classList.add('flow-actions');});}
 const search=wrap.closest('.panel')?.querySelector('#search');if(search)search.addEventListener('input',()=>{const query=search.value.toLocaleLowerCase().trim();rows.forEach(row=>row.hidden=!row.textContent.toLocaleLowerCase().includes(query));});
 }}
export function enhanceWorkspace(root,t,page){translator=t;root.dataset.page=page;const content=root.querySelector('.content');if(!content)return;content.classList.add('continuous-workspace');
 if(page==='settings'){const more=content.querySelector('.more-grid'),customer=el('a',null,t('customers'));customer.href='#customers';more.prepend(customer);if(root.querySelector('a[href="#admin"]')){const owner=el('a',null,t('admin'));owner.href='#admin';more.append(owner);}}
 tables(content);
}
export function enhanceAuth(root,t){translator=t;const form=root.querySelector('#auth-form');if(form)formSteps(form);}
function readyFooter(t){
 const footer=el('footer','invoice-ready-footer'),create=el('button','primary ready-create');
 create.type='button';create.dataset.action='ready-new-invoice';create.append(uiIcon('plus'),el('span',null,t('create_new_invoice')));
 const nav=el('nav','ready-navigation');nav.setAttribute('aria-label',t('workspace_navigation'));
 for(const [route,icon,label] of [['dashboard','home','nav_dashboard'],['billing','overview','nav_billing'],['inventory','items','nav_inventory'],['settings','more','more_short']]){
  const button=el('button','ready-nav-button');button.type='button';button.dataset.action='ready-navigate';button.dataset.route=route;
  if(route===(location.hash.slice(1)||'dashboard'))button.setAttribute('aria-current','page');
  button.append(uiIcon(icon),el('span',null,t(label)));nav.append(button);
 }
 footer.append(create,nav);return footer;
}
export function enhanceModal(dialog,t,{ready=false}={}){translator=t;dialog.classList.remove('invoice-create-dialog','invoice-view-dialog','invoice-payment-dialog','invoice-ready-dialog');const form=dialog.querySelector('form');if(form){if(form.getAttribute('id')!=='invoice-form')formSteps(form);}
 else if(dialog.querySelector('#invoice-document')){
  const doc=dialog.querySelector('#invoice-document'),brand=doc.querySelector('.receipt-brand'),meta=doc.querySelector('.receipt-meta'),totals=doc.querySelector('.receipt-totals'),buttons=dialog.querySelector('.button-row'),note=buttons.nextElementSibling,payments=dialog.querySelector('.payment-history');
  const host=el('div','invoice-views'),sharing=createShareView({brand,meta,totals,buttons,note,t,ready});
  const actions=el('div','invoice-record-actions');
  actions.append(...buttons.querySelectorAll('[data-action="payment"],[data-action="void"],[data-action="invoice-trash"]'));
  if(actions.children.length)sharing.append(actions);
  if(payments.querySelector('tbody')){
   const history=el('details','invoice-payment-details');history.append(el('summary',null,t('payment_history')),payments);sharing.append(history);
  }else payments.remove();
  host.append(sharing);
  doc.remove();buttons.remove();
  dialog.append(host,readyFooter(t));
  dialog.classList.add('invoice-view-dialog','invoice-ready-dialog');
  const close=dialog.querySelector('.dialog-heading [data-action="close"]');
  close.textContent='×';close.classList.add('sheet-close');close.setAttribute('aria-label',t('close'));
 }
 tables(dialog);
}
export function enhanceCart(root,t){translator=t;tables(root);}

