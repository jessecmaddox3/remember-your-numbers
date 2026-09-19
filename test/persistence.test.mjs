import test from 'node:test';
import assert from 'node:assert/strict';
import {guardedWrite} from '../public/persistence.mjs';
function fixture(){let value='original',tail=Promise.resolve();return {storage:{getItem:()=>value,setItem:(k,v)=>value=v,removeItem:()=>value=null},locks:{request:(name,fn)=>{const job=tail.then(fn);tail=job.catch(()=>{});return job;}},read:()=>value};}
test('simultaneous stale writers cannot silently overwrite each other',async()=>{
 const f=fixture();let a='original',b='original';
 const result=await Promise.all([
  guardedWrite({...f,key:'test',expected:()=>a,value:'one',onSaved:v=>a=v}),
  guardedWrite({...f,key:'test',expected:()=>b,value:'two',onSaved:v=>b=v}),
 ]);
 assert.deepEqual(result.map(r=>r.status),['saved','conflict']);assert.equal(f.read(),'one');
});
test('erasure and replacement block stale snapshots, including a suspended storage event',async()=>{
 for(const value of [null,'replacement']){
  const f=fixture();await guardedWrite({...f,key:'test',expected:()=>'original',value});
  const stale=await guardedWrite({...f,key:'test',expected:()=>'original',value:'resurrected'});
  assert.equal(stale.status,'conflict');assert.equal(f.read(),value);
 }
});
test('own queued writes update the baseline inside the lock; obsolete writes are cancelled',async()=>{
 const f=fixture();let baseline='original';
 const args={...f,key:'test',expected:()=>baseline,onSaved:v=>baseline=v};
 const result=await Promise.all([guardedWrite({...args,value:'one'}),guardedWrite({...args,value:'two'}),guardedWrite({...args,value:'obsolete',isCurrent:()=>false})]);
 assert.deepEqual(result.map(r=>r.status),['saved','saved','cancelled']);assert.equal(f.read(),'two');
});
test('unavailable coordination or storage never writes an unsafe fallback',async()=>{
 const f=fixture();assert.equal((await guardedWrite({...f,locks:null,key:'test',expected:()=>'original',value:'new'})).status,'unavailable');assert.equal(f.read(),'original');
 const broken={getItem:()=>{throw new Error('blocked')},setItem:()=>assert.fail('must not write')};
 assert.equal((await guardedWrite({...f,storage:broken,key:'test',expected:()=>'original',value:'new'})).status,'unavailable');
});
