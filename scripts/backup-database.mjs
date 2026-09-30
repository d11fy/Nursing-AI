import nextEnv from '@next/env';
import {databaseFingerprint} from './backup-receipt.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required; no database backup was made');
const directory = resolve(process.argv[2] || '../narsing-ai-backups/database');
await mkdir(directory, { recursive: true });
const path = resolve(directory, `nursing-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
const database = new URL(process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL);
const env = { ...process.env, PGPASSWORD: decodeURIComponent(database.password), PGHOST: database.hostname,
  PGPORT: database.port || '5432', PGUSER: decodeURIComponent(database.username), PGDATABASE: decodeURIComponent(database.pathname.slice(1)) };
if (database.searchParams.get('sslmode')) env.PGSSLMODE = database.searchParams.get('sslmode');
await new Promise((ok, fail) => {
  const child = spawn(process.env.PG_DUMP_PATH || 'pg_dump', ['--format=custom', '--file', path], { env, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] });
  child.on('error', fail); child.on('exit', code => code === 0 ? ok() : fail(new Error(`pg_dump failed (${code})`)));
});
if ((await stat(path)).size < 100) throw new Error('Backup is empty');
await writeFile(resolve(directory, 'latest-backup.json'), JSON.stringify({ path, createdAt: new Date().toISOString(), format: 'pg_dump-custom', includesOriginalFiles: true, databaseFingerprint:databaseFingerprint(process.env.DATABASE_URL) }, null, 2));
console.log(`Database backup saved: ${path}. Verify with pg_restore --list and a restore into a separate database before cutover.`);
