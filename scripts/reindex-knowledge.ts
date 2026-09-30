import {loadEnvConfig} from '@next/env';
loadEnvConfig(process.cwd());
async function main(){const {getPool}=await import('../lib/db/pool');const {workerDb}=await import('../lib/tutor/db');const {registerDocument,enqueueDocument,processKnowledgeDocument,INDEX_VERSION}=await import('../lib/tutor/ingestion');const run=process.argv.includes('--run'),includePrivate=process.argv.includes('--include-private');try{
 const docs=(await getPool().query<{id:string}>('select id from documents order by created_at')).rows;
 const lectures=includePrivate?(await workerDb.query<{id:string}>('select id from lectures where deleted_at is null order by created_at')).rows:[];
 console.log(JSON.stringify({mode:run?'queue':'plan',shared:docs.length,private:lectures.length,indexVersion:INDEX_VERSION,oldIndexPreserved:true}));
 if(!run)return;
 const {verifyBackupReceipt}=await import('./backup-receipt.mjs');await verifyBackupReceipt(process.env.DATABASE_URL);
 let failures=0;for(const [rows,privateLecture] of [[docs,false],[lectures,true]] as const)for(const record of rows){try{const id=await registerDocument(record.id,privateLecture),doc=(await workerDb.query('select status,index_version from knowledge_documents where id=$1',[id])).rows[0];if(process.argv.includes('--stale-only')&&doc.status==='ready'&&doc.index_version===INDEX_VERSION)continue;if(process.argv.includes('--process'))await processKnowledgeDocument(id);else await enqueueDocument(id);console.log(JSON.stringify({documentId:id,status:process.argv.includes('--process')?'processed':'queued'}));}catch{failures++;console.error(JSON.stringify({documentId:record.id,status:'failed'}));}}
 if(failures)process.exitCode=1;
 }finally{await getPool().end();}}
void main().catch(()=>{console.error('Reindex failed. Check database access, migrations and BACKUP_RECEIPT; no index was deleted.');process.exitCode=1;});
