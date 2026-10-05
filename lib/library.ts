import "server-only";

import { withIdentity } from "@/lib/tutor/db";
import { RESOURCE_CATEGORIES, type ActiveLibrarySource, type LibraryCatalog, type LibraryResource, type ResourceCategory } from "@/lib/library-types";
import { logEvent } from "@/lib/log";

export const MAX_ACTIVE_LIBRARY_SOURCES = 5;

type ResourceRow = {
  id: string;
  title: string;
  library_description: string | null;
  resource_category: ResourceCategory;
  subject_id: string | null;
  subject_name: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  semester_id: number | null;
  language: string | null;
  source_label: string | null;
  page_count: number;
  sort_order: number;
};

type ResourceFileRow = ResourceRow & {
  storage_path: string;
  original_file_name: string;
  file_size: number | null;
  file_hash: string | null;
  created_at: string;
};

const resourceSelect = `select d.id,d.title,d.library_description,d.resource_category,d.subject_id,s.name_ar subject_name,
 d.academic_year_id,y.name_ar academic_year_name,d.semester_id,d.language,d.source_label,d.page_count,d.sort_order
 from knowledge_documents d
 left join subjects s on s.id=d.subject_id
 left join academic_years y on y.id=d.academic_year_id`;

function toResource(row: ResourceRow): LibraryResource {
  return {
    id: row.id,
    title: row.title,
    description: row.library_description,
    category: row.resource_category,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    academicYearId: row.academic_year_id,
    academicYearName: row.academic_year_name,
    semester: row.semester_id,
    language: row.language,
    sourceLabel: row.source_label,
    pageCount: row.page_count,
    sortOrder: row.sort_order,
  };
}

// This predicate is intentionally repeated at the application layer even though
// knowledge_documents also uses RLS. It protects direct document-id requests.
const accessibleDocumentScope = `d.owner_id is null and d.status='ready' and d.is_active
 and exists(select 1 from profiles p where p.user_id=$1 and p.status='active' and (
   d.visibility_scope='all_students'
   or (d.visibility_scope='academic_year' and (d.academic_year_id is null or d.academic_year_id=p.academic_year_id))
   or (d.visibility_scope='specific_subject' and exists(select 1 from subject_academic_years sy
     join academic_years ay on ay.id=sy.academic_year_id and ay.is_active
     join subjects axs on axs.id=sy.subject_id and axs.status='active' and axs.archived_at is null
     where sy.academic_year_id=p.academic_year_id and sy.subject_id=d.subject_id)
     and (d.academic_year_id is null or d.academic_year_id=p.academic_year_id))
 ))`;
const accessiblePublishedDocument = `${accessibleDocumentScope} and d.publication_status='published'`;

