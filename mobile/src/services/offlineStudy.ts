import { getSecureItem, setSecureItem, removeSecureItem } from './secureStorage';
import type { FlashcardItem, StudyPackWorkspaceData } from '../../../features/study-pack/types';

export interface SavedPack { id:string; title:string; savedAt:string; workspace:StudyPackWorkspaceData; cards:FlashcardItem[] }
interface Review { eventId:string; packId:string; flashcardId:string; status:'known'|'review_again' }
interface Vault { packs:SavedPack[]; reviews:Review[] }
const key=(userId:string)=>`nursing_offline_v1_${userId}`;
let lock:Promise<unknown>=Promise.resolve();
function exclusive<T>(run:()=>Promise<T>):Promise<T> {const next=lock.then(run,run);lock=next.catch(()=>undefined);return next;}
async function read(userId:string):Promise<Vault> {
  const raw=await getSecureItem(key(userId));
  if(!raw)return {packs:[],reviews:[]};
  try {const data=JSON.parse(raw);if(!Array.isArray(data.packs)||!Array.isArray(data.reviews))throw new Error();return data;}
  catch {throw new Error('تعذرت قراءة التنزيلات؛ احذف النسخة المحلية وأعد تنزيلها');}
}
async function write(userId:string,data:Vault){await setSecureItem(key(userId),JSON.stringify(data));window.dispatchEvent(new Event('nursing:offline-changed'));}
export const listOfflinePacks=(userId:string)=>exclusive(async()=> (await read(userId)).packs);
export const getOfflinePack=(userId:string,id:string)=>exclusive(async()=> (await read(userId)).packs.find(p=>p.id===id||p.workspace.lecture.id===id)||null);
export const clearOfflineStudy=(userId:string)=>exclusive(async()=>{await removeSecureItem(key(userId));window.dispatchEvent(new Event('nursing:offline-changed'));});
export const deleteOfflinePack=(userId:string,id:string)=>exclusive(async()=>{const data=await read(userId);data.packs=data.packs.filter(p=>p.id!==id);await write(userId,data);});
export const saveOfflinePack=(userId:string,workspace:StudyPackWorkspaceData,cards:FlashcardItem[])=>exclusive(async()=>{
  if(workspace.studyPack.user_id!==userId)throw new Error('هذه الحزمة ليست لهذا الحساب');
  // Only study material is saved. Exam questions and answer keys never enter the vault.
  const pack:SavedPack={id:workspace.studyPack.id,title:workspace.studyPack.title,savedAt:new Date().toISOString(),workspace,cards};
  if(new TextEncoder().encode(JSON.stringify(pack)).length>2_000_000)throw new Error('الحزمة كبيرة للتنزيل؛ الحد 2 ميجابايت للحزمة');
  const data=await read(userId);data.packs=data.packs.filter(p=>p.id!==pack.id);
  if(data.packs.length>=10)throw new Error('يمكن حفظ 10 حزم؛ احذف تنزيلًا قديمًا أولًا');
  data.packs.push(pack);await write(userId,data);
});
export const queueFlashcardReview=(userId:string,review:Review)=>exclusive(async()=>{
  const data=await read(userId);
  if(!data.reviews.some(r=>r.eventId===review.eventId)) {
    if(data.reviews.length>=500)throw new Error('طابور المراجعات ممتلئ؛ اتصل بالإنترنت للمزامنة');
    data.reviews.push(review);
    const card=data.packs.find(p=>p.id===review.packId)?.cards.find(c=>c.id===review.flashcardId);
    if(card){card.progress_status=review.status;card.review_count=(card.review_count??0)+1;
      card.interval_days=review.status==='known'?Math.min(60,Math.max(1,(card.interval_days??0)*2)):0;
      card.next_review_at=new Date(Date.now()+(card.interval_days?card.interval_days*86400000:600000)).toISOString();}
    await write(userId,data);
  }
});
export const syncFlashcardReviews=(userId:string,send:(review:Review)=>Promise<{status:string;review_count:number;next_review_at:string;interval_days:number}>)=>exclusive(async()=>{
  const data=await read(userId);let sent=0;
  while(data.reviews.length){const review=data.reviews[0];
    const result=await send(review); // On any rejection retain the queue; do not silently drop progress.
    const card=data.packs.find(p=>p.id===review.packId)?.cards.find(c=>c.id===review.flashcardId);
    if(card)Object.assign(card,result,{progress_status:result.status});
    data.reviews.shift();sent++;await write(userId,data);
  }
  return sent;
});
