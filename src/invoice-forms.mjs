import {FORM_CATALOG,defaultFormSchema} from '../public/form-catalog.js';
import {HttpError,text,date} from './domain.mjs';
const fail=message=>{throw new HttpError(400,message);};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const keys=(value,allowed)=>{if(!object(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('Invalid invoice form configuration');};
export function validateFormSchema(value={},gst=false,kind='invoice'){
 if(!FORM_CATALOG[kind])fail('Unknown business form');keys(value,['base_labels','optional','order','fields']);const catalog=FORM_CATALOG[kind],base=catalog.fields.map(x=>x[0]),labels=value.base_labels||{};keys(labels,base);
 const base_labels={};for(const key of Object.keys(labels))base_labels[key]=text(labels[key],60);
 const optionalKeys=catalog.fields.filter(x=>!x[2]).map(x=>x[0]),opt=value.optional||{};keys(opt,optionalKeys);const optional={};for(const key of optionalKeys){if(opt[key]!==undefined&&typeof opt[key]!=='boolean')fail('Invalid optional field');optional[key]=opt[key]??true;}
 if(gst){for(const key of ({invoice:['place_of_supply','buyer_address'],customer:['address','gstin','state_code'],product:['tax_bps','hsn'],business:['gstin','address']}[kind]||[]))optional[key]=true;}
 const order=value.order||base;if(!Array.isArray(order)||order.length!==base.length||new Set(order).size!==base.length||order.some(x=>!base.includes(x)))fail('Keep all protected base fields');
 const fields=value.fields||[];if(!Array.isArray(fields)||fields.length>12)fail('Use at most 12 additional fields');const ids=new Set();
 const normalized=fields.map(field=>{keys(field,['id','label','type','step','required','show_on_invoice','options']);if(!/^cf_[a-z0-9_]{1,40}$/.test(field.id)||ids.has(field.id))fail('Invalid or duplicate field ID');ids.add(field.id);if(!['text','number','date','checkbox','select'].includes(field.type)||!['buyer','payment'].includes(field.step)||typeof field.required!=='boolean'||typeof field.show_on_invoice!=='boolean')fail('Invalid field settings');const options=field.type==='select'?field.options:[];if(!Array.isArray(options)||options.length>10||field.type==='select'&&options.length<1)fail('Provide 1–10 choices');const choices=options.map(x=>text(x,60,true));if(new Set(choices).size!==choices.length)fail('Choices must be different');return {id:field.id,label:text(field.label,80,true),type:field.type,step:field.step,required:field.required,show_on_invoice:field.show_on_invoice,options:choices};});
 return {base_labels,optional,order,fields:normalized};
}
export function businessForm(business,row,kind='invoice'){let schema;try{schema=JSON.parse(row?.schema||'{}');}catch{schema=defaultFormSchema(kind);}return {kind,revision:row?.revision||0,schema:validateFormSchema(schema,!!business.gstin,kind)};}
export function snapshotForm(business,answers={},row,kind='invoice'){
 const config=businessForm(business,row,kind);if(!object(answers))fail('Invalid additional invoice information');const allowed=new Set(config.schema.fields.map(f=>f.id));if(Object.keys(answers).some(id=>!allowed.has(id)))fail('Invoice form changed. Reopen the invoice form');
 const values=config.schema.fields.map(field=>{let value=answers[field.id]??(field.type==='checkbox'?false:'');if(field.type==='checkbox'){if(typeof value!=='boolean')fail('Invalid checkbox value');if(field.required&&!value)fail('Complete required field: '+field.label);}else{value=text(value,500,field.required);if(value&&field.type==='number'&&(!/^-?\d+(?:\.\d+)?$/.test(value)||!Number.isFinite(Number(value))||Math.abs(Number(value))>1e12))fail('Enter a valid number: '+field.label);if(value&&field.type==='date')date(value);if(value&&field.type==='select'&&!field.options.includes(value))fail('Choose an option: '+field.label);}return {...field,value};});
 return {...config,values};
}
