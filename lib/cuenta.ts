"use client";

import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { accountMode } from "./account-mode";
import { PLANS, PLUS_ANUAL_EUROS, type Periodo, type Plan } from "./plans";
import {
  abrirSuscripcionesApple,
  comprar,
  comprasDisponibles,
  iniciarCompras,
  paquetes,
  restaurar,
  type OpcionId,
} from "./compras";

/* ═══════════════════════════════════════════════════════════════
   CUENTA Y SUSCRIPCIÓN, DESDE EL MÓVIL

   La sesión y el plan viven en el servidor (/api/auth, /api/account).
   Aquí solo se guarda lo último que se supo para pintar, y se decide
   por dónde se paga: compras de Apple en el iPhone, Stripe en la web.

     · NEXT_PUBLIC_ACCOUNT_MODE=true → cuentas de verdad (obligatorias)
     · NEXT_PUBLIC_CUENTAS=demo      → todo de mentira, para enseñar pantallas
     · nada                          → la app de siempre, la de Lídia
   ═══════════════════════════════════════════════════════════════ */

export const DEMO = process.env.NEXT_PUBLIC_CUENTAS === "demo";
export const CUENTAS_ACTIVAS = accountMode() || DEMO;
export const NATIVA = typeof window !== "undefined" && Capacitor.isNativePlatform();

/** Google no deja entrar desde una vista web dentro de una app: en la
    nativa solo Apple y correo hasta que haya Google nativo. */
export const GOOGLE_DISPONIBLE = !NATIVA;

export const DIAS_PRUEBA = 7;

const euros = (n: number) => `${n.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`;

export const OPCIONES: Record<
  OpcionId,
  { plan: Exclude<Plan, "free">; periodo: Periodo; nombre: string; precio: string; cada: string; detalle: string }
> = {
  anual: {
    plan: "plus",
    periodo: "anual",
    nombre: "Plus anual",
    precio: euros(PLUS_ANUAL_EUROS),
    cada: "año",
    detalle: `${euros(Math.floor((PLUS_ANUAL_EUROS / 12) * 100) / 100)} al mes · te ahorras un 40 %`,
  },
  mensual: {
    plan: "plus",
    periodo: "mensual",
    nombre: "Plus mensual",
    precio: euros(PLANS.plus.euros),
    cada: "mes",
    detalle: "Sin compromiso, lo dejas cuando quieras",
  },
  voz: {
    plan: "voice",
    periodo: "mensual",
    nombre: "Plus con voz",
    precio: euros(PLANS.voice.euros),
    cada: "mes",
    detalle: "Todo Plus y 10 llamadas al mes para hablar conmigo",
  },
};

export const VENTAJAS_PLUS: [string, string][] = [
  ["Hablar conmigo de verdad", `${PLANS.plus.messages} respuestas al mes, a las 3 de la mañana también.`],
  ["Entender tus registros", "Te digo qué veo en tu historial y qué te viene."],
  ["Sin sustos", "Si llegas al tope, paro. Nunca te cobro de más."],
];

export type Metodo = "apple" | "google" | "email";

export interface Cuenta {
  id: string;
  email: string;
  metodo: Metodo;
  plan: Plan;
  /** Dónde se paga lo que tiene: cambia cómo se gestiona. */
  tienda: "apple" | "stripe" | null;
  hasta: string | null;
  uso?: { mensajes: number; segundos: number; renueva: string | null };
  /** Qué se puede contratar ahora mismo desde aquí. */
  venta?: { web: boolean; anual: boolean; voz: boolean; apple: boolean };
}

/* ─── La copia en memoria ────────────────────────────────────── */

const listeners = new Set<() => void>();
let actual: Cuenta | null | undefined = undefined;

