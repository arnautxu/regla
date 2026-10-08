import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
// Explicit user-selected export only. Never discover/copy private diaries automatically.
const args = process.argv.slice(2);
const file = args[args.indexOf('--file') + 1];
const user = args[args.indexOf('--user') + 1];
if (!args.includes('--file') || !args.includes('--user') || !/^[\da-f-]{36}$/i.test(user)) throw new Error('Usage: node --env-file=.env.local scripts/import-legacy.mjs --file backup.json --user UUID [--apply]');
const doc = JSON.parse(await readFile(file, 'utf8'));
if (doc.format !== 'lilaila-backup' || doc.version !== 1 || !Array.isArray(doc.days) || !Array.isArray(doc.cycles) || Buffer.byteLength(JSON.stringify(doc)) > 4_000_000) throw new Error('Invalid or oversized export');
const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: identity, error: authError } = await client.auth.admin.getUserById(user);
if (authError || !identity.user?.email_confirmed_at) throw new Error('Target must be an existing verified account');
const { data: existing, error } = await client.rpc('read_diary', { p_user: user });
if (error || existing.revision !== 0 || existing.days.length || existing.memories.length) throw new Error('Target is not empty; import stopped');
console.log({ user, days: doc.days.length, memories: doc.memories?.length ?? 0, mode: args.includes('--apply') ? 'apply' : 'dry-run' });
if (args.includes('--apply')) {
 const { error: saved } = await client.rpc('save_diary', { p_user: user, p_revision: 0, p_doc: doc });
 if (saved) throw new Error(saved.message);
 const { data: check, error: readError } = await client.rpc('read_diary', { p_user: user });
 if (readError || check.revision !== 1 || check.days.length !== doc.days.length || check.memories.length !== (doc.memories?.length ?? 0)) throw new Error('Import readback failed');
 console.log('Imported and verified. Original export and legacy Blob are unchanged.');
}
