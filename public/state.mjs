import {levelsFor,newProgress,REVIEW_BASE_MS,REVIEW_CAP_MS} from './logic.mjs';
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const forbidden=new Set(['__proto__','constructor','prototype']);
function id(value,label){if(typeof value!=='string'||!/^[-a-zA-Z0-9_]{1,40}$/.test(value)||forbidden.has(value))throw new Error(`${label} needs a unique, simple ID.`);return value;}
function text(value,label,max){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error(`${label} must contain 1 to ${max} characters.`);return value.trim();}
export function validateConfig(input){
 if(!record(input)||input.version!==1||!Array.isArray(input.profiles)||input.profiles.length<1||input.profiles.length>12)throw new Error('Add between 1 and 12 learners.');
 const seen=new Set();
 return {version:1,profiles:input.profiles.map(profile=>{
  if(!record(profile))throw new Error('Each learner needs a name and numbers.');
  const pid=id(profile.id,'Learner');if(seen.has(pid))throw new Error('Learner IDs must be unique.');seen.add(pid);
  if(!Array.isArray(profile.numbers)||profile.numbers.length<1||profile.numbers.length>12)throw new Error('Each learner needs 1 to 12 numbers.');
  const numbers=new Set();
  return {id:pid,name:text(profile.name,'Learner name',40),emoji:text(profile.emoji||'⭐','Learner symbol',16),numbers:profile.numbers.map(number=>{
   if(!record(number))throw new Error('Each number needs a label, digits and chunk sizes.');
   const nid=id(number.id,'Number');if(numbers.has(nid))throw new Error('Number IDs must be unique within a learner.');numbers.add(nid);
   if(typeof number.digits!=='string'||!/^\d{2,24}$/.test(number.digits))throw new Error('Use 2 to 24 digits. Leading zeros are kept.');
   if(!Array.isArray(number.chunks)||number.chunks.length<1||number.chunks.length>8||number.chunks.some(n=>!Number.isInteger(n)||n<1||n>8)||number.chunks.reduce((a,b)=>a+b,0)!==number.digits.length)throw new Error('Use 1 to 8 chunks of 1 to 8 digits each. Their sizes must add up to the number length.');
   return {id:nid,label:text(number.label,'Number label',64),digits:number.digits,chunks:[...number.chunks]};
  })};
 })};
}
export const numberSignature=number=>`${number.digits}:${number.chunks.join(',')}`;
const timestamp=value=>Number.isSafeInteger(value)&&value>=0;
function progressFor(raw,number){
 const signature=numberSignature(number),fresh={...newProgress(),signature};
 if(!record(raw)||raw.signature!==signature)return fresh;
 const last=levelsFor(number.chunks).length-1;
 if(!Number.isInteger(raw.unlocked)||raw.unlocked<0||raw.unlocked>last)return fresh;
 const p={...fresh,unlocked:raw.unlocked};
 if(timestamp(raw.coldPassAt))p.coldPassAt=raw.coldPassAt;
 // Proof cannot be unlocked before a cold pass was actually recorded.
 if(p.unlocked===last&&p.coldPassAt===null)return fresh;
 if(raw.mastered===true&&p.unlocked===last&&p.coldPassAt!==null&&timestamp(raw.nextReviewAt)&&Number.isSafeInteger(raw.reviewIntervalMs)&&raw.reviewIntervalMs>=REVIEW_BASE_MS&&raw.reviewIntervalMs<=REVIEW_CAP_MS){
  p.mastered=true;p.reviewIntervalMs=raw.reviewIntervalMs;p.nextReviewAt=raw.nextReviewAt;
 }
 return p;
}
export function normalizeStore(raw,config){
 const input=record(raw)?raw:{};
 const progress={};
 for(const profile of config.profiles){
  progress[profile.id]={};
  for(const number of profile.numbers)progress[profile.id][number.id]=progressFor(input.progress?.[profile.id]?.[number.id],number);
 }
 return {muted:input.muted!==false,progress};
}
export function validateBackup(input){
 if(!record(input)||input.format!=='remember-your-numbers'||input.version!==1)throw new Error('Choose a Remember Your Numbers backup (version 1).');
 const config=validateConfig(input.config);
 return {format:'remember-your-numbers',version:1,config,store:normalizeStore(input.store,config)};
}
