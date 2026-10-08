import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const a = "00000000-0000-0000-0000-000000000001";
const b = "00000000-0000-0000-0000-000000000002";
async function rpc<T>(sql: string, args: unknown[] = []) { return (await db.query<{ result: T }>(`select ${sql} as result`, args)).rows[0].result; }
async function reserve(user = a, kind = "chat") { return rpc<{ id?: string; error?: string; reserved?: number }>("reserve_ai($1,$2,$3)", [user, crypto.randomUUID(), kind]); }
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    insert into auth.users values('${a}'),('${b}');`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir)).filter(f => f.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(file, dir), "utf8"));
});
after(() => db.close());

test("diaries isolate users; stale and empty writes cannot destroy data", async () => {
  const doc = { version: 1, days: [{ date: "2026-10-08", note: "A private note" }], cycles: [], memories: [], settings: { theme: "dark" } };
  assert.equal(await rpc("save_diary($1,0,$2)", [a, doc]), 1);
  const other = await rpc<{ days: unknown[] }>("read_diary($1)", [b]);
  assert.deepEqual(other.days, []);
  await assert.rejects(rpc("save_diary($1,0,$2)", [a, doc]), /diary_conflict/);
  await assert.rejects(rpc("save_diary($1,1,$2)", [a, { ...doc, days: [] }]), /empty_diary/);
  assert.equal((await rpc<{ days: unknown[] }>("read_diary($1)", [a])).days.length, 1);
});
test("RLS and function privileges prevent another account spending or reading", async () => {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${b}';`);
  assert.equal((await db.query("select * from diary_days")).rows.length, 0);
  await assert.rejects(rpc("read_diary($1)", [a]), /permission denied/);
  await assert.rejects(reserve(a), /permission denied/);
  await assert.rejects(db.exec("update ai_policy set enabled=true"), /permission denied/);
  await db.exec("reset role; set role anon;");
  await assert.rejects(db.query("select * from diary_days"), /permission denied/);
  await db.exec("reset role");
});
test("AI starts disabled, reservations include pending calls and fail closed", async () => {
  assert.equal((await reserve()).error, "paused");
  await db.exec(`insert into billing_accounts(user_id,plan,status,paid_until) values
    ('${a}','plus','active',now()+interval '1 month'),('${b}','plus','active',now()+interval '1 month');
    update ai_policy set enabled=true,monthly_micro_usd=6000`);
  const first = await reserve(); assert.ok(first.id);
  assert.equal((await reserve()).error, "busy");
  assert.equal((await reserve(b)).error, "global_budget");
  await rpc("settle_ai($1,1000)", [first.id]);
  assert.equal((await reserve(b)).error, "global_budget");
  // Settlement is idempotent: a replay cannot refund an existing charge.
  await rpc("settle_ai($1,0)", [first.id]);
  assert.equal((await db.query<{ charged_micro_usd: number }>("select charged_micro_usd from ai_reservations where id=$1", [first.id])).rows[0].charged_micro_usd, 1000);
  await db.exec("update ai_policy set monthly_micro_usd=100000000");
});
test("free accounts have zero replies from the first request and expired plans lose access", async () => {
  const free = "00000000-0000-0000-0000-000000000003";
  await db.exec(`insert into auth.users values('${free}')`);
  assert.equal((await reserve(free)).error, "plus_required");
  assert.equal((await reserve(free, "voice")).error, "voice_plan");
  assert.equal((await db.query("select * from ai_reservations where user_id=$1", [free])).rows.length, 0);
  // Un historial previo o un mes nuevo no conceden respuestas gratuitas.
  await db.exec(`update billing_accounts set paid_until=now()-interval '1 hour' where user_id='${a}';
    update ai_reservations set created_at=now()-interval '2 minutes',period='2026-01-01' where user_id='${a}'`);
  assert.equal((await reserve()).error, "plus_required");
  await db.exec(`update billing_accounts set paid_until=now()+interval '1 month' where user_id='${a}';
    update billing_accounts set plan='voice',paid_until=now()-interval '1 hour' where user_id='${b}'`);
  assert.equal((await reserve(b, "voice")).error, "voice_plan");
  assert.equal((await reserve(b)).error, "plus_required");
  await db.exec(`update billing_accounts set paid_until=now()+interval '1 month' where user_id='${b}'`);
  const r = await reserve(b, "voice"); assert.ok(r.id);
  await rpc("settle_ai($1,300000,120)", [r.id]);
});
test("an unknown or underestimated provider charge trips the global breaker", async () => {
  const r = await reserve(b); assert.ok(r.id);
  await rpc("settle_ai($1,6001)", [r.id]);
  assert.equal((await reserve(b)).error, "paused");
  await db.exec("update ai_policy set enabled=true");
});
test("parallel budget decisions never overspend the global allowance", async () => {
  await db.exec("delete from ai_reservations; update ai_policy set monthly_micro_usd=6000");
  const results = await Promise.all([reserve(a), reserve(b)]);
  assert.equal(results.filter(r => r.id).length, 1);
  assert.equal(results.filter(r => r.error === "global_budget").length, 1);
});
test("billing webhook duplicates and old events cannot rewrite a newer plan", async () => {
  await db.exec(`update billing_accounts set customer_id='cus_test' where user_id='${b}'`);
  await rpc("apply_billing('evt_new',200,'cus_test','sub_test','voice','active',now()+interval '1 month')");
  await rpc("apply_billing('evt_old',100,'cus_test','sub_test','free','inactive',null)");
  await rpc("apply_billing('evt_new',200,'cus_test','sub_test','free','inactive',null)");
  const { rows } = await db.query<{ plan: string }>("select plan from billing_accounts where customer_id='cus_test'");
  assert.equal(rows[0].plan, "voice");
});
test("partner invitations are single use and cannot be self-accepted", async () => {
  await db.exec(`insert into partner_invites values('self','${b}',now()+interval '1 hour')`);
  assert.equal(await rpc("accept_partner($1,'self')", [b]), false);
  await db.exec(`insert into partner_invites values('hash','${a}',now()+interval '1 hour')`);
  assert.equal(await rpc("accept_partner($1,'hash')", [b]), true);
  assert.equal(await rpc("accept_partner($1,'hash')", [b]), false);
});

