import {formatMoney} from './currency.js';
// Entirely local generation: browser canvas + a small PDF image-page encoder.
// No external rendering service, remote fonts, paid APIs or customer-data uploads.
const W=1240,H=1754,M=70,BOTTOM=1620;
export const invoiceThemes={
 emerald:{accent:'#08754b',dark:'#124b38',light:'#e8f5ed',stripe:'#f4faf6',total:'#cfead8'},
 midnight:{accent:'#345ca7',dark:'#233c70',light:'#edf3ff',stripe:'#f5f8fd',total:'#dbe7fc'},
 classic:{accent:'#4d4d4d',dark:'#202020',light:'#f1f1f1',stripe:'#fafafa',total:'#e4e4e4'}
};
function canvas(){const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,H);return c;}
function wrapped(g,text,width){const lines=[];let line='';for(const char of String(text||'')){if(char==='\n'){lines.push(line);line='';continue;}if(g.measureText(line+char).width>width&&line){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);return lines;}
function text(g,value,x,y,{size=24,color='#253a30',weight=400,width=1000,align='left'}={}){g.font=`${weight} ${size}px "Segoe UI",sans-serif`;g.fillStyle=color;g.textAlign=align;const lines=align==='right'?[String(value)]:wrapped(g,value,width);for(const line of lines){g.fillText(line,x,y,width);y+=size*1.42;}g.textAlign='left';return y;}
function rect(g,x,y,w,h,fill,r=14){g.fillStyle=fill;g.beginPath();g.roundRect(x,y,w,h,r);g.fill();}
async function loadImage(src){const img=new Image();img.src=src;try{await img.decode();return img;}catch{return null;}}

export async function renderInvoicePages(inv,theme='emerald'){
 const palette=Object.hasOwn(invoiceThemes,theme)?invoiceThemes[theme]:invoiceThemes.emerald;
 const cash=n=>formatMoney(n,inv.currency||inv.business.currency||'USD');
 await document.fonts.ready;const [logo,platformLogo]=await Promise.all([inv.brand_logo?.startsWith('data:image/png;base64,')?loadImage(inv.brand_logo):null,loadImage('/ros-brand.svg')]);const pages=[];let c,g,y;
 const date=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'}).format(new Date(inv.created_at.replace(' ','T')+'Z'));
 function start(continued=false){c=canvas();g=c.getContext('2d');pages.push(c);rect(g,0,0,W,14,palette.accent,0);if(continued){y=text(g,inv.business.name,M,72,{size:28,weight:750,width:730});text(g,inv.number,W-M,72,{size:24,align:'right',width:320});y=Math.max(125,y+28);return;}
  let x=M;if(logo){const scale=Math.min(100/logo.naturalWidth,100/logo.naturalHeight);g.drawImage(logo,M,64,logo.naturalWidth*scale,logo.naturalHeight*scale);x+=125;}
  y=text(g,inv.business.name,x,92,{size:37,weight:750,width:710-(x-M),color:palette.dark});if(inv.business.address)y=text(g,inv.business.address,x,y+3,{size:21,width:700-(x-M)});if(inv.business.phone)y=text(g,'Phone: '+inv.business.phone,x,y+3,{size:21,width:700-(x-M)});if(inv.business.gstin)y=text(g,'GSTIN: '+inv.business.gstin,x,y+3,{size:21,width:700-(x-M)});
  if(inv.business.fssai)y=text(g,'FSSAI: '+inv.business.fssai,x,y+3,{size:21,width:700-(x-M)});
  rect(g,W-M-315,54,315,48,palette.dark,12);text(g,inv.business.gstin?'TAX INVOICE':'INVOICE',W-M-18,86,{size:27,weight:750,color:'#fff',align:'right',width:279});text(g,inv.number,W-M,126,{size:25,weight:650,align:'right',width:330});text(g,date,W-M,163,{size:22,align:'right',width:330});text(g,inv.currency||inv.business.currency||'USD',W-M,194,{size:18,align:'right',width:330});y=Math.max(215,y+18);
  g.font='23px "Segoe UI",sans-serif';const customerLines=wrapped(g,inv.customer.address||'',1000);g.font='700 27px "Segoe UI",sans-serif';const nameLines=wrapped(g,inv.customer.name,1010).length;const h=160+Math.max(0,nameLines-1)*39+customerLines.length*33+(inv.customer.gstin?34:0);rect(g,M,y,W-M*2,h,palette.light);let by=y+34;text(g,'BILL TO',M+22,by,{size:20,weight:750,color:'#577263'});by=text(g,inv.customer.name,M+22,by+38,{size:27,weight:700,width:1010});if(inv.customer.phone)by=text(g,'Phone / WhatsApp: '+inv.customer.phone,M+22,by+1,{size:22,width:1010});else by+=24;if(inv.customer.address)by=text(g,inv.customer.address,M+22,by+1,{size:23,width:1000});if(inv.customer.gstin)text(g,'GSTIN: '+inv.customer.gstin,M+22,by+2,{size:22});y+=h+25;
 }
 const columns=[{x:M+10,w:45,name:'#'},{x:M+60,w:425,name:'Item / service'},{x:M+590,w:100,name:'Qty',align:'right'},{x:M+755,w:150,name:'Rate',align:'right'},{x:M+905,w:140,name:'GST',align:'right'},{x:W-M-10,w:180,name:'Amount',align:'right'}];
 function tableHead(){rect(g,M,y,W-2*M,48,palette.dark,10);columns.forEach(col=>text(g,col.name,col.x,y+32,{size:21,weight:700,color:'#fff',width:col.w,align:col.align}));y+=58;}
 function ensure(h,table=false){if(y+h>BOTTOM){start(true);if(table)tableHead();}}
 start();tableHead();
 inv.items.forEach((item,index)=>{g.font='600 24px "Segoe UI",sans-serif';const lines=wrapped(g,item.name,425),height=Math.max(90,lines.length*35+58);ensure(height,true);if(index%2===0)rect(g,M,y-4,W-M*2,height,palette.stripe,0);text(g,String(index+1),M+10,y+25,{size:21,width:45});let end=text(g,item.name,M+60,y+25,{size:24,weight:600,width:425});text(g,`HSN/SAC: ${item.hsn||'—'} · ${item.unit}`,M+60,end+1,{size:19,color:'#617268',width:425});text(g,String(item.quantity/1000),M+590,y+25,{size:23,align:'right',width:100});text(g,cash(item.price),M+755,y+25,{size:23,align:'right',width:150});text(g,`${inv.business.gstin?item.tax_bps/100:0}%`,M+905,y+25,{size:21,align:'right',width:140});text(g,cash(item.tax),M+905,y+54,{size:20,color:'#617268',align:'right',width:140});text(g,cash(item.net+item.tax),W-M-10,y+25,{size:23,weight:650,align:'right',width:180});y+=height;g.strokeStyle='#e3ebe5';g.beginPath();g.moveTo(M,y);g.lineTo(W-M,y);g.stroke();y+=9;});
 const extras=(inv.form_details?.values||[]).filter(f=>f.show_on_invoice&&(f.type==='checkbox'||f.value!==''));if(extras.length){ensure(70);y+=22;text(g,'ADDITIONAL INFORMATION',M,y,{size:22,weight:750,color:palette.dark});y+=28;for(const field of extras){const value=field.type==='checkbox'?(field.value?'Yes':'No'):String(field.value);g.font='600 22px "Segoe UI",sans-serif';const leftLines=wrapped(g,field.label,330).length;g.font='400 22px "Segoe UI",sans-serif';const rightLines=wrapped(g,value,700).length;const height=Math.max(leftLines,rightLines)*32+20;ensure(height);rect(g,M,y,W-M*2,height,palette.stripe,8);text(g,field.label,M+14,y+30,{size:22,weight:600,width:330});text(g,value,M+365,y+30,{size:22,width:700});y+=height+6;}}
 const taxRows=inv.business.gstin?[['CGST',inv.cgst],['SGST',inv.sgst],['IGST',inv.igst]]:[];const rows=[['Items subtotal',inv.subtotal],...taxRows,['Total amount',inv.total],['Paid',inv.paid],['Amount due',inv.total-inv.paid]];const block=rows.length*47+105;ensure(block);y+=20;const summaryTop=y;rect(g,650,y,W-M-650,rows.length*47+24,palette.light);y+=37;
 for(const [label,value]of rows){const total=label==='Total amount',due=label==='Amount due';if(total||due)rect(g,660,y-29,W-M-670,44,due?'#fff1bf':palette.total,8);text(g,label,672,y,{size:23,weight:total||due?750:400,width:250});text(g,cash(value),W-M-17,y,{size:total||due?27:24,weight:total||due?750:600,align:'right',width:230});y+=47;}
 let noteY=summaryTop+30;noteY=text(g,'Place of supply: '+inv.place_of_supply,M,noteY,{size:22,width:520});noteY=text(g,'Reverse charge: No',M,noteY+8,{size:22,width:520});if(inv.restaurant_bill?.discount)noteY=text(g,'Discount included: '+cash(inv.restaurant_bill.discount),M,noteY+8,{size:22,width:520});if(inv.due_date)noteY=text(g,'Due date: '+inv.due_date,M,noteY+8,{size:22,width:520});text(g,inv.status==='void'?'VOID / CANCELLED':inv.paid>=inv.total?'PAID IN FULL':'PAYMENT DUE',M,noteY+22,{size:24,weight:750,color:inv.status==='void'?'#a63821':palette.accent,width:520});
 pages.forEach((page,i)=>{const ctx=page.getContext('2d');if(inv.status==='void'){ctx.save();ctx.translate(W/2,H/2);ctx.rotate(-.5);ctx.globalAlpha=.1;text(ctx,'VOID',0,0,{size:180,weight:800,color:'#b92717',align:'center'});ctx.restore();}ctx.strokeStyle='#d8e5dc';ctx.beginPath();ctx.moveTo(M,1665);ctx.lineTo(W-M,1665);ctx.stroke();text(ctx,'Thank you for your business.',M,1702,{size:21,color:'#506c5a'});if(platformLogo)ctx.drawImage(platformLogo,W-M-315,1675,216,216*platformLogo.naturalHeight/platformLogo.naturalWidth);text(ctx,`${i+1} / ${pages.length}`,W-M,1702,{size:20,color:'#617268',align:'right',width:90});});
 return pages;
}
function blob(canvas,type='image/png',quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Image export failed')),type,quality));}
export async function invoicePNG(inv,theme){
 const pages=await renderInvoicePages(inv,theme);
 if(pages.length===1)return blob(pages[0]);
 const out=document.createElement('canvas');out.width=W;out.height=H*pages.length;
 const context=out.getContext('2d');
 pages.forEach((page,index)=>context.drawImage(page,0,index*H));
 return blob(out);
}

async function pdfImage(page){
 if(!globalThis.CompressionStream)return {bytes:new Uint8Array(await (await blob(page,'image/jpeg',.98)).arrayBuffer()),filter:'DCTDecode'};
 const rgba=page.getContext('2d').getImageData(0,0,page.width,page.height).data;
 const rgb=new Uint8Array(page.width*page.height*3);
 for(let source=0,target=0;source<rgba.length;source+=4){
  rgb[target++]=rgba[source];rgb[target++]=rgba[source+1];rgb[target++]=rgba[source+2];
 }
 const compressed=new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'));
 return {bytes:new Uint8Array(await new Response(compressed).arrayBuffer()),filter:'FlateDecode'};
}

// A4 PDF pages contain the same artwork as the PNG.
export async function imagePagesPDF(pages){
 const encoder=new TextEncoder(),parts=[],offsets=[0];let position=0;const put=bytes=>{if(typeof bytes==='string')bytes=encoder.encode(bytes);parts.push(bytes);position+=bytes.length;};const object=(id,content)=>{offsets[id]=position;put(`${id} 0 obj\n${content}\nendobj\n`);};
 put('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
 for(let i=0;i<pages.length;i++){const id=3+i*3,page=pages[i],{bytes,filter}=await pdfImage(page);object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im${i} ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);offsets[id+1]=position;put(`${id+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /${filter} /Length ${bytes.length} >>\nstream\n`);put(bytes);put('\nendstream\nendobj\n');const stream=`q\n595.28 0 0 841.89 0 0 cm\n/Im${i} Do\nQ\n`;object(id+2,`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);}
 const xref=position;put(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(let i=1;i<offsets.length;i++)put(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);put(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);return new Blob(parts,{type:'application/pdf'});
}
export async function invoicePDF(inv,theme){return imagePagesPDF(await renderInvoicePages(inv,theme));}

export async function optimizeLogo(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('logo_file_error');
 const url=URL.createObjectURL(file),image=new Image();image.src=url;try{await image.decode();if(image.naturalWidth*image.naturalHeight>24000000)throw Error('logo_file_error');for(const size of [280,220,160,100]){const c=document.createElement('canvas'),scale=Math.min(1,size/Math.max(image.naturalWidth,image.naturalHeight));c.width=Math.max(1,Math.round(image.naturalWidth*scale));c.height=Math.max(1,Math.round(image.naturalHeight*scale));c.getContext('2d').drawImage(image,0,0,c.width,c.height);const data=c.toDataURL('image/png');if(data.length<=48000)return data;}throw Error('logo_file_error');}finally{URL.revokeObjectURL(url);}
}

export function mountInvoiceLogo(dialog,{t,logo,upload,onError,host}){
 const share=host||dialog.querySelector('.share-studio');if(!share)return;const details=document.createElement('details');details.className='invoice-logo-tools';const summary=document.createElement('summary');summary.textContent=t('invoice_logo');const preview=document.createElement('img');preview.alt=t('business_logo');preview.hidden=!logo;if(logo)preview.src=logo;const label=document.createElement('label');label.className='invoice-logo-upload';label.append(document.createTextNode(t('choose_logo')));const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.setAttribute('aria-label',t('choose_logo'));label.append(input);const note=document.createElement('p');note.textContent=t('logo_hint');const remove=document.createElement('button');remove.type='button';remove.className='outline';remove.textContent=t('remove_logo');remove.hidden=!logo;const status=document.createElement('p');status.setAttribute('role','status');details.append(summary,preview,label,remove,note,status);share.append(details);
 async function save(value){input.disabled=remove.disabled=true;status.textContent=t('logo_saving');try{await upload(value);preview.hidden=!value;if(value)preview.src=value;else preview.removeAttribute('src');remove.hidden=!value;status.textContent=t('logo_saved');}catch(e){status.textContent=t(e.message);onError(e);}finally{input.disabled=remove.disabled=false;input.value='';}}
 input.addEventListener('change',async()=>{if(!input.files[0])return;try{await save(await optimizeLogo(input.files[0]));}catch(e){status.textContent=t(e.message);onError(e);}});remove.addEventListener('click',()=>save(''));
}
