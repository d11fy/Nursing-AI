-- Academic years and subject access. Existing rows are preserved and mapped.
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  code text not null unique,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.academic_years(name_ar,name_en,code,sort_order) values
 ('السنة الأولى','First Year','first_year',1),
 ('السنة الثانية','Second Year','second_year',2),
 ('السنة الثالثة','Third Year','third_year',3),
 ('السنة الرابعة','Fourth Year','fourth_year',4)
on conflict(code) do nothing;

alter table public.subjects
  add column description_ar text,
  add column description_en text,
  add column icon text not null default 'book-open',
  add column icon_theme text,
  add column sort_order integer not null default 0 check (sort_order >= 0),
  add column updated_at timestamptz not null default now(),
  add column archived_at timestamptz;
update public.subjects set description_ar=description where description_ar is null;

create table public.subject_academic_years (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(subject_id,academic_year_id)
);

alter table public.profiles add column academic_year_id uuid references public.academic_years(id) on delete restrict;
update public.profiles p set academic_year_id=y.id
from public.academic_years y
where y.code=case p.nursing_year::text
  when 'year1' then 'first_year' when 'year2' then 'second_year'
  when 'year3' then 'third_year' when 'year4' then 'fourth_year' else null end;

-- Initial distribution; administrators can change every assignment later.
insert into public.subject_academic_years(subject_id,academic_year_id)
select s.id,y.id from public.subjects s join public.academic_years y on y.code=
 case s.name_en
  when 'Fundamentals of Nursing' then 'first_year'
  when 'Anatomy & Physiology' then 'first_year'
  when 'Medical-Surgical Nursing' then 'second_year'
  when 'Pharmacology' then 'second_year'
  when 'Pediatric Nursing' then 'third_year'
  when 'Maternity Nursing' then 'third_year'
  when 'Mental Health Nursing' then 'fourth_year'
  when 'Community Health Nursing' then 'fourth_year'
 end
where s.name_en in ('Fundamentals of Nursing','Anatomy & Physiology','Medical-Surgical Nursing','Pharmacology','Pediatric Nursing','Maternity Nursing','Mental Health Nursing','Community Health Nursing')
on conflict(subject_id,academic_year_id) do nothing;

create index profiles_academic_year_id_idx on public.profiles(academic_year_id);
create index subjects_status_sort_order_idx on public.subjects(status,sort_order) where archived_at is null;
create index subject_academic_years_subject_id_idx on public.subject_academic_years(subject_id);
create index subject_academic_years_academic_year_id_idx on public.subject_academic_years(academic_year_id);

create trigger academic_years_updated_at before update on public.academic_years
for each row execute function public.set_updated_at();
create trigger subjects_updated_at before update on public.subjects
for each row execute function public.set_updated_at();