export async function listLibraryResources(userId: string, filters: {
  subjectId?: string | null;
  category?: ResourceCategory | null;
  semester?: number | null;
  query?: string;
  page?: number;
  pageSize?: number;
}): Promise<LibraryCatalog> {
  return withIdentity(userId, async (db) => {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.max(1, Math.min(30, filters.pageSize ?? 18));
    const values: unknown[] = [userId];
    const where = [accessiblePublishedDocument];
    const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
    if (filters.subjectId) where.push(`d.subject_id=${bind(filters.subjectId)}::uuid`);
    if (filters.category) where.push(`d.resource_category=${bind(filters.category)}`);
    if (filters.semester) where.push(`d.semester_id=${bind(filters.semester)}`);
    const query = filters.query?.trim().slice(0, 100);
    if (query) {
      const matchingCategory = RESOURCE_CATEGORIES.find((item) => item.label.includes(query) || query.includes(item.label))?.value;
      const term = bind(`%${query}%`);
      const categoryTerm = matchingCategory ? bind(matchingCategory) : null;
      where.push(`(d.title ilike ${term} or coalesce(d.library_description,'') ilike ${term} or coalesce(d.source_label,'') ilike ${term}
        or coalesce(s.name_ar,'') ilike ${term}${categoryTerm ? ` or d.resource_category=${categoryTerm}` : ""})`);
    }
    const filterSql = where.join(" and ");
    const offset = bind((page - 1) * pageSize);
    const limit = bind(pageSize);
    const resources = await db.query<ResourceRow>(`${resourceSelect} where ${filterSql}
      order by d.sort_order,d.title limit ${limit} offset ${offset}`, values);

    const countValues = values.slice(0, values.length - 2);
    const total = await db.query<{ count: number }>(`select count(*)::int count from knowledge_documents d
      left join subjects s on s.id=d.subject_id where ${filterSql}`, countValues);

    const categoryValues: unknown[] = [userId];
    const categoryWhere = [accessiblePublishedDocument];
    if (filters.subjectId) { categoryValues.push(filters.subjectId); categoryWhere.push(`d.subject_id=$${categoryValues.length}::uuid`); }
    if (filters.semester) { categoryValues.push(filters.semester); categoryWhere.push(`d.semester_id=$${categoryValues.length}`); }
    const categories = await db.query<{ resource_category: ResourceCategory; count: number }>(`select d.resource_category,count(*)::int count
      from knowledge_documents d where ${categoryWhere.join(" and ")} group by d.resource_category`, categoryValues);

    const subjects = await db.query<{ id: string; name_ar: string; semester: number | null; count: number }>(`select s.id,s.name_ar,s.semester,
      (select count(*)::int from knowledge_documents d where d.subject_id=s.id and ${accessiblePublishedDocument}) count
      from profiles p join subject_academic_years sy on sy.academic_year_id=p.academic_year_id
      join subjects s on s.id=sy.subject_id and s.status='active' and s.archived_at is null
      where p.user_id=$1 and p.status='active' order by s.semester nulls last,s.sort_order,s.name_ar`, [userId]);
    const year = await db.query<{ id: string; name_ar: string }>(`select y.id,y.name_ar from profiles p
      join academic_years y on y.id=p.academic_year_id and y.is_active where p.user_id=$1 and p.status='active'`, [userId]);
    const recent = await db.query<ResourceRow>(`${resourceSelect} join conversation_sources cs on cs.document_id=d.id
      where cs.user_id=$1 and ${accessiblePublishedDocument} group by d.id,s.name_ar,y.name_ar
      order by max(cs.updated_at) desc limit 5`, [userId]);

    const favorites = await db.query<{document_id:string}>("select document_id from library_favorites where user_id=$1",[userId]);
    const favoriteIds=new Set(favorites.rows.map(row=>row.document_id));
    return {
      resources: resources.rows.map(row=>({...toResource(row),favorite:favoriteIds.has(row.id)})),
      recent: recent.rows.map(row=>({...toResource(row),favorite:favoriteIds.has(row.id)})),
      subjects: subjects.rows.map((row) => ({ id: row.id, name: row.name_ar, semester: row.semester, count: row.count })),
      categoryCounts: Object.fromEntries(categories.rows.map((row) => [row.resource_category, row.count])),
      academicYear: year.rows[0] ? { id: year.rows[0].id, name: year.rows[0].name_ar } : null,
      total: total.rows[0]?.count ?? 0,
      page,
      pageSize,
    };
  });
}

export async function getConversationSources(userId: string, conversationId: string): Promise<ActiveLibrarySource[]> {
  return withIdentity(userId, async (db) => {
    const result = await db.query<ResourceRow>(`${resourceSelect} join conversation_sources cs on cs.document_id=d.id
      where cs.conversation_id=$1 and cs.user_id=$2 and cs.is_active and d.owner_id is null
      and d.status='ready' and d.is_active and d.publication_status<>'archived'
      order by cs.updated_at`, [conversationId, userId]);
    return result.rows.map(toResource);
  });
}

