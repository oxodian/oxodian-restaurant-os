import {COUNTRY_CURRENCY} from './countries.js';
// Country is profile information only. Currency is always an independent choice.
export const CURRENCIES=Object.freeze(Intl.supportedValuesOf('currency'));
export function validCurrency(value){return typeof value==='string'&&CURRENCIES.includes(value);}
export function currencyChoices(locale='en'){const names=new Intl.DisplayNames([locale],{type:'currency'});return CURRENCIES.map(code=>[code,`${code} · ${names.of(code)}`]);}
const digits=new Map();export function currencyDigits(currency='USD'){if(!digits.has(currency))digits.set(currency,new Intl.NumberFormat('en',{style:'currency',currency}).resolvedOptions().maximumFractionDigits);return digits.get(currency);}
export const currencyScale=currency=>10**currencyDigits(currency);
const moneyFormats=new Map();
const symbols=new Map();
export function formatMoney(value,currency='USD',locale='en-IN',compact=false){
 const key=JSON.stringify([currency,locale,compact]);
 if(!moneyFormats.has(key)){
  const digits=currencyDigits(currency);
  moneyFormats.set(key,new Intl.NumberFormat(locale,{style:'currency',currency,minimumFractionDigits:compact?0:digits,maximumFractionDigits:digits}));
 }
 return moneyFormats.get(key).format((value||0)/currencyScale(currency));
}
export function currencySymbol(currency='USD',locale='en'){
 const key=JSON.stringify([currency,locale]);
 if(!symbols.has(key))symbols.set(key,new Intl.NumberFormat(locale,{style:'currency',currency,currencyDisplay:'narrowSymbol'}).formatToParts(0).find(x=>x.type==='currency')?.value||currency);
 return symbols.get(key);
}
export function countries(locale='en'){const names=new Intl.DisplayNames([locale],{type:'region'});return Object.keys(COUNTRY_CURRENCY).map(code=>[code,names.of(code)]).sort((a,b)=>a[1].localeCompare(b[1],locale));}
