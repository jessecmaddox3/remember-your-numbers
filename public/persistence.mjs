/** Serialize a read/compare/write across tabs. No uncoordinated fallback. */
export async function guardedWrite({storage,locks,key,expected,value,onSaved=()=>{},isCurrent=()=>true}) {
 if(!locks?.request)return {status:'unavailable'};
 try {
  return await locks.request('remember-your-numbers:'+key,()=>{
   if(!isCurrent())return {status:'cancelled'};
   if(storage.getItem(key)!==expected())return {status:'conflict'};
   if(value===null)storage.removeItem(key);else storage.setItem(key,value);
   onSaved(value);return {status:'saved'};
  });
 }catch{return {status:'unavailable'};}
}
