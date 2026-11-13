import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPageCache} from '../public/page-cache.js';

test('prefetch and navigation share an in-flight request and reuse its data',async()=>{
 let count=0,time=0;
 const cache=createPageCache(async path=>{count++;return {path};},()=>time);
 const first=cache.read('invoices');
 assert.equal(cache.read('invoices'),first);
 const result=await first;
 assert.equal(cache.get('invoices'),result);
 assert.equal(await cache.read('invoices'),result);
 assert.equal(count,1);
 time=31000;
 assert.notEqual(await cache.read('invoices'),result);
 assert.equal(count,2);
});

test('an old request cannot repopulate the cache after saving or signing out',async()=>{
 const resolvers=[];
 const cache=createPageCache(()=>new Promise(resolve=>resolvers.push(resolve)));
 const old=cache.read('products');
 await Promise.resolve();
 cache.clear();
 const current=cache.read('products');
 await Promise.resolve();
 resolvers[0](['old']);
 assert.equal(await old,null);
 assert.equal(cache.get('products'),undefined);
 assert.equal(cache.read('products'),current);
 resolvers[1](['current']);
 assert.deepEqual((await current).value,['current']);
});
