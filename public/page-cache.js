// Business data stays in memory and is discarded when the session changes.
export function createPageCache(fetchPage, now=Date.now){
 const entries=new Map();
 const pending=new Map();
 let generation=0;
 return {
  get(path){return entries.get(path);},
  read(path,maxAge=30000){
   const cached=entries.get(path);
   if(cached&&now()-cached.updatedAt<maxAge)return Promise.resolve(cached);
   if(pending.has(path))return pending.get(path);
   const started=generation;
   const request=Promise.resolve().then(()=>fetchPage(path)).then(value=>{
    if(started!==generation)return null;
    const entry={value,updatedAt:now()};
    entries.set(path,entry);
    return entry;
   }).finally(()=>{
    if(pending.get(path)===request)pending.delete(path);
   });
   pending.set(path,request);
   return request;
  },
  clear(){
   generation++;
   entries.clear();
   pending.clear();
  }
 };
}
