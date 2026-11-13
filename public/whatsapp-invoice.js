const clean=value=>String(value??'').replace(/[\r\n\t*_~`]+/g,' ').replace(/\s+/g,' ').trim();
const copy={
 en:{dear:'Dear',hello:'Hello,',intro:'Here is your invoice from',thanks:'Thank you for choosing',again:'We look forward to seeing you again.',salon:'We look forward to welcoming you back for your next appointment.',repair:'If you need help with your repair, just reply here. We look forward to helping you again.',tailoring:'We look forward to helping with your next fitting or alteration.',retail:'We hope to see you again soon. Happy shopping!',jewellery:'We look forward to helping you find something special on your next visit.'},
 bn:{dear:'প্রিয়',hello:'নমস্কার,',intro:'আপনার ইনভয়েস পাঠাল',thanks:'আমাদের বেছে নেওয়ার জন্য ধন্যবাদ',again:'আবার আসবেন।',salon:'পরের অ্যাপয়েন্টমেন্টে আপনাকে আবার স্বাগত জানাতে চাই।',repair:'মেরামতি নিয়ে কোনও প্রশ্ন থাকলে এখানেই জানাবেন। আবার আসবেন।',tailoring:'পরের ফিটিং বা পোশাকের কাজের জন্য আবার আসবেন।',retail:'আবার আসবেন। আপনার কেনাকাটা আনন্দের হোক।',jewellery:'পরের বারও আপনার পছন্দের গয়না খুঁজে দিতে পারলে ভালো লাগবে।'},
 hi:{dear:'प्रिय',hello:'नमस्ते,',intro:'आपका इनवॉइस भेजा है',thanks:'हमें चुनने के लिए धन्यवाद',again:'फिर आइएगा।',salon:'आपकी अगली अपॉइंटमेंट पर फिर से आपका स्वागत है।',repair:'मरम्मत से जुड़ा सवाल हो तो यहीं जवाब दें। फिर आइएगा।',tailoring:'अगली फ़िटिंग या बदलाव के लिए फिर आइएगा।',retail:'फिर आइएगा। खरीदारी का आनंद लें!',jewellery:'अगली बार भी आपके लिए कुछ खास ढूँढने में हमें खुशी होगी।'}
};
export function whatsappInvoiceMessage(invoice,{language,t,money}){
 const words=copy[language]||copy.en, name=clean(invoice.customer.name), business=clean(invoice.business.name);
 const category=invoice.business.category;
 const closing=['grocery','electronics'].includes(category)?words.retail:['salon','repair','tailoring','retail','jewellery'].includes(category)?words[category]:words.again;
 const greeting=invoice.customer_id&&name?`${words.dear} *${name}*,`:words.hello;
 const amount=(key,value)=>`*${t(key)}:* ${money(value)}`;
 const details=[`*${t('invoice')} ${clean(invoice.number)}*`,`${t('date')}: ${clean(invoice.created_at?.slice(0,10))}`];
 if(invoice.status==='void')details.push(`*${t('void')}*`);
 return [greeting,`${words.intro} *${business}*.`,details.join('\n'),[amount('total',invoice.total),amount('paid',invoice.paid),amount('due',invoice.total-invoice.paid)].join('\n'),`${words.thanks}${language==='en'?' *'+business+'*':''}.\n${closing}\n— ${business}`].join('\n\n');
}
