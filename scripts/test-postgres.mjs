import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
const run = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'lilaila-postgres-test-'));
const data = join(root, 'data');
const port = String(55000 + Math.floor(Math.random()*1000));
let started = false;
async function sql(query) {
 const { stdout } = await run('psql', ['-XAt', '-v', 'ON_ERROR_STOP=1', '-h', root, '-p', port, '-d', 'postgres', '-c', query]);
 return stdout.trim();
}
try {
 await run('initdb', ['-D', data, '-A', 'trust', '--no-locale']);
 await run('pg_ctl', ['-D', data, '-l', join(root,'postgres.log'), '-o', `-h '' -k ${root} -p ${port}`, '-w', 'start']);
 started = true;
 await sql(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public to anon,authenticated,service_role;`);
 const dir = new URL('../supabase/migrations/', import.meta.url);
 for (const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()) await sql(await readFile(new URL(name,dir),'utf8'));
 const users = Array.from({length:12},()=>crypto.randomUUID());
 await sql(`insert into auth.users values ${users.map(id=>`('${id}')`).join(',')}; update ai_policy set enabled=true,monthly_micro_usd=6000;`);
 // Twelve independent Postgres connections compete for the last reservation.
 const answers = await Promise.all(users.map(user=>sql(`select reserve_ai('${user}','${crypto.randomUUID()}','chat')`)));
 const results = answers.map(JSON.parse);
 assert.equal(results.filter(r=>r.id).length,1);
 assert.equal(results.filter(r=>r.error==='global_budget').length,11);
 assert.equal(await sql('select sum(reserved_micro_usd) from ai_reservations'),'6000');
 console.log('PASS: 12 independent PostgreSQL connections, one reservation, no budget overspend.');
 const checkouts = await Promise.all(Array.from({length:8},()=>sql(`select claim_checkout('${users[0]}')`)));
 assert.equal(checkouts.filter(x=>x==='t').length,1);
 console.log('PASS: 8 simultaneous checkout requests, exactly one admitted.');
} finally {
 if(started) await run('pg_ctl',['-D',data,'-m','fast','-w','stop']);
 await rm(root,{recursive:true,force:true});
}
