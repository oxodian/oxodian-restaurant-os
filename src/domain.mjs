export class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
export function kolkataDay(timestamp=Date.now()){return new Date(timestamp+19800000).toISOString().slice(0,10);}
export function text(value,max=200,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new HttpError(400,'Invalid text field');return value.trim();}
export function integer(value,min=0,max=100000000000){if(!Number.isSafeInteger(value)||value<min||value>max)throw new HttpError(400,'Invalid numeric value');return value;}
export function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value).toISOString().slice(0,10)!==value)throw new HttpError(400,'Invalid date');return value;}
export function calculate(lines,business,place){
 const items=lines.map(({product,quantity,agreedNet})=>{integer(quantity,1,100000000);const net=integer(agreedNet??Math.round(product.price*quantity/1000));const tax=Math.round(net*(business.gstin?product.tax_bps:0)/10000);return {...product,quantity,net,tax};});
 const subtotal=items.reduce((s,x)=>s+x.net,0),tax=items.reduce((s,x)=>s+x.tax,0),interstate=place!==business.state_code;
 const cgst=interstate?0:items.reduce((s,x)=>s+Math.floor(x.tax/2),0),sgst=interstate?0:tax-cgst;
 const cogs=items.reduce((s,x)=>s+Math.round(x.cost*x.quantity/1000),0);
 integer(subtotal);integer(tax);integer(cogs);return {items,subtotal,cgst,sgst,igst:interstate?tax:0,total:subtotal+tax,cogs};
}
export function predictReturn(dates){
 const days=[...new Set(dates.map(x=>x.slice(0,10)))].sort();if(days.length<4)return {status:'insufficient_history',visits:days.length};
 const intervals=days.slice(1).map((d,i)=>(Date.parse(d)-Date.parse(days[i]))/86400000).slice(-8);const sorted=[...intervals].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2),median=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
 const deviation=intervals.reduce((s,x)=>s+Math.abs(x-median),0)/intervals.length;
 return {status:'estimated',expected_date:new Date(Date.parse(days.at(-1))+Math.round(median)*86400000).toISOString().slice(0,10),interval_days:Math.round(median),consistency:deviation<=median*.2?'regular':'variable',basis:'Median of up to 8 distinct-day purchase intervals; not a probability.'};
}
export const addons=[{id:'salon',name:'Salon & beauty',features:['Appointments','Staff','Service history']},{id:'tailoring',name:'Tailoring',features:['Measurements','Orders','Delivery dates']},{id:'grocery',name:'Grocery',features:['Barcodes','Expiry batches','Unit conversion']},{id:'electronics',name:'Electronics',features:['IMEI / serial','Warranty']},{id:'repair',name:'Repair services',features:['Job cards','Parts','Technicians']},{id:'jewellery',name:'Jewellery',features:['Metal rates','Weight','Making charges']}].map(a=>({...a,status:'planned'}));
