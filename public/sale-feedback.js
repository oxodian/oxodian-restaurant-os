export function showInvoiceSaving(dialog,t){
 const progress=document.createElement('div');
 progress.className='invoice-saving';
 progress.setAttribute('role','status');
 const spinner=document.createElement('span');
 spinner.className='invoice-saving-spinner';
 spinner.setAttribute('aria-hidden','true');
 progress.append(spinner,document.createTextNode(t('creating_invoice')));
 const content=[...dialog.children];
 for(const child of content)child.inert=true;
 const prevent=event=>event.preventDefault();
 dialog.addEventListener('cancel',prevent);
 dialog.append(progress);
 return ()=>{
  progress.remove();
  dialog.removeEventListener('cancel',prevent);
  for(const child of content)child.inert=false;
 };
}
export function celebrateSale(invoice,{money,t,host=document.body}){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,overlay=document.createElement('div');overlay.className='invoice-sale-celebration'+(reduced?' reduced':'');overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');const check=document.createElement('span');check.className='sale-success-check';check.textContent='✓';check.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=t('sale_received');const amount=document.createElement('strong');amount.textContent=money(invoice.paid);const note=document.createElement('span');note.textContent=t('sale_created');overlay.append(check,label,amount,note);
 if(!reduced){for(let i=0;i<42;i++){const piece=document.createElement('i');piece.className='sale-confetti';piece.setAttribute('aria-hidden','true');piece.style.setProperty('--x',`${(i*37)%101}%`);piece.style.setProperty('--shift',`${(i%2?1:-1)*(35+i%6*15)}px`);piece.style.setProperty('--spin',`${(i%2?1:-1)*(180+i*29)}deg`);piece.style.setProperty('--delay',`${i%7*18}ms`);piece.style.setProperty('--color',['#13b84e','#ffce48','#ff7b67','#7f68df','#64d9b7'][i%5]);overlay.append(piece);}}
 host.append(overlay);setTimeout(()=>overlay.remove(),1000);
}
