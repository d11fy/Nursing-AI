import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { useNetwork } from '../context/NetworkContext';
import { apiFetch } from '../services/api';
import { deleteOfflinePack, listOfflinePacks, syncFlashcardReviews, type SavedPack } from '../services/offlineStudy';

export function OfflineLibrary(){
  const {profile,sessionUnverified}=useAuth(),{navigate}=useNavigation(),{isOnline}=useNetwork();
  const [packs,setPacks]=useState<SavedPack[]>([]),[message,setMessage]=useState('');
  const userId=profile?.user_id;
  const refresh=useCallback(()=>{if(userId)void listOfflinePacks(userId).then(setPacks).catch(e=>setMessage(e.message));},[userId]);
  const sync=useCallback(async()=>{if(!userId||!isOnline||sessionUnverified)return;
    try{const count=await syncFlashcardReviews(userId,r=>apiFetch(`/api/study-packs/${r.packId}/flashcards/progress`,{method:'POST',body:JSON.stringify(r)}));
      if(count)setMessage(`تمت مزامنة ${count} مراجعة`);
    }catch(e){setMessage(e instanceof Error?`المراجعات محفوظة وتنتظر المزامنة: ${e.message}`:'تعذرت المزامنة');}
  },[userId,isOnline,sessionUnverified]);
  useEffect(()=>{refresh();window.addEventListener('nursing:offline-changed',refresh);return()=>window.removeEventListener('nursing:offline-changed',refresh);},[refresh]);
  useEffect(()=>{void sync();},[sync]);
  if(!packs.length&&!message)return null;
  return <details className="surface my-3 space-y-2" open={!isOnline}><summary className="min-h-11 cursor-pointer font-bold">الدراسة المحفوظة ({packs.length})</summary>
    <p className="text-xs">التنزيلات خاصة بهذا الحساب وتُحذف عند تسجيل الخروج. آخر نسخة قد تختلف عن المصدر.</p>
    {packs.map(p=><div className="flex gap-2 items-center" key={p.id}><button className="flex-1 min-h-12 text-start text-primary" onClick={()=>navigate('study-pack',{id:p.id,title:p.title})}>{p.title}<span className="block text-xs text-slate-500">{new Date(p.savedAt).toLocaleDateString('ar')}</span></button><button aria-label={`حذف تنزيل ${p.title}`} className="min-h-12 px-3 text-red-600" onClick={()=>userId&&void deleteOfflinePack(userId,p.id).then(refresh)}>حذف</button></div>)}
    {message&&<p role="status" className="text-sm">{message}</p>}
    {isOnline&&<button className="min-h-11 text-primary" onClick={()=>void sync()}>مزامنة المراجعات</button>}
  </details>;
}
