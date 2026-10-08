import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
import { PLANS, PLUS_ANUAL_EUROS } from "../lib/plans";
import { NextRequest, NextResponse } from "next/server";
import * as appleProducts from "../lib/apple-products";

/** Ejecuta los módulos reales con servicios dobles: ninguna petición sale
 * hacia Supabase, Stripe o RevenueCat. Cada carga tiene estado aislado. */
function isolatedModule<T>(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loaded = { exports: {} };
  const require = (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  };
  new Function("require", "module", "exports", ...Object.keys(globals), outputText)(require, loaded, loaded.exports, ...Object.values(globals));
  return loaded.exports as T;
}

const http = {
  privateJson: (body: unknown, status = 200) => Response.json(body, { status }),
  sameOrigin: () => true,
  limitedJson: (req: Request) => req.json(),
};

test("RevenueCat initialization resolves despite Capacitor exposing a then method", async () => {
  const calls: string[] = [];
  let user = "";
  const sdk = new Proxy({
    configure: async ({ appUserID }: { appUserID: string }) => { user = appUserID; calls.push("configure"); },
    getAppUserID: async () => ({ appUserID: user }),
    logIn: async ({ appUserID }: { appUserID: string }) => { user = appUserID; calls.push(`login:${user}`); },
    getOfferings: async () => { calls.push("offerings"); return { current: { availablePackages: [] } }; },
  }, { get: (target, prop) => prop === "then" ? () => { calls.push("unexpected then"); } : Reflect.get(target, prop) });
  const compras = isolatedModule<typeof import("../lib/compras")>("../lib/compras.ts", {
    "@capacitor/core": { Capacitor: { getPlatform: () => "ios" } },
    "@revenuecat/purchases-capacitor": { Purchases: sdk }, "./apple-products": appleProducts,
  }, { process: { env: { NEXT_PUBLIC_REVENUECAT_IOS_KEY: "appl_test" } } });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        await Promise.all([compras.iniciarCompras("first"), compras.iniciarCompras("second")]);
        assert.deepEqual(await compras.paquetes(), { mensual: undefined, anual: undefined });
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("RevenueCat initialization never resolved")), 1000); }),
    ]);
  } finally { clearTimeout(timer); }
  assert.deepEqual(calls, ["configure", "login:second", "offerings"]);
});

test("Apple webhook reaches its authentication without Origin while account writes remain protected", () => {
  const { proxy } = isolatedModule<typeof import("../proxy")>("../proxy.ts", {
    "next/server": { NextResponse }, "@/lib/account-mode": { accountMode: () => true },
  });
  const request = (path: string, method: string, origin?: string) => new NextRequest(`https://lilaila.vercel.app${path}`, {
    method, headers: origin ? { origin } : {},
  });
  const webhook = proxy(request("/api/billing/apple", "POST"));
  assert.equal(webhook.headers.get("x-middleware-next"), "1");
  assert.equal(proxy(request("/api/billing/apple", "PUT")).status, 403);
  assert.equal(proxy(request("/api/billing/apple", "PUT", "https://untrusted.invalid")).status, 403);
  assert.equal(proxy(request("/api/billing/apple", "PUT", "https://lilaila.vercel.app")).headers.get("x-middleware-next"), "1");
  assert.equal(proxy(request("/api/account", "DELETE")).status, 403);
  assert.equal(proxy(request("/api/billing/apple/extra", "POST")).status, 403);
});

function budget(plan: "free" | "plus", failedLookup = false, rpcError?: string) {
  let reservations = 0;
  const api = isolatedModule<typeof import("../lib/server/ai-budget")>("../lib/server/ai-budget.ts", {
    "server-only": {}, "./http": http,
    "./billing": {
      billingAccount: async () => { if (failedLookup) throw new Error("offline"); return { plan }; },
      activePlan: (account: { plan: string }) => account.plan,
    },
    "./supabase": { adminDb: () => ({ rpc: async () => {
      reservations++;
      return { data: rpcError ? { error: rpcError } : { seconds: 0 }, error: null };
    } }) },
  });
  return { ...api, reservations: () => reservations };
}

test("reserve blocks free chat before the RPC, even with the old database quota", async () => {
  const server = budget("free");
  const result = await server.reserve("free-user", "chat");
  assert.equal(result.response?.status, 402);
  assert.deepEqual(await result.response?.json(), {
    error: "El plan gratuito no incluye respuestas de Lilita. Para hablar con ella, elige Plus.", code: "plus_required",
  });
  assert.equal(server.reservations(), 0);
});

test("reserve fails closed if the current plan cannot be read", async () => {
  const server = budget("plus", true);
  assert.equal((await server.reserve("user", "chat")).response?.status, 503);
  assert.equal(server.reservations(), 0);
});

test("Plus still reaches the budget RPC and respects a subscription expiry during reservation", async () => {
  const paid = budget("plus");
  assert.ok((await paid.reserve("user", "chat")).id);
  assert.equal(paid.reservations(), 1);
  const expired = budget("plus", false, "plus_required");
  assert.equal((await expired.reserve("user", "chat")).response?.status, 402);
});

test("web checkout rejects voice without contacting Stripe or reserving a checkout", async () => {
  let providerCalls = 0;
  const unexpected = () => { providerCalls++; throw new Error("Must not reach provider"); };
  const api = isolatedModule<typeof import("../app/api/billing/checkout/route")>("../app/api/billing/checkout/route.ts", {
    zod: { z }, "@/lib/server/http": http, "@/lib/plans": { PLANS, PLUS_ANUAL_EUROS },
    "@/lib/server/supabase": { currentUser: async () => ({ id: "user" }), adminDb: unexpected },
    "@/lib/server/billing": { billingAccount: unexpected, billingStore: unexpected, priceId: unexpected, stripeClient: unexpected },
  });
  for (const periodo of ["mensual", "anual"]) {
    const result = await api.POST(new Request("http://localhost/api/billing/checkout", {
      method: "POST", body: JSON.stringify({ plan: "voice", periodo }),
    }));
    assert.equal(result.status, 403);
    assert.match((await result.json()).error, /próximamente/);
  }
  assert.equal(providerCalls, 0);
});

test("client refuses voice purchases on web, iPhone and demo before contacting providers", async () => {
  for (const native of [false, true]) for (const demo of [false, true]) {
    const previous = process.env.NEXT_PUBLIC_CUENTAS;
    process.env.NEXT_PUBLIC_CUENTAS = demo ? "demo" : "";
    let providerCalls = 0;
    const api = isolatedModule<typeof import("../lib/cuenta")>("../lib/cuenta.ts", {
      react: {}, "@capacitor/core": { Capacitor: { isNativePlatform: () => native } },
      "./account-mode": { accountMode: () => true }, "./plans": { PLANS, PLUS_ANUAL_EUROS },
      "./compras": { comprar: () => { providerCalls++; } },
    }, { window: {} });
    try {
      assert.equal(api.NATIVA, native);
      await assert.rejects(api.contratar("voz"), /próximamente/);
      assert.equal(providerCalls, 0);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_CUENTAS;
      else process.env.NEXT_PUBLIC_CUENTAS = previous;
    }
  }
});
