import test from 'node:test';
import assert from 'node:assert/strict';
import {chunkDigits,levelsFor,makeChoices,newProgress,completeLevel,isLevelAvailable,isReviewDue,recordReviewMiss,PROVE_DELAY_MS,REVIEW_BASE_MS,REVIEW_CAP_MS} from '../public/logic.mjs';
import {validateConfig,numberSignature,normalizeStore,validateBackup} from '../public/state.mjs';
import {DEMO_CONFIG} from '../public/data.mjs';
const copy=x=>JSON.parse(JSON.stringify(x));

test('leading zeros and backward-chained chunks survive the full ladder',()=>{
 assert.deepEqual(chunkDigits('001728',[3,3]),['001','728']);
 assert.deepEqual(levelsFor([2,2,2]).filter(l=>l.kind==='fill').map(l=>l.hiddenChunks),[[2],[1,2],[0,1,2]]);
 const levels=levelsFor([3,3]);let p=newProgress(),now=1_000_000;
 for(let i=0;i<levels.length-1;i++)p=completeLevel(p,levels,i,now);
 assert.equal(p.mastered,false);assert.equal(isLevelAvailable(p,levels,levels.length-1,now+PROVE_DELAY_MS-1),false);
 assert.equal(isLevelAvailable(p,levels,levels.length-1,now+PROVE_DELAY_MS),true);
 p=completeLevel(p,levels,levels.length-1,now+PROVE_DELAY_MS);
 assert.equal(p.mastered,true);assert.equal(p.reviewIntervalMs,REVIEW_BASE_MS);
 assert.equal(isReviewDue(p,p.nextReviewAt-1),false);assert.equal(isReviewDue(p,p.nextReviewAt),true);
 for(let i=0;i<8;i++)p=completeLevel(p,levels,levels.length-1,p.nextReviewAt);
 assert.equal(p.reviewIntervalMs,REVIEW_CAP_MS);
 p=recordReviewMiss(p,p.nextReviewAt);assert.equal(p.reviewIntervalMs,REVIEW_BASE_MS);
});
test('three distinct equal-length choices exist even with a degenerate random source',()=>{
 for(const answer of ['0','000','111','001728']){
  const choices=makeChoices([answer],0,()=>0);
  assert.equal(choices.length,3);assert.equal(new Set(choices).size,3);assert.ok(choices.includes(answer));
  assert.ok(choices.every(c=>c.length===answer.length&&/^\d+$/.test(c)));
 }
});
test('configuration keeps digit strings, strips unknown fields and rejects duplicate or unsafe IDs',()=>{
 const c=copy(DEMO_CONFIG);c.secret='not retained';const v=validateConfig(c);assert.equal(v.secret,undefined);assert.equal(v.profiles[0].numbers[1].digits,'001728');
 for(const id of ['__proto__','constructor','prototype']){const x=copy(c);x.profiles[0].id=id;assert.throws(()=>validateConfig(x));}
 const duplicate=copy(c);duplicate.profiles[1].id=duplicate.profiles[0].id;assert.throws(()=>validateConfig(duplicate));
 const duplicateNumber=copy(c);duplicateNumber.profiles[0].numbers[1].id='phone';assert.throws(()=>validateConfig(duplicateNumber));
});
test('configuration rejects invalid sizes, empty names, excessive records and numeric coercion',()=>{
 for(const edit of [c=>c.profiles=[],c=>c.profiles[0].name='',c=>c.profiles[0].numbers[0].digits=2025550147,c=>c.profiles[0].numbers[0].digits='1',c=>c.profiles[0].numbers[0].chunks=[0,10],c=>c.profiles[0].numbers[0].chunks=[2.5,7.5],c=>c.profiles[0].numbers[0].chunks=[3,3,3],c=>c.profiles=Array.from({length:13},(_,i)=>({...copy(c.profiles[0]),id:'p'+i}))]){
  const c=copy(DEMO_CONFIG);edit(c);assert.throws(()=>validateConfig(c));
 }
});
test('missing, primitive and malformed progress normalize without crashes',()=>{
 for(const raw of [null,undefined,1,'text',[],{progress:null},{progress:{nova:{phone:{unlocked:900,mastered:true}}}}]){
  const s=normalizeStore(raw,DEMO_CONFIG);assert.equal(s.muted,true);assert.equal(s.progress.nova.phone.unlocked,0);assert.equal(s.progress.nova.phone.mastered,false);
 }
});
test('changing digits or chunking invalidates mastery, while renaming labels preserves it',()=>{
 const config=copy(DEMO_CONFIG),def=config.profiles[0].numbers[0];let store=normalizeStore(null,config);
 store.progress.nova.phone={...newProgress(),signature:numberSignature(def),unlocked:4};store.muted=false;
 assert.equal(normalizeStore(store,config).progress.nova.phone.unlocked,4);
 def.label='A new label';assert.equal(normalizeStore(store,config).progress.nova.phone.unlocked,4);
 def.digits='2025550102';assert.equal(normalizeStore(store,config).progress.nova.phone.unlocked,0);
 def.digits='2025550147';def.chunks=[2,4,4];assert.equal(normalizeStore(store,config).progress.nova.phone.unlocked,0);
});
test('backup validates its entire configuration before accepting progress',()=>{
 const c=validateConfig(DEMO_CONFIG),s=normalizeStore(null,c);
 const backup=validateBackup({format:'remember-your-numbers',version:1,config:c,store:s});assert.deepEqual(backup.config,c);
 assert.throws(()=>validateBackup({format:'another-tool',version:1,config:c,store:s}));
 const bad=copy(c);bad.profiles[0].numbers[0].chunks=[99];assert.throws(()=>validateBackup({format:'remember-your-numbers',version:1,config:bad,store:s}));
});