test("refund holds survive later paid events and prevent another checkout", async () => {
  await rpc("apply_billing('evt_refund',300,'cus_test','sub_test','voice','revoked',null)");
  await rpc("apply_billing('evt_paid',400,'cus_test','sub_test','voice','active',now()+interval '1 month')");
  assert.equal(await rpc("claim_checkout($1)", [b]), false);
  assert.equal((await reserve(b, "voice")).error, "voice_plan");
});

test("erasure leaves a revision tombstone and cannot be undone by an old device", async () => {
  assert.equal(await rpc("erase_diary($1)", [a]), 2);
  assert.equal((await rpc<{ days: unknown[] }>("read_diary($1)", [a])).days.length, 0);
  await assert.rejects(rpc("save_diary($1,1,$2)", [a, { days: [{ date: "2026-01-01" }], cycles: [], memories: [] }]), /diary_conflict/);
  assert.equal((await db.query("select * from partner_links where owner_id=$1", [a])).rows.length, 0);
});

test("short calls consume one included call; pending expired usage stays charged", async () => {
  await db.exec(`delete from ai_reservations; update ai_policy set enabled=true,monthly_micro_usd=100000000;
    update billing_accounts set billing_hold=false,status='active',paid_until=now()+interval '1 month' where user_id='${b}'`);
  for (let i=0; i<10; i++) {
    const r = await reserve(b, "voice"); assert.ok(r.id);
    await rpc("settle_ai($1,300000,5)", [r.id]);
  }
  await db.exec("update ai_reservations set created_at=now()-interval '2 minutes'");
  assert.equal((await reserve(b, "voice")).error, "minutes");
  const r = await reserve(b); assert.ok(r.id);
  await db.exec("update ai_reservations set expires_at=now()-interval '1 hour',created_at=now()-interval '2 minutes' where id='"+r.id+"'");
  await db.exec("update ai_policy set monthly_micro_usd=3006000");
  assert.equal((await reserve(a)).error, "global_budget");
});

test("checkout admission is atomic and concurrent attempts cannot both claim", async () => {
  await db.exec(`update billing_accounts set status='inactive',plan='free',paid_until=null where user_id='${a}'`);
  const results = await Promise.all([rpc<boolean>("claim_checkout($1)", [a]), rpc<boolean>("claim_checkout($1)", [a])]);
  assert.equal(results.filter(Boolean).length, 1);
});
