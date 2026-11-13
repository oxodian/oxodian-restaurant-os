import {cropPhoto} from './product-photo.js';

export function mountWorkspaceLogo(host,{t,logo='',upload}){
 const choose=host.querySelector('[data-logo-choose]'),remove=host.querySelector('[data-logo-remove]');
 const input=host.querySelector('input[type="file"]'),value=host.querySelector('[name="profile_logo_data"]');
 const preview=host.querySelector('img'),status=host.querySelector('[role="status"]');
 function paint(next){
  preview.hidden=!next;remove.hidden=!next;
  if(next)preview.src=next;else preview.removeAttribute('src');
  if(value)value.value=next;
 }
 async function save(next){
  choose.disabled=remove.disabled=true;
  try{
   if(upload){status.textContent=t('logo_saving');await upload(next);}
   paint(next);status.textContent=t(next?'logo_saved':'photo_removed');
  }catch(error){status.textContent=t(error.message);}
  finally{choose.disabled=remove.disabled=false;}
 }
 choose.addEventListener('click',()=>input.click());
 remove.addEventListener('click',()=>save(''));
 input.addEventListener('change',async()=>{
  const file=input.files[0];input.value='';
  if(!file)return;
  if(file.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){
   status.textContent=t('logo_file_error');return;
  }
  choose.disabled=true;
  try{await cropPhoto(file,{t,onSave:next=>{if(host.isConnected)void save(next);},parent:document.body,profile:true});}
  catch(error){status.textContent=t('logo_file_error');}
  finally{if(remove.disabled===false)choose.disabled=false;}
 });
 paint(logo);
}
