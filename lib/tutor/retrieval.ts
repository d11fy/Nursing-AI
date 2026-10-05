import 'server-only';
import { withIdentity } from './db';
import { getAIProvider } from '@/lib/ai';
import type { KnowledgeChunk } from '@/lib/ai/provider';
import { logUsage } from '@/lib/usage';

export type TutorSource = KnowledgeChunk & { subjectId:string|null; sourcePriority:number; scores:{semantic:number;lexical:number;exact:number;rank:number}; ownerId:string|null; lectureId:string|null };
type Row = { id:string;document_id:string;subject_id:string|null;owner_id:string|null;lecture_id:string|null;title:string;name_en:string;
  source_type:string;source_priority:number;content:string;chapter:string|null;heading:string|null;page_number:number|null;chunk_index:number;
  semantic_score:number;lexical_score:number;exact_score:number;score:number };
const synonyms:Record<string,string> = { 'فشل القلب':'heart failure','قصور القلب':'heart failure','ضيق التنفس':'dyspnea shortness of breath',
  'ضغط الدم':'blood pressure','المجهر':'microscope','مجهر':'microscope','البوتاسيوم':'potassium','الصوديوم':'sodium',
  'الدورة الدموية':'circulation','التهاب':'inflammation','سكري':'diabetes','الكلية':'kidney','العدسة':'lens','التنفس':'respiration' };
export function understandQuery(question:string) {
  const normalized=question.normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/[ًٌٍَُِّْـ]/g,'');
  const english_terms=Object.entries(synonyms).filter(([term])=>normalized.includes(term)).flatMap(([,terms])=>terms.split(' '));
  const tokens=[...new Set(`${normalized} ${english_terms.join(' ')}`.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[])];
  const stop=new Set(['the','what','is','and','of','a','explain','this','it','me','عن','ما','هو','هي','اشرح','اشرحلي','شو','من','في']);
  return { main_query:question.slice(0,1500), english_terms, arabic_terms:tokens.filter(t=>/[\u0600-\u06ff]/.test(t)),
    lexical:tokens.filter(t=>t.length>1&&!stop.has(t)).slice(0,30).join(' | '), exact:tokens.filter(t=>t.length>2&&!stop.has(t)).slice(0,16) };
}
// Every branch carries the same scope predicate, even with a superuser connection that bypasses RLS.
export const RETRIEVAL_SQL = `
with eligible as materialized (
 select d.id from knowledge_documents d where d.status='ready' and d.is_active
 and ((d.owner_id=$1::uuid and ($4::uuid is null or d.id=$4)) or
 (d.owner_id is null and (d.publication_status='published' or d.id=any($8::uuid[])) and exists(select 1 from profiles p
 join academic_years y on y.id=p.academic_year_id and y.is_active
 where p.user_id=$1 and p.status='active' and (
   d.visibility_scope='all_students'
   or (d.visibility_scope='academic_year' and (d.academic_year_id is null or d.academic_year_id=p.academic_year_id))
   or (d.visibility_scope='specific_subject' and (d.academic_year_id is null or d.academic_year_id=p.academic_year_id)
     and exists(select 1 from subject_academic_years sy join subjects s on s.id=sy.subject_id and s.status='active' and s.archived_at is null
       where sy.academic_year_id=p.academic_year_id and sy.subject_id=d.subject_id))
 ))))
), active_semantic as (
 select k.id,row_number() over(order by k.embedding <=> $2::vector) n,1-(k.embedding <=> $2::vector) val
 from knowledge_chunks k join eligible e on e.id=k.document_id
 where cardinality($8::uuid[])>0 and k.document_id=any($8::uuid[]) and k.embedding_model='text-embedding-3-small'
 order by k.embedding <=> $2::vector limit 25
), semantic as (
 select k.id,row_number() over(order by k.embedding <=> $2::vector) n,1-(k.embedding <=> $2::vector) val
 from knowledge_chunks k join eligible e on e.id=k.document_id
 where k.embedding_model='text-embedding-3-small' order by k.embedding <=> $2::vector limit 25
), lexical as (
 select k.id,row_number() over(order by ts_rank_cd(k.search_vector,to_tsquery('simple',$3)) desc) n,
 ts_rank_cd(k.search_vector,to_tsquery('simple',$3)) val
 from knowledge_chunks k join eligible e on e.id=k.document_id
 where $3<>'' and k.search_vector @@ to_tsquery('simple',$3)
 order by val desc limit 25
), exact as (
 select k.id,count(*)::float8 val from knowledge_chunks k join eligible e on e.id=k.document_id
 join unnest($6::text[]) term on lower(k.content) like '%' || term || '%'
 group by k.id order by val desc limit 25
), requested_page as (
 select k.id from knowledge_chunks k join eligible e on e.id=k.document_id
 where k.document_id=$4 and k.page_number=$7 limit 10
), ids as (select id from active_semantic union select id from semantic union select id from lexical union select id from exact union select id from requested_page)
select k.id,k.document_id,k.subject_id,d.owner_id,d.lecture_id,d.title,s.name_en,k.source_type,d.source_priority,
 k.content,k.chapter,k.heading,k.page_number,k.chunk_index,
 coalesce(v.val,0) semantic_score,coalesce(l.val,0) lexical_score,coalesce(x.val,0) exact_score,
 (coalesce(1.0/(60+av.n),0)+coalesce(1.0/(60+v.n),0)+coalesce(1.0/(60+l.n),0)+least(coalesce(x.val,0),8)*0.001
 +case when k.subject_id=$5 then 0.005 else 0 end
 +case when k.document_id=$4 then 0.015 else 0 end
 +case when k.document_id=any($8::uuid[]) then 0.04 else 0 end
 +case when k.document_id=$4 and k.page_number=$7 then 0.04 else 0 end
 +d.source_priority*0.00003) score
from ids join knowledge_chunks k on k.id=ids.id join knowledge_documents d on d.id=k.document_id
left join subjects s on s.id=k.subject_id left join active_semantic av on av.id=k.id left join semantic v on v.id=k.id
left join lexical l on l.id=k.id left join exact x on x.id=k.id order by score desc limit 25`;

