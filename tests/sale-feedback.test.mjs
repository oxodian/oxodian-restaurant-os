import {test} from 'node:test';
import assert from 'node:assert/strict';
import {celebrateSale} from '../public/sale-feedback.js';

test('sale celebration shows received money rather than invoice total and lasts exactly one second',()=>{
 const old={document:globalThis.document,matchMedia:globalThis.matchMedia,setTimeout:globalThis.setTimeout};let shown,timer,delay;
 function node(){return {children:[],style:{setProperty(){}},setAttribute(){},append(...nodes){this.children.push(...nodes);},remove(){this.removed=true;}};}
 try{globalThis.document={createElement:node,body:{append(n){shown=n;}}};globalThis.matchMedia=()=>({matches:false});globalThis.setTimeout=(fn,ms)=>{timer=fn;delay=ms;};celebrateSale({total:19900,paid:15000},{money:n=>'INR '+n/100,t:k=>k});assert.equal(shown.children[2].textContent,'INR 150');assert.equal(shown.children.filter(n=>n.className==='sale-confetti').length,42);assert.equal(delay,1000);timer();assert.equal(shown.removed,true);
 globalThis.matchMedia=()=>({matches:true});celebrateSale({total:19900,paid:0},{money:n=>'INR '+n/100,t:k=>k});assert.equal(shown.children[2].textContent,'INR 0');assert.equal(shown.children.length,4);assert.match(shown.className,/reduced/);
 }finally{Object.assign(globalThis,old);}
});
