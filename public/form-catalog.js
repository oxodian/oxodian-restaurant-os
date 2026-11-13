// Shared contract: presentation may change; identity and accounting inputs stay protected.
export const FORM_CATALOG={
 invoice:{label:'invoice',fields:[['buyer_name','buyer_name',true],['items','product_short',true],['total','total',true],['paid','paid',true],['method','payment',true],['buyer_phone','optional_whatsapp'],['buyer_address','address'],['due_date','due_date'],['place_of_supply','place']]},
 customer:{label:'customers',fields:[['name','name',true],['phone','phone'],['address','address'],['gstin','gstin'],['state_code','state'],['notes','notes']]},
 product:{label:'inventory',fields:[['name','name',true],['kind','kind',true],['unit','unit',true],['price','price',true],['sku','sku'],['cost','cost'],['stock','stock'],['low_stock','low_stock'],['tax_bps','tax'],['hsn','hsn'],['photo_data','item_photo']]},
 supplier:{label:'suppliers',fields:[['name','name',true],['phone','phone'],['address','address']]},
 purchase:{label:'purchases',fields:[['product_id','product',true],['quantity','quantity',true],['cost','cost',true],['supplier_id','suppliers'],['reference','reference']]},
 expense:{label:'expenses',fields:[['category','category',true],['amount','amount',true],['date','date',true],['note','note']]},
 adjustment:{label:'adjust',fields:[['quantity','quantity',true],['reason','reason',true]]},
 payment:{label:'collect',fields:[['amount','amount',true],['method','payment',true]]},
 business:{label:'business_profile',fields:[['name','business',true],['category','category',true],['currency','currency',true],['country','country'],['state_code','state'],['language','language',true],['address','address'],['phone','phone'],['gstin','gstin']]}
};
export function defaultFormSchema(kind){const catalog=FORM_CATALOG[kind];if(!catalog)throw Error('Unknown business form');return {base_labels:{},optional:Object.fromEntries(catalog.fields.filter(x=>!x[2]).map(x=>[x[0],true])),order:catalog.fields.map(x=>x[0]),fields:[]};}
