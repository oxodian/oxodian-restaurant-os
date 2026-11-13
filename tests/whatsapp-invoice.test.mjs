import {test} from 'node:test';
import assert from 'node:assert/strict';
import {whatsappInvoiceMessage} from '../public/whatsapp-invoice.js';

const invoice={customer_id:'buyer-1',customer:{name:'Aarav *Roy*'},business:{name:'Family Salon',category:'salon'},number:'26-42',created_at:'2026-11-11',total:500,paid:300,status:'final'};
const options={language:'en',t:key=>key,money:value=>'$'+value};

test('WhatsApp invoice draft formats the buyer, totals, and salon closing',()=>{
 const draft=whatsappInvoiceMessage(invoice,options);
 assert.match(draft,/^Dear \*Aarav Roy\*,\n\n/);
 assert.match(draft,/\*total:\* \$500\n\*paid:\* \$300\n\*due:\* \$200/);
 assert.match(draft,/next appointment\./);
});

test('WhatsApp walk-in drafts use a general greeting and mark void invoices',()=>{
 const draft=whatsappInvoiceMessage({...invoice,customer_id:null,status:'void',business:{name:'Corner shop',category:'grocery'}},options);
 assert.match(draft,/^Hello,\n\n/);
 assert.match(draft,/\*void\*/);
 assert.match(draft,/Happy shopping!/);
});
