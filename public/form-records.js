const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function extraValues(record){try{return record.form_details?.values||JSON.parse(record.form_snapshot||'{}').values||[];}catch{return [];}}
export function extraValue(field,t){return field.type==='checkbox'?t(field.value?'yes':'no'):String(field.value??'');}
export function recordExtras(record,t,{print=false}={}){const fields=extraValues(record).filter(f=>(!print||f.show_on_invoice)&&(f.type==='checkbox'||f.value!==''));return fields.length?`<dl class="record-custom-values">${fields.map(field=>`<div><dt>${escape(field.label)}</dt><dd>${escape(extraValue(field,t))}</dd></div>`).join('')}</dl>`:'';}
