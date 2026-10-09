import {loadEnvConfig} from '@next/env';
loadEnvConfig(process.cwd());
// Rebuilds chapter/section structure for books that were indexed before structure detection.
//   npm run knowledge:restructure                                   -> plan (counts only)
//   npm run knowledge:restructure -- --run                          -> rebuild every stale shared book
//   npm run knowledge:restructure -- --run --include-private        -> also students' private files
//   npm run knowledge:restructure -- --run --document <id> --force  -> one book, even if already current
// Unchanged chunk texts keep their stored embeddings; the document stays ready and is never duplicated.
async function main(){const {getPool}=await import('../lib/db/pool');const {workerDb}=await import('../lib/tutor/db');const {rebuildDocumentStructure}=await import('../lib/tutor/restructure');const {STRUCTURE_VERSION}=await import('../lib/tutor/structure');
 const run=process.argv.includes('--run'),force=process.argv.includes('--force'),includePrivate=process.argv.includes('--include-private');
 const only=process.argv.includes('--document')?process.argv[process.argv.indexOf('--document')+1]:null;
 try{
  const docs=(await workerDb.query<{id:string;title:string;owner_id:string|null;structure_version:number}>(`select id,title,owner_id,structure_version from knowledge_documents
    where status='ready' and ($1::uuid is null or id=$1) and ($2 or owner_id is null) and ($3 or structure_version<$4) order by created_at`,[only,includePrivate||Boolean(only),force,STRUCTURE_VERSION])).rows;
  console.log(JSON.stringify({mode:run?'rebuild':'plan',documents:docs.length,structureVersion:STRUCTURE_VERSION,force}));
  if(!run)return;
  const {verifyBackupReceipt}=await import('./backup-receipt.mjs');await verifyBackupReceipt(process.env.DATABASE_URL);
  let failures=0;
  for(const doc of docs){try{const result=await rebuildDocumentStructure(doc.id,{force});console.log(JSON.stringify({documentId:doc.id,...result}));}catch(error){failures++;console.error(JSON.stringify({documentId:doc.id,status:'failed',error:error instanceof Error?error.message.slice(0,200):'unknown'}));}}
  if(failures)process.exitCode=1;
 }finally{await getPool().end();}}
void main().catch(()=>{console.error('Restructure failed. Check database access, migrations and BACKUP_RECEIPT; no document was removed.');process.exitCode=1;});