export async function retrieveKnowledge(question:string,scope:{userId:string;subjectId:string|null;documentId?:string|null;activeDocumentIds?:string[];pageNumber?:number|null},limit=8):Promise<{sources:TutorSource[];candidates:TutorSource[];query:ReturnType<typeof understandQuery>}> {
  const query=understandQuery(question),ai=getAIProvider();
  const eligible=await withIdentity(scope.userId,db=>db.query(`select 1 from knowledge_documents d where status='ready' and is_active
    and (owner_id=$1 or (owner_id is null and exists(select 1 from profiles p join academic_years y on y.id=p.academic_year_id and y.is_active
      where p.user_id=$1 and p.status='active' and (d.visibility_scope='all_students'
        or (d.visibility_scope='academic_year' and (d.academic_year_id is null or d.academic_year_id=p.academic_year_id))
        or (d.visibility_scope='specific_subject' and (d.academic_year_id is null or d.academic_year_id=p.academic_year_id)
          and exists(select 1 from subject_academic_years sy join subjects s on s.id=sy.subject_id and s.status='active' and s.archived_at is null
            where sy.academic_year_id=p.academic_year_id and sy.subject_id=d.subject_id)))))) limit 1`,[scope.userId]));
  if(!eligible.rows.length) return {sources:[],candidates:[],query};
  const embedded=await ai.createEmbedding(query.main_query);
  await logUsage({userId:scope.userId,type:'embedding',feature:'retrieval_embedding',provider:'openai',model:embedded.model,
    inputTokens:embedded.tokens,outputTokens:0,estimatedCost:ai.calculateCost({model:embedded.model,inputTokens:embedded.tokens,outputTokens:0})});
  const rows=await withIdentity(scope.userId,db=>db.query<Row>(RETRIEVAL_SQL,[scope.userId,`[${embedded.embedding.join(',')}]`,query.lexical,
    scope.documentId??null,scope.subjectId,query.exact,scope.pageNumber??null,scope.activeDocumentIds??[]]));
  const candidates:TutorSource[]=rows.rows.map(row=>({id:row.id,documentId:row.document_id,subjectId:row.subject_id,title:row.title,
    subjectName:row.name_en,sourceType:row.source_type,content:row.content,chapter:row.chapter,pageNumber:row.page_number,
    chunkIndex:row.chunk_index,similarity:row.semantic_score,sourcePriority:row.source_priority,
    ownerId:row.owner_id,lectureId:row.lecture_id,evidenceType:row.owner_id?'PRIVATE_LECTURE':'UNIVERSITY_SOURCE',
    scores:{semantic:row.semantic_score,lexical:row.lexical_score,exact:row.exact_score,rank:row.score}}));
  // Diversify redundant chunks while preserving neighbouring sections for the active page.
  const sources:TutorSource[]=[], seen=new Set<string>();
  for(const candidate of candidates) {
    const key=candidate.content.trim();
    if(seen.has(key)) continue;
    seen.add(key); sources.push(candidate); if(sources.length>=Math.max(5,Math.min(10,limit))) break;
  }
  return {sources,candidates,query};
}
