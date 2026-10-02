import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const url = process.env.MIGRATION_DATABASE_URL;
if (!url || new URL(url).username !== 'migration_user') { console.error('MIGRATION_DATABASE_URL com migration_user é obrigatória.'); process.exit(2); }
// The healthcheck can pass on the init-time socket before TCP is listening; retry only the connection, never the migration.
let client;
for (let attempt = 1; ; attempt++) {
  client = new pg.Client({ connectionString: url });
  try { await client.connect(); break; }
  catch (error) { await client.end().catch(() => {}); if (error.code !== 'ECONNREFUSED' || attempt >= 30) { console.error(error.message); process.exit(1); } await new Promise(r => setTimeout(r, 1000)); }
}
try {
  await client.query('select pg_advisory_lock(10101)');
  await client.query('create schema if not exists migrations');
  await client.query('create table if not exists migrations.applied (name text primary key, checksum text not null, applied_at timestamptz not null default now())');
  const directory = new URL('../packages/database/migrations/', import.meta.url);
  for (const name of readdirSync(directory).filter(n => n.endsWith('.sql')).sort()) {
    const content = readFileSync(new URL(name, directory), 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');
    const existing = await client.query('select checksum from migrations.applied where name=$1', [name]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error(`Migration alterada após aplicação: ${name}`);
      continue;
    }
    await client.query('begin');
    try {
      await client.query(content);
      await client.query('insert into migrations.applied(name,checksum) values($1,$2)', [name, checksum]);
      await client.query('commit');
      console.log(`Migration aplicada: ${name}`);
    } catch (error) { await client.query('rollback'); throw error; }
  }
} catch (error) { console.error(error.message.replace(/postgresql:\/\/\S+/g, '[redacted]')); process.exitCode = 1; }
finally { await client.end(); }
