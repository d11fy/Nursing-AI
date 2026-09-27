import "server-only";
import { getPool, transaction } from "@/lib/db/pool";

export type AcademicYear = {
  id: string; name_ar: string; name_en: string; code: string;
  sort_order: number; is_active: boolean;
};

export type SubjectWithYears = {
  id: string; name_ar: string; name_en: string; description_ar: string | null;
  description_en: string | null; icon: string; icon_theme: string | null;
  status: "active" | "inactive"; sort_order: number; archived_at: string | null;
  academic_years: AcademicYear[]; lecture_count?: number; student_count?: number;
};

const subjectSelect = `
 select s.id,s.name_ar,s.name_en,s.description_ar,s.description_en,s.icon,s.icon_theme,
   s.status,s.sort_order,s.archived_at,
   coalesce(json_agg(json_build_object('id',y.id,'name_ar',y.name_ar,'name_en',y.name_en,
     'code',y.code,'sort_order',y.sort_order,'is_active',y.is_active) order by y.sort_order)
     filter(where y.id is not null),'[]') as academic_years
 from subjects s
 left join subject_academic_years sy on sy.subject_id=s.id
 left join academic_years y on y.id=sy.academic_year_id`;

export async function getAcademicYears(includeInactive = false): Promise<AcademicYear[]> {
  const { rows } = await getPool().query<AcademicYear>(
    `select id,name_ar,name_en,code,sort_order,is_active from academic_years
     ${includeInactive ? "" : "where is_active=true"} order by sort_order,name_ar`
  );
  return rows;
}

export async function getSubjectsByAcademicYear(academicYearId: string): Promise<SubjectWithYears[]> {
  const { rows } = await getPool().query<SubjectWithYears>(`${subjectSelect}
   where s.status='active' and s.archived_at is null
     and exists(select 1 from subject_academic_years access join academic_years ay on ay.id=access.academic_year_id and ay.is_active=true where access.subject_id=s.id and access.academic_year_id=$1)
   group by s.id order by s.sort_order,s.name_ar`, [academicYearId]);
  return rows;
}

export async function getStudentSubjects(userId: string) {
  const { rows } = await getPool().query<{ academic_year_id: string | null; year_name_ar: string | null }>(
    `select y.id academic_year_id,y.name_ar year_name_ar from profiles p
     left join academic_years y on y.id=p.academic_year_id and y.is_active=true
     where p.user_id=$1 and p.status='active'`, [userId]);
  const profile = rows[0];
  return {
    academicYearId: profile?.academic_year_id ?? null,
    academicYearName: profile?.year_name_ar ?? null,
    subjects: profile?.academic_year_id ? await getSubjectsByAcademicYear(profile.academic_year_id) : [],
  };
}

export async function getSubjectById(subjectId: string, includeArchived = false): Promise<SubjectWithYears | null> {
  const { rows } = await getPool().query<SubjectWithYears>(`${subjectSelect}
   where s.id=$1 ${includeArchived ? "" : "and s.archived_at is null"}
   group by s.id`, [subjectId]);
  return rows[0] ?? null;
}

export async function canStudentAccessSubject(userId: string, subjectId: string): Promise<boolean> {
  const { rows } = await getPool().query(
    `select 1 from profiles p join academic_years y on y.id=p.academic_year_id and y.is_active=true
     join subject_academic_years sy on sy.academic_year_id=y.id
     join subjects s on s.id=sy.subject_id and s.status='active' and s.archived_at is null
     where p.user_id=$1 and p.status='active' and s.id=$2 limit 1`, [userId, subjectId]);
  return rows.length === 1;
}

export async function getAdminSubjects(filters: { academicYearId?: string; status?: string; search?: string } = {}) {
  const values: unknown[] = [];
  const where = ["s.archived_at is null"];
  const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
  if (filters.academicYearId) where.push(`exists(select 1 from subject_academic_years f where f.subject_id=s.id and f.academic_year_id=${bind(filters.academicYearId)})`);
  if (filters.status === "active" || filters.status === "inactive") where.push(`s.status=${bind(filters.status)}`);
  if (filters.search?.trim()) where.push(`(s.name_ar ilike ${bind(`%${filters.search.trim()}%`)} or s.name_en ilike $${values.length})`);
  const { rows } = await getPool().query<SubjectWithYears>(`
    select s.id,s.name_ar,s.name_en,s.description_ar,s.description_en,s.icon,s.icon_theme,
      s.status,s.sort_order,s.archived_at,
      coalesce(json_agg(json_build_object('id',y.id,'name_ar',y.name_ar,'name_en',y.name_en,
        'code',y.code,'sort_order',y.sort_order,'is_active',y.is_active) order by y.sort_order)
        filter(where y.id is not null),'[]') as academic_years,
      (select count(*)::int from documents d where d.subject_id=s.id and d.source_type='lecture') lecture_count,
      (select count(distinct p.user_id)::int from profiles p join academic_years ay on ay.id=p.academic_year_id and ay.is_active=true
       join subject_academic_years a on a.academic_year_id=p.academic_year_id where a.subject_id=s.id and p.role='student' and p.status='active') student_count
    from subjects s left join subject_academic_years sy on sy.subject_id=s.id
    left join academic_years y on y.id=sy.academic_year_id
    where ${where.join(" and ")} group by s.id order by s.sort_order,s.name_ar`, values);
  return rows;
}

