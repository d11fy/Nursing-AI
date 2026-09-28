-- Keep document timestamps consistent with the update paths used by uploads and dashboard queries.
alter table public.documents
  add column if not exists updated_at timestamptz not null default now();

create index if not exists documents_updated_at_idx on public.documents(updated_at);

drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();