function fijar(c: Cuenta | null) {
  actual = c;
  if (DEMO) {
    try {
      if (c) localStorage.setItem(DEMO_KEY, JSON.stringify(c));
      else localStorage.removeItem(DEMO_KEY);
    } catch {}
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** undefined mientras no se sabe (primer render, o cargando). */
export function useCuenta(): Cuenta | null | undefined {
  return useSyncExternalStore(subscribe, () => actual, () => undefined);
}

async function json<T>(r: Response): Promise<T> {
  const d = (await r.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!r.ok) throw Object.assign(new Error(d.error ?? `HTTP ${r.status}`), { code: d.code, status: r.status });
  return d;
}

const enviar = (url: string, body?: unknown, method = "POST") =>
  fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then(json<Record<string, unknown>>);

/* ─── Modo demo: sin servidor ────────────────────────────────── */

const DEMO_KEY = "lilaila:cuenta";

function cuentaDemo(metodo: Metodo, email: string): Cuenta {
  return {
    id: "demo",
    email,
    metodo,
    plan: "free",
    tienda: null,
    hasta: null,
    uso: { mensajes: 0, segundos: 0, renueva: null },
    venta: { web: true, anual: true, voz: true, apple: true },
  };
}

/* ─── Sesión ─────────────────────────────────────────────────── */

type Estado = { authenticated: boolean; user?: { id: string; email: string; method?: Metodo } | null };

/** Lo que dice el servidor ahora. Lanza si no hay red. */
export async function comprobarSesion(): Promise<Estado> {
  if (DEMO) {
    let c: Cuenta | null = null;
    try {
      c = JSON.parse(localStorage.getItem(DEMO_KEY) ?? "null") as Cuenta | null;
    } catch {}
    fijar(c);
    return { authenticated: !!c, user: c && { id: c.id, email: c.email, method: c.metodo } };
  }
  const d = await fetch("/api/auth", { cache: "no-store" }).then(json<Estado>);
  if (d.authenticated && d.user) {
    fijar({
      ...(actual?.id === d.user.id ? actual : { plan: "free" as Plan, tienda: null, hasta: null }),
      id: d.user.id,
      email: d.user.email ?? "",
      metodo: d.user.method ?? "email",
    });
    if (NATIVA) iniciarCompras(d.user.id);
    void refrescarPlan();
  } else fijar(null);
  return d;
}

/** Vuelve a leer plan y uso. Sin red se queda con lo que había. */
export async function refrescarPlan() {
  if (DEMO || !actual) return;
  try {
    const d = await fetch("/api/account", { cache: "no-store" }).then(
      json<{
        plan: Plan;
        store: Cuenta["tienda"];
        paidUntil: string | null;
        usedMessages: number;
        usedSeconds: number;
        resetsAt: string | null;
        billingReady: boolean;
        annualReady: boolean;
        voiceReady: boolean;
        appleReady: boolean;
      }>,
    );
    if (!actual) return;
    fijar({
      ...actual,
      plan: d.plan,
      tienda: d.store,
      hasta: d.paidUntil,
      uso: { mensajes: d.usedMessages, segundos: d.usedSeconds, renueva: d.resetsAt },
      venta: { web: d.billingReady, anual: d.annualReady, voz: d.voiceReady, apple: d.appleReady },
    });
  } catch {}
}

export async function enviarCodigo(email: string) {
  if (DEMO) return;
  await enviar("/api/auth", { email });
}

export async function verificarCodigo(email: string, token: string) {
  if (DEMO) return fijar(cuentaDemo("email", email));
  await enviar("/api/auth", { email, token });
  await comprobarSesion();
}

async function sha256(texto: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function conRedireccion(provider: "apple" | "google") {
  const { url } = await enviar("/api/auth", { provider, redirect: true });
  if (typeof url === "string") location.assign(url);
}

export async function entrarConApple() {
  if (DEMO) return fijar(cuentaDemo("apple", "privado@icloud.com"));
  if (!NATIVA) return conRedireccion("apple");
  // En el iPhone, la hoja de Apple del sistema; el token va al servidor,
  // que abre la sesión con la cookie de siempre.
  const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
  const nonce = crypto.randomUUID() + crypto.randomUUID();
  const { response } = await SignInWithApple.authorize({
    clientId: "app.lilaila",
    redirectURI: `${location.origin}/auth/callback`,
    scopes: "email",
    nonce: await sha256(nonce),
  });
  await enviar("/api/auth", { provider: "apple", idToken: response.identityToken, nonce });
  await comprobarSesion();
}

export async function entrarConGoogle() {
  if (DEMO) return fijar(cuentaDemo("google", "tu@gmail.com"));
  return conRedireccion("google");
}

export async function salir() {
  if (!DEMO) await enviar("/api/auth", undefined, "DELETE");
  fijar(null);
}

export async function borrarCuenta() {
  if (!DEMO) await enviar("/api/account", undefined, "DELETE");
  fijar(null);
}

/* ─── Plus ───────────────────────────────────────────────────── */

/** Se paga con Apple dentro de la app del iPhone; si no, en la web. */
export const PAGA_CON_APPLE = NATIVA;

/** Precios de Apple en la moneda de cada país, si los hay. */
export async function preciosDeApple(): Promise<Partial<Record<OpcionId, string>>> {
  if (!comprasDisponibles()) return {};
  const p = await paquetes();
  return {
    anual: p.anual?.product.priceString,
    mensual: p.mensual?.product.priceString,
    voz: p.voz?.product.priceString,
  };
}

/** No se puede comprar desde aquí (aún): el porqué va en el mensaje. */
export class SinCompras extends Error {}

/** Contrata una opción. En la web, se va a pagar y vuelve. */
export async function contratar(id: OpcionId) {
  const c = actual;
  if (!c) return;
  const o = OPCIONES[id];
  if (DEMO) {
    const hasta = new Date();
    hasta.setDate(hasta.getDate() + DIAS_PRUEBA);
    return fijar({ ...c, plan: o.plan, tienda: "apple", hasta: hasta.toISOString() });
  }
  if (PAGA_CON_APPLE) {
    if (!comprasDisponibles() || !c.venta?.apple) throw new SinCompras("Las compras del iPhone abren muy pronto.");
    const paquete = (await paquetes())[id];
    if (!paquete) throw new SinCompras("Este plan no está a la venta ahora mismo.");
    await comprar(paquete);
    await enviar("/api/billing/apple", undefined, "PUT");
    return refrescarPlan();
  }
  if (!c.venta?.web || (id === "anual" && !c.venta.anual) || (id === "voz" && !c.venta.voz))
    throw new SinCompras("Este plan todavía no está a la venta.");
  const { url } = await enviar("/api/billing/checkout", { plan: o.plan, periodo: o.periodo });
  if (typeof url === "string") location.assign(url);
}

export async function restaurarCompras() {
  if (DEMO || !actual) return;
  if (!comprasDisponibles()) throw new SinCompras("Restaurar es cosa de la app del iPhone.");
  await restaurar();
  await enviar("/api/billing/apple", undefined, "PUT");
  await refrescarPlan();
}

/** Cambiar o cancelar: donde se pagó. */
export async function gestionarSuscripcion() {
  const c = actual;
  if (!c) return;
  if (DEMO) return fijar({ ...c, plan: "free", tienda: null, hasta: null });
  if (c.tienda === "apple") {
    if (NATIVA) return abrirSuscripcionesApple();
    throw new SinCompras("Tu suscripción va con Apple: se cambia en los ajustes del iPhone.");
  }
  const { url } = await enviar("/api/billing/portal");
  if (typeof url === "string") location.assign(url);
}

/* ─── Planes vistos ─────────────────────────────────────────────
   Al terminar el onboarding se enseñan los planes una vez, por cuenta. */

const VISTOS = "lilaila:planes-vistos";

export function planesVistos(c: Cuenta): boolean {
  try {
    return (localStorage.getItem(VISTOS) ?? "").split(",").includes(c.id);
  } catch {
    return true;
  }
}

export function marcarPlanesVistos() {
  const c = actual;
  if (!c) return;
  try {
    const vistos = new Set((localStorage.getItem(VISTOS) ?? "").split(",").filter(Boolean));
    vistos.add(c.id);
    localStorage.setItem(VISTOS, [...vistos].join(","));
  } catch {}
  fijar({ ...c });
}
