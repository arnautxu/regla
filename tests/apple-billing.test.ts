import test from "node:test";
import assert from "node:assert/strict";
import { applePackages } from "../lib/apple-products";
import { appleEntitlement, appleWebhookUsers } from "../lib/server/apple-state";
import { PLANS, PLUS_ANUAL_EUROS } from "../lib/plans";

const now = Date.parse("2026-10-08T12:00:00Z");
const expires = "2026-11-08T12:00:00.000Z";
const entitlement = (product_identifier: string, expires_date: string | null = expires) => ({ product_identifier, expires_date });
const subscriber = (entitlements: Record<string, ReturnType<typeof entitlement>>) => ({ subscriber: { entitlements } });

test("Plus keeps the configured monthly and annual euro prices", () => {
  assert.equal(PLANS.plus.euros, 6.99);
  assert.equal(PLUS_ANUAL_EUROS, 49.99);
});

test("both exact Apple products unlock only Plus through entitlement plus", () => {
  for (const product of ["plus_mensual", "plus_anual"])
    assert.deepEqual(appleEntitlement(subscriber({ plus: entitlement(product) }), now), { plan: "plus", until: expires });
});

test("unrelated entitlements, voice and unknown product identifiers never grant access", () => {
  const cases: Record<string, ReturnType<typeof entitlement>>[] = [
    {}, { other: entitlement("plus_mensual") }, { voice: entitlement("plus_voice") },
    { plus: entitlement("plus_voz") }, { plus: entitlement("unknown") },
    { plus: entitlement("PLUS_MENSUAL") },
  ];
  for (const entitlements of cases)
    assert.deepEqual(appleEntitlement(subscriber(entitlements), now), { plan: "free", until: null });
});

test("an unrelated voice entitlement cannot upgrade a valid Plus subscription", () => {
  assert.deepEqual(appleEntitlement(subscriber({ plus: entitlement("plus_anual"), voice: entitlement("plus_voice") }), now),
    { plan: "plus", until: expires });
});

test("expired, boundary, invalid and absent subscription expiry dates deny access", () => {
  for (const date of ["2026-10-07T12:00:00Z", new Date(now).toISOString(), "invalid", null])
    assert.deepEqual(appleEntitlement(subscriber({ plus: entitlement("plus_mensual", date) }), now), { plan: "free", until: null });
});

test("malformed upstream responses throw instead of revoking a subscription", () => {
  for (const data of [null, {}, { subscriber: {} }, { subscriber: { entitlements: null } }])
    assert.throws(() => appleEntitlement(data, now));
});

test("offerings use product identifiers, ignoring voice and mislabeled packages", () => {
  const monthly = { identifier: "custom_month", product: { identifier: "plus_mensual" } };
  const annual = { identifier: "custom_year", product: { identifier: "plus_anual" } };
  const unknown = { identifier: "$rc_monthly", product: { identifier: "wrong_product" } };
  const voice = { identifier: "voz", product: { identifier: "plus_voice" } };
  assert.deepEqual(applePackages([unknown, voice, monthly, annual]), { mensual: monthly, anual: annual });
  assert.deepEqual(applePackages([unknown, voice]), { mensual: undefined, anual: undefined });
  assert.deepEqual(applePackages([]), { mensual: undefined, anual: undefined });
});

const source = "11111111-1111-4111-8111-111111111111";
const destination = "22222222-2222-4222-8222-222222222222";
test("subscription webhooks deduplicate account IDs and ignore anonymous users", () => {
  assert.deepEqual(appleWebhookUsers({ event: { app_user_id: source, aliases: [source, "$RCAnonymousID:abc", destination] } }), [source, destination]);
  assert.deepEqual(appleWebhookUsers({ event: { app_user_id: "$RCAnonymousID:abc" } }), []);
});

test("TRANSFER synchronizes both source and destination without app_user_id", () => {
  assert.deepEqual(appleWebhookUsers({ event: {
    type: "TRANSFER", transferred_from: [source, "$RCAnonymousID:abc"], transferred_to: [destination, destination],
  } }), [source, destination]);
});

test("malformed webhook payloads are rejected", () => {
  for (const body of [null, {}, { event: null }, { event: { aliases: "not-an-array" } }])
    assert.equal(appleWebhookUsers(body), null);
});
