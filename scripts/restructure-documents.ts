import {loadEnvConfig} from '@next/env';
import {appendFileSync,existsSync,mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
loadEnvConfig(process.cwd());
// Rebuilds chapter/section structure for books indexed before structure detection (migration 0031).
//
//   npm run knowledge:restructure                                  plan: counts only, nothing is written
//   npm run knowledge:restructure -- --run --confirm-target <db host>
//                                                                  rebuild every stale shared book
//   options:  --include-private          also students' private files
//             --document <id>            one document (knowledge document id)
//             --force                    rebuild even if the stored structure is current
//             --batch-size <n>           documents per page of the scan (default 25)
//             --limit <n>                stop after n documents (run in slices)
//             --max-failures <n>         stop after n failures (default: never; one book never stops the rest)
//             --journal <file>           JSONL log of every document (default logs/restructure/restructure-<time>.jsonl)
//             --resume <journal>         skip the documents that journal shows as done, and append to it
//
// Safe to repeat and to interrupt (Ctrl+C finishes the current book, then stops): finished books are `unchanged`
// on the next run, a failed book stays stale and is retried, chunks are replaced atomically (never duplicated) and
// vectors whose text did not change are reused, so a repeat run embeds nothing.
// A real run needs a backup made in the last BACKUP_MAX_AGE_HOURS (default 24) and --confirm-target naming the database host.
const arg=(name:string)=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
const flag=(name:string)=>process.argv.includes(name);
const integer=(name:string)=>{const raw=arg(name);if(raw===undefined)return undefined;const n=Number(raw);if(!Number.isInteger(n)||n<1)throw new Error(`${name} must be a positive integer`);return n;};
async function main(){
 const run=flag('--run'),force=flag('--force'),includePrivate=flag('--include-private');
 const databaseUrl=process.env.DATABASE_URL;
 if(!databaseUrl)throw new Error('DATABASE_URL is not set');
 const target=new URL(databaseUrl);
 const targetLabel=`${target.hostname}${target.port?`:${target.port}`:''}${target.pathname}`;
 // Guards first: a real run is refused before any database connection is opened.
 if(run){
  if(arg('--confirm-target')!==target.hostname)throw new Error(`Refusing to run: pass --confirm-target ${target.hostname} to confirm this is the database you mean (${targetLabel}).`);
  const {verifyBackupReceipt}=await import('./backup-receipt.mjs');
  await verifyBackupReceipt(databaseUrl,{maxAgeHours:Number(process.env.BACKUP_MAX_AGE_HOURS||24)});
 }
 const {getPool}=await import('../lib/db/pool');
 const {countRestructureCandidates,runRestructure}=await import('../lib/tutor/restructure-batch');
 const {STRUCTURE_VERSION}=await import('../lib/tutor/structure');
 const documentId=arg('--document')??null;
 try{
  const candidates=await countRestructureCandidates({documentId,includePrivate,force});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const journal=resolve(arg('--resume')??arg('--journal')??`logs/restructure/restructure-${stamp}.jsonl`);
  console.log(JSON.stringify({mode:run?'run':'plan',target:targetLabel,candidates,structureVersion:STRUCTURE_VERSION,force,includePrivate,journal:run?journal:undefined}));
  if(!run){console.log('Plan only. Nothing was written. Add --run --confirm-target <host> to rebuild.');return;}
  const {parseJournal}=await import('../lib/tutor/restructure-batch');
  const resumeFile=arg('--resume');
  if(resumeFile&&!existsSync(resumeFile))throw new Error(`Journal not found: ${resumeFile}`);
  const skip=resumeFile?parseJournal(readFileSync(resumeFile,'utf8')):new Set<string>();
  mkdirSync(dirname(journal),{recursive:true});
  const write=(row:Record<string,unknown>)=>appendFileSync(journal,`${JSON.stringify({at:new Date().toISOString(),...row})}\n`);
  write({event:'run-start',target:targetLabel,candidates,force,includePrivate,resumedFrom:resumeFile?skip.size:0});
  let stop=false;
  for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{stop=true;console.error(`\n${signal}: finishing the current document, then stopping. Resume with --resume ${journal}`);});
  const summary=await runRestructure({documentId,includePrivate,force,batchSize:integer('--batch-size'),limit:integer('--limit')??null,maxFailures:integer('--max-failures')??null,skip,
   shouldStop:()=>stop,onResult:result=>{write(result as unknown as Record<string,unknown>);console.log(JSON.stringify(result));}});
  write({event:'run-end',...summary});
  console.log(JSON.stringify({summary,journal}));
  if(summary.stopped!=='completed')console.log(`Stopped early (${summary.stopped}). Run again with --resume ${journal} to continue.`);
  if(summary.failed)process.exitCode=1;
 }finally{await getPool().end();}}
void main().catch(error=>{console.error(`Restructure did not run: ${error instanceof Error?error.message:'unknown error'}`);process.exitCode=2;});