export async function attachLibrarySource(userId: string, input: {
  conversationId?: string | null;
  documentId: string;
  subjectId?: string | null;
}): Promise<{ conversationId: string; source: ActiveLibrarySource; activeCount: number }> {
  return withIdentity(userId, async (db) => {
    let conversationId = input.conversationId ?? null;
    let conversationSubject: string | null = null;
    if (conversationId) {
      const conversation = await db.query<{ subject_id: string | null }>(`select subject_id from conversations
        where id=$1 and user_id=$2 for update`, [conversationId, userId]);
      if (!conversation.rows[0]) throw new LibraryError("المحادثة غير موجودة", 404);
      conversationSubject = conversation.rows[0].subject_id;
    }
    const document = await db.query<ResourceRow>(`${resourceSelect} where d.id=$2 and ${accessiblePublishedDocument}`, [userId, input.documentId]);
    const source = document.rows[0];
    if (!source) throw new LibraryError("هذا المصدر غير متاح لحسابك", 403);

    if (!conversationId) {
      const chosenSubject = input.subjectId ?? source.subject_id;
      const created = await db.query<{ id: string }>(`insert into conversations(user_id,title,subject_id)
        values($1,$2,$3) returning id`, [userId, `دراسة: ${source.title}`.slice(0, 60), chosenSubject]);
      conversationId = created.rows[0].id;
      conversationSubject = chosenSubject;
    }
    const count = await db.query<{ count: number }>(`select count(*)::int count from conversation_sources
      where conversation_id=$1 and user_id=$2 and is_active and document_id<>$3`, [conversationId, userId, source.id]);
    if ((count.rows[0]?.count ?? 0) >= MAX_ACTIVE_LIBRARY_SOURCES) throw new LibraryError("يمكنك تفعيل 5 مصادر كحد أقصى في المحادثة", 409);
    await db.query(`insert into conversation_sources(conversation_id,user_id,document_id,is_active)
      values($1,$2,$3,true) on conflict(conversation_id,document_id) do update set is_active=true,updated_at=now()`,
      [conversationId, userId, source.id]);
    if (!conversationSubject && source.subject_id) await db.query(`update conversations set subject_id=$1,updated_at=now()
      where id=$2 and user_id=$3`, [source.subject_id, conversationId, userId]);
    logEvent("LIBRARY_RESOURCE_ATTACHED", { userId, conversationId, documentId: source.id });
    return { conversationId, source: toResource(source), activeCount: (count.rows[0]?.count ?? 0) + 1 };
  });
}

export async function removeLibrarySource(userId: string, conversationId: string, documentId: string) {
  return withIdentity(userId, async (db) => {
    const conversation = await db.query(`select 1 from conversations where id=$1 and user_id=$2`, [conversationId, userId]);
    if (!conversation.rows.length) throw new LibraryError("المحادثة غير موجودة", 404);
    await db.query(`update conversation_sources set is_active=false,updated_at=now()
      where conversation_id=$1 and user_id=$2 and document_id=$3`, [conversationId, userId, documentId]);
    logEvent("LIBRARY_RESOURCE_REMOVED", { userId, conversationId, documentId });
  });
}

export async function setLibraryFavorite(userId:string, documentId:string, favorite:boolean) {
  return withIdentity(userId,async db=>{
    if(favorite) {
      const allowed=await db.query(`select d.id from knowledge_documents d where d.id=$2 and ${accessiblePublishedDocument}`,[userId,documentId]);
      if(!allowed.rows.length)throw new LibraryError("هذا المصدر غير متاح لحسابك",403);
      await db.query("insert into library_favorites(user_id,document_id) values($1,$2) on conflict do nothing",[userId,documentId]);
    } else await db.query("delete from library_favorites where user_id=$1 and document_id=$2",[userId,documentId]);
  });
}

export async function getAccessibleLibraryDocument(userId:string,documentId:string) {
  return withIdentity(userId,async db=>{
    const result=await db.query<ResourceFileRow>(`select d.id,d.title,d.library_description,d.resource_category,d.subject_id,s.name_ar subject_name,
      d.academic_year_id,y.name_ar academic_year_name,d.semester_id,d.language,d.source_label,d.page_count,d.sort_order,
      d.storage_path,d.original_file_name,d.file_size,d.file_hash,d.created_at
      from knowledge_documents d
      left join subjects s on s.id=d.subject_id
      left join academic_years y on y.id=d.academic_year_id
      where d.id=$2 and ${accessibleDocumentScope} and (d.publication_status='published' or exists(
        select 1 from conversation_sources cs where cs.user_id=$1 and cs.document_id=d.id and cs.is_active))`,[userId,documentId]);
    const row=result.rows[0];
    if(!row)throw new LibraryError("هذا المصدر غير متاح لحسابك",403);
    return {...toResource(row),storagePath:row.storage_path,originalFileName:row.original_file_name,fileSize:row.file_size,
      fileHash:row.file_hash??`${row.id}:${row.page_count}`,createdAt:row.created_at};
  });
}

export class LibraryError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