export type SubjectMutation = {
  nameAr: string; nameEn: string; descriptionAr?: string; descriptionEn?: string;
  icon: string; iconTheme?: string; status: "active" | "inactive";
  sortOrder: number; academicYearIds: string[];
};

async function replaceSubjectYears(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, subjectId: string, ids: string[]) {
  await client.query("delete from subject_academic_years where subject_id=$1", [subjectId]);
  if (ids.length) await client.query(
    `insert into subject_academic_years(subject_id,academic_year_id)
     select $1,id from academic_years where id=any($2::uuid[]) and is_active=true`, [subjectId, ids]);
}

export async function createSubject(input: SubjectMutation) {
  return transaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into subjects(name_ar,name_en,description,description_ar,description_en,icon,icon_theme,status,sort_order)
       values($1,$2,$3,$3,$4,$5,$6,$7,$8) returning id`,
      [input.nameAr,input.nameEn,input.descriptionAr||null,input.descriptionEn||null,input.icon,input.iconTheme||null,input.status,input.sortOrder]);
    await replaceSubjectYears(client, rows[0].id, input.academicYearIds);
    return rows[0].id;
  });
}

export async function updateSubject(subjectId: string, input: SubjectMutation) {
  await transaction(async (client) => {
    await client.query(
      `update subjects set name_ar=$2,name_en=$3,description=$4,description_ar=$4,description_en=$5,
       icon=$6,icon_theme=$7,status=$8,sort_order=$9 where id=$1 and archived_at is null`,
      [subjectId,input.nameAr,input.nameEn,input.descriptionAr||null,input.descriptionEn||null,input.icon,input.iconTheme||null,input.status,input.sortOrder]);
    await replaceSubjectYears(client, subjectId, input.academicYearIds);
  });
}

export async function assignSubjectToYears(subjectId: string, academicYearIds: string[]) {
  await transaction((client) => replaceSubjectYears(client, subjectId, academicYearIds));
}

export async function archiveSubject(subjectId: string) {
  await getPool().query("update subjects set status='inactive',archived_at=now() where id=$1 and archived_at is null", [subjectId]);
}

export async function updateAcademicYear(id: string, input: Pick<AcademicYear,"name_ar"|"name_en"|"sort_order"|"is_active">) {
  await getPool().query("update academic_years set name_ar=$2,name_en=$3,sort_order=$4,is_active=$5 where id=$1", [id,input.name_ar,input.name_en,input.sort_order,input.is_active]);
}

export async function createAcademicYear(input: Omit<AcademicYear,"id">) {
  await getPool().query(
    "insert into academic_years(name_ar,name_en,code,sort_order,is_active) values($1,$2,$3,$4,$5)",
    [input.name_ar,input.name_en,input.code,input.sort_order,input.is_active]);
}

export async function setStudentAcademicYear(userId: string, academicYearId: string) {
  await getPool().query(
    `update profiles set academic_year_id=y.id,nursing_year=case y.code
      when 'first_year' then 'year1'::nursing_year when 'second_year' then 'year2'::nursing_year
      when 'third_year' then 'year3'::nursing_year when 'fourth_year' then 'year4'::nursing_year else 'other'::nursing_year end
     from academic_years y where profiles.user_id=$1 and y.id=$2 and y.is_active=true`, [userId, academicYearId]);
}

export async function getAdminStudents() {
  const { rows } = await getPool().query<{
    user_id: string; full_name: string; email: string; university: string | null;
    academic_year_id: string | null; academic_year_name: string | null; status: "active" | "suspended";
    created_at: string; questions_count: number; last_activity: string | null;
  }>(`select p.user_id,p.full_name,p.email,p.university,p.academic_year_id,y.name_ar academic_year_name,
    p.status,p.created_at,count(u.id)::int questions_count,max(u.created_at) last_activity
    from profiles p left join academic_years y on y.id=p.academic_year_id
    left join usage_logs u on u.user_id=p.user_id where p.role='student'
    group by p.id,y.name_ar order by p.created_at desc`);
  return rows;
}
