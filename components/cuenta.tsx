"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Lilita } from "./lilita";
import { Asa } from "./pasos";
import { DURATION, EASE_OUT_QUART } from "@/lib/motion";
import { haptic } from "@/lib/use-lilaila";
import {
  DEMO,
  DIAS_PRUEBA,
  NATIVA,
  GOOGLE_DISPONIBLE,
  OPCIONES,
  PAGA_CON_APPLE,
  SinCompras,
  VENTAJAS_PLUS,
  contratar,
  entrarConApple,
  entrarConGoogle,
  enviarCodigo,
  preciosDeApple,
  restaurarCompras,
  useCuenta,
  verificarCodigo,
} from "@/lib/cuenta";
import type { OpcionId } from "@/lib/compras";
import { PLANS } from "@/lib/plans";

/** Lo que se le dice cuando algo falla, en boca de Lilita. */
export function queHaPasado(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  const code = (e as { code?: unknown })?.code;
  if (e instanceof SinCompras) return m;
  // Cancelar la hoja de Apple no es un error.
  if (/cancel|1001|PURCHASE_CANCELLED/i.test(m) || (e as { userCancelled?: boolean })?.userCancelled) return "";
  if (typeof code === "string" && /otp|token|expired/i.test(code)) return "Ese código no me cuadra o ha caducado. Pide otro.";
  if (typeof code === "string" && /rate|over_email/i.test(code)) return "Demasiados correos seguidos. Espera un minuto y vuelve a pedirlo.";
  if (/fetch|network|load failed/i.test(m)) return "Sin conexión. Mira el wifi y vuelve a probar.";
  // El servidor ya habla claro: se enseña tal cual.
  if ((e as { status?: number })?.status && m) return m;
  return "Algo ha fallado por mi lado. Prueba otra vez en un momento.";
}

/* ═══════════════════════════════════════════════════════════════
   ENTRADA, CUENTA Y PLUS

   Antes de las tres preguntas de siempre: bienvenida, la promesa de
   privacidad y la cuenta (obligatoria en la App Store). Al acabar el
   onboarding, una vez, los planes. Y cuando se acaban las respuestas
   de prueba, la hoja que ofrece Plus en el momento en que lo quiere,
   no antes.
   ═══════════════════════════════════════════════════════════════ */

const STEP_VARIANTS = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 28 : -28 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -28 : 28 }),
};

const BTN =
  "flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full font-display text-base font-bold tracking-[-0.01em] transition-[transform,box-shadow] duration-150 active:scale-[0.975] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-40";
const ACCENT = {
  background: "var(--accent)",
  color: "var(--on-accent)",
  boxShadow: "3px 3px 0 0 var(--depth-shadow)",
};

/* ─── La puerta: bienvenida → privacidad → cuenta → código ──── */

type Paso = "bienvenida" | "privacidad" | "cuenta" | "volver" | "codigo";

/** `directa`: sin bienvenida, directo a entrar (el móvil de la pareja). */
export function Acceso({ directa = false, onDentro }: { directa?: boolean; onDentro: () => void }) {
  const [paso, setPaso] = useState<Paso>(directa ? "volver" : "bienvenida");
  const [dir, setDir] = useState(1);
  const [email, setEmail] = useState("");
  const [desde, setDesde] = useState<"cuenta" | "volver">("cuenta");
  const [error, setError] = useState("");
  const [ocupada, setOcupada] = useState(false);

  function ir(p: Paso, d = 1) {
    haptic(d > 0 ? 10 : 6);
    setError("");
    setDir(d);
    setPaso(p);
  }

  /** Lo que tarda en red: bloquea los botones y traduce el error. */
  async function intentar(f: () => Promise<unknown>) {
    if (ocupada) return false;
    setOcupada(true);
    setError("");
    try {
      await f();
      return true;
    } catch (e) {
      setError(queHaPasado(e));
      return false;
    } finally {
      setOcupada(false);
    }
  }

  function conProveedor(metodo: "apple" | "google") {
    haptic([18, 40, 26]);
    void intentar(metodo === "apple" ? entrarConApple : entrarConGoogle).then((ok) => {
      // Google y Apple en la web se van a otra página y vuelven solos.
      if (ok && (DEMO || (metodo === "apple" && NATIVA))) onDentro();
    });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-safe pb-xl pt-safe">
      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={paso}
          custom={dir}
          variants={STEP_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
          className="flex flex-1 flex-col"
        >
          {paso === "bienvenida" && (
            <Bienvenida onEmpezar={() => ir("privacidad")} onEntrar={() => ir("volver")} />
          )}
          {paso === "privacidad" && <Privacidad onSeguir={() => ir("cuenta")} />}
          {(paso === "cuenta" || paso === "volver") && (
            <AltaOEntrada
              volver={paso === "volver"}
              email={email}
              setEmail={setEmail}
              ocupada={ocupada}
              error={error}
              onProveedor={conProveedor}
              onCodigo={async () => {
                if (await intentar(() => enviarCodigo(email.trim()))) {
                  setDesde(paso);
                  ir("codigo");
                }
              }}
              onCambiar={() => ir(paso === "volver" ? "privacidad" : "volver")}
              onAtras={directa ? undefined : () => ir("bienvenida", -1)}
            />
          )}
          {paso === "codigo" && (
            <Codigo
              email={email.trim()}
              ocupada={ocupada}
              error={error}
              onAtras={() => ir(desde, -1)}
              onReenviar={() => void intentar(() => enviarCodigo(email.trim()))}
              onOk={(codigo) => {
                haptic([18, 40, 26]);
                void intentar(() => verificarCodigo(email.trim(), codigo)).then((ok) => ok && onDentro());
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Bienvenida({ onEmpezar, onEntrar }: { onEmpezar: () => void; onEntrar: () => void }) {
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-lg text-center">
        <Lilita mood="energica" size={168} saluda />
        <div className="text-balance">
          <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-accent">
            Lilaila
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold leading-[1.05] tracking-[-0.035em]">
            Soy Lilita. Lo de cada mes, mejor acompañada.
          </h1>
          <p className="mx-auto mt-3 max-w-[300px] text-sm text-muted">
            Llevo la cuenta, te aviso antes de que llegue y te escucho cuando duele.
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center gap-sm">
        <button type="button" onClick={onEmpezar} className={BTN} style={ACCENT}>
          Empezar
        </button>
        <button type="button" onClick={onEntrar} className="min-h-[48px] text-sm text-muted">
          Ya tengo cuenta ·{" "}
          <span className="font-bold text-fg underline decoration-[var(--border-strong)] underline-offset-4">
            Entrar
          </span>
        </button>
      </div>
    </>
  );
}

const PROMESAS = [
  ["Tu diario es tuyo.", "En tu móvil y en una copia privada de tu cuenta. Nadie más la ve."],
  ["No vendo nada tuyo.", "Ni a anunciantes, ni a aseguradoras, ni a tu ex."],
  ["Lo borras cuando quieras.", "Diario y cuenta, desde Ajustes. Sin pedir permiso a nadie."],
];

function Privacidad({ onSeguir }: { onSeguir: () => void }) {
  return (
    <>
      <div className="flex flex-1 flex-col justify-center gap-lg">
        <div className="flex flex-col items-center gap-md text-center">
          <Lilita mood="cuidando" size={120} />
          <h1 className="text-balance font-display text-xl font-bold leading-[1.1] tracking-[-0.03em]">
            Lo que me cuentes, se queda entre nosotras.
          </h1>
        </div>
        <ul
          className="sticker flex flex-col divide-y divide-[var(--border)] rounded-2xl px-lg"
          style={{ background: "var(--surface)" }}
        >
          {PROMESAS.map(([t, s]) => (
            <li key={t} className="flex gap-3 py-3.5">
              <Check color="var(--ok)" />
              <div>
                <p className="text-base font-semibold">{t}</p>
                <p className="mt-0.5 text-xs text-muted">{s}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" onClick={onSeguir} className={BTN} style={ACCENT}>
        Trato hecho
      </button>
    </>
  );
}

function AltaOEntrada({
  volver,
  email,
  setEmail,
  ocupada,
  error,
  onProveedor,
  onCodigo,
  onCambiar,
  onAtras,
}: {
  volver: boolean;
  email: string;
  setEmail: (v: string) => void;
  ocupada: boolean;
  error: string;
  onProveedor: (m: "apple" | "google") => void;
  onCodigo: () => void | Promise<void>;
  onCambiar: () => void;
  onAtras?: () => void;
}) {
  const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <>
      {onAtras ? (
        <button type="button" onClick={onAtras} className="self-start py-2 text-sm font-semibold text-muted">
          ← Atrás
        </button>
      ) : (
        <span className="h-[36px]" />
      )}
      <div className="flex flex-1 flex-col items-center justify-center gap-md text-center">
        <Lilita mood={volver ? "flirty" : "neutral"} size={108} saluda={volver} />
        <div className="text-balance">
          <h1 className="font-display text-xl font-bold leading-[1.1] tracking-[-0.03em]">
            {volver
              ? "¿Otra vez por aquí? Ya te echaba de menos."
              : "Hazte una cuenta, que si pierdes el móvil me pierdes a mí."}
          </h1>
          <p className="mx-auto mt-2 max-w-[310px] text-sm text-muted">
            {volver
              ? "Entra con lo mismo que usaste la otra vez y recupero tu ciclo."
              : "Tu ciclo se viene contigo al móvil nuevo. Sin contraseñas."}
          </p>
        </div>
      </div>

      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (valido) onCodigo();
        }}
      >
        <button
          type="button"
          disabled={ocupada}
          onClick={() => onProveedor("apple")}
          className={`${BTN} font-sans`}
          style={{ background: "#000", color: "#fff", boxShadow: "3px 3px 0 0 var(--depth-shadow)" }}
        >
          <AppleLogo /> Continuar con Apple
        </button>
        {GOOGLE_DISPONIBLE && (
          <button
            type="button"
            disabled={ocupada}
            onClick={() => onProveedor("google")}
            className={`${BTN} flat font-sans`}
            style={{ background: "var(--surface)" }}
          >
            <GoogleLogo /> Continuar con Google
          </button>
        )}

        <div className="my-1 flex items-center gap-3 text-2xs font-semibold uppercase tracking-[0.14em] text-faint">
          <span className="h-px flex-1 bg-[var(--border)]" /> o con tu correo{" "}
          <span className="h-px flex-1 bg-[var(--border)]" />
        </div>

        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value.slice(0, 120))}
          placeholder="tu@correo.com"
          aria-label="Tu correo"
          className="flat min-h-[54px] rounded-full px-5 text-base outline-none"
          style={{ background: "var(--surface)" }}
        />
        <button
          type="submit"
          disabled={!valido || ocupada}
          className={BTN}
          style={{ background: "var(--accent-soft)", color: "var(--accent)", boxShadow: "inset 0 0 0 1.5px var(--accent)" }}
        >
          {ocupada ? "Enviando…" : "Mándame un código"}
        </button>
        {error && (
          <p role="alert" className="text-center text-sm" style={{ color: "var(--accent)" }}>
            {error}
          </p>
        )}

        <button type="button" onClick={onCambiar} className="min-h-[40px] text-sm text-muted">
          {volver ? "¿Nueva por aquí? " : "¿Ya tienes cuenta? "}
          <span className="font-bold text-fg underline decoration-[var(--border-strong)] underline-offset-4">
            {volver ? "Empezar de cero" : "Entrar"}
          </span>
        </button>
        <p className="text-center text-2xs leading-snug text-faint">
          Al seguir aceptas las <u>condiciones</u> y la <u>privacidad</u>.
        </p>
      </form>
    </>
  );
}

function Codigo({
  email,
  ocupada,
  error,
  onAtras,
  onReenviar,
  onOk,
}: {
  email: string;
  ocupada: boolean;
  error: string;
  onAtras: () => void;
  onReenviar: () => void;
  onOk: (codigo: string) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [espera, setEspera] = useState(30);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (espera <= 0) return;
    const t = window.setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [espera]);

  return (
    <>
      <button type="button" onClick={onAtras} className="self-start py-2 text-sm font-semibold text-muted">
        ← Otro correo
      </button>
      <div className="flex flex-1 flex-col items-center justify-center gap-lg text-center">
        <Lilita mood="energica" size={112} />
        <div className="text-balance">
          <h1 className="font-display text-xl font-bold leading-[1.1] tracking-[-0.03em]">
            Mira tu correo, corre.
          </h1>
          <p className="mx-auto mt-2 max-w-[300px] text-sm text-muted">
            Te he mandado seis números a <b className="text-fg">{email || "tu correo"}</b>. Caducan en 10 minutos.
          </p>
        </div>
        <label className="relative flex gap-2" onClick={() => input.current?.focus()}>
          {Array.from({ length: 6 }, (_, i) => {
            const activo = i === Math.min(codigo.length, 5);
            return (
              <span
                key={i}
                aria-hidden="true"
                className="tnum flex h-[58px] w-[46px] items-center justify-center rounded-xl font-display text-2xl font-bold"
                style={{
                  background: "var(--surface)",
                  boxShadow: activo
                    ? "inset 0 0 0 2px var(--accent), 2px 2px 0 0 var(--depth-shadow)"
                    : "inset 0 0 0 1.5px var(--border-strong)",
                }}
              >
                {codigo[i] ?? ""}
              </span>
            );
          })}
          <input
            ref={input}
            autoFocus
            value={codigo}
            onChange={(e) => {
              const c = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCodigo(c);
              // El código que iOS sugiere encima del teclado entra de golpe.
              if (c.length === 6 && !ocupada) onOk(c);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Código de seis cifras"
            className="absolute inset-0 opacity-0"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm" style={{ color: "var(--accent)" }}>
            {error}
          </p>
        ) : (
          <p className="text-xs text-faint">Si el móvil te lo ofrece encima del teclado, tócalo y listo.</p>
        )}
      </div>
      <div className="flex flex-col items-center gap-sm">
        <button
          type="button"
          disabled={codigo.length < 6 || ocupada}
          onClick={() => onOk(codigo)}
          className={BTN}
          style={ACCENT}
        >
          {ocupada ? "Comprobando…" : "Entrar"}
        </button>
        <button
          type="button"
          disabled={espera > 0}
          onClick={() => {
            setEspera(30);
            onReenviar();
          }}
          className="min-h-[40px] pt-2 text-sm text-muted disabled:text-faint"
        >
          {espera > 0 ? `¿No llega? Reenviar en 0:${String(espera).padStart(2, "0")}` : "Reenviar el código"}
        </button>
      </div>
    </>
  );
}

/* ─── Planes ─────────────────────────────────────────────────── */

export function Planes({ onCerrar, inicial = "anual" }: { onCerrar: () => void; inicial?: OpcionId }) {
  const cuenta = useCuenta();
  const conVoz = !PAGA_CON_APPLE && !!cuenta?.venta?.voz;
  const ids: OpcionId[] = conVoz ? ["anual", "mensual", "voz"] : ["anual", "mensual"];
  const [opcion, setOpcion] = useState<OpcionId>(inicial === "voz" && !conVoz ? "anual" : inicial);
  const [precios, setPrecios] = useState<Partial<Record<OpcionId, string>>>({});
  const [ocupada, setOcupada] = useState(false);
  const [aviso, setAviso] = useState("");
  const precio = (id: OpcionId) => precios[id] ?? OPCIONES[id].precio;
  const elegida = OPCIONES[opcion];
  // La prueba gratis es la oferta de Apple para Plus; en la web se paga desde el primer día.
  const prueba = PAGA_CON_APPLE && elegida.plan === "plus";

  useEffect(() => {
    preciosDeApple().then(setPrecios).catch(() => {});
  }, []);

  async function intentar(f: () => Promise<unknown>, cerrar: boolean) {
    if (ocupada) return;
    setOcupada(true);
    setAviso("");
    try {
      await f();
      if (cerrar) onCerrar();
    } catch (e) {
      setAviso(queHaPasado(e));
    } finally {
      setOcupada(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: EASE_OUT_QUART }}
      role="dialog"
      aria-modal="true"
      aria-label="Lilaila Plus"
      className="fixed inset-0 z-50 mx-auto flex w-full max-w-[440px] flex-col overflow-y-auto bg-bg px-safe pb-xl pt-safe"
    >
      <div className="flex items-center justify-between pt-sm">
        {PAGA_CON_APPLE ? (
          <button
            type="button"
            disabled={ocupada}
            onClick={() => void intentar(restaurarCompras, false)}
            className="py-2 text-sm font-semibold text-faint"
          >
            Restaurar compras
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Ahora no"
          className="flat flex size-9 items-center justify-center rounded-full text-lg text-muted"
        >
          ×
        </button>
      </div>

      <div className="flex items-end gap-3 pt-1">
        <Lilita mood="flirty" size={84} className="shrink-0" />
        <div className="pb-2">
          <p className="text-2xs font-bold uppercase tracking-[0.14em] text-accent">Lilaila Plus</p>
          <h1 className="font-display text-xl font-bold leading-[1.05] tracking-[-0.03em]">
            Desbloquéame entera.
          </h1>
        </div>
      </div>

      <ul className="mt-md flex flex-col gap-2.5">
        {VENTAJAS_PLUS.map(([t, s]) => (
          <li key={t} className="flex gap-2.5">
            <Check />
            <p className="text-sm leading-snug">
              <b className="font-semibold">{t}.</b> <span className="text-muted">{s}</span>
            </p>
          </li>
        ))}
      </ul>

      <div role="radiogroup" aria-label="Plan" className="mt-auto flex flex-col gap-2.5 pt-md">
        {ids.map((id) => {
          const o = OPCIONES[id];
          const activo = opcion === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => {
                haptic(10);
                setOpcion(id);
              }}
              className="relative rounded-2xl px-lg py-3.5 text-left transition-[box-shadow] duration-150"
              style={
                activo
                  ? { background: "var(--accent-soft)", boxShadow: "inset 0 0 0 2px var(--accent), 3px 3px 0 0 var(--depth-shadow)" }
                  : { background: "var(--surface)", boxShadow: "inset 0 0 0 1.5px var(--border)" }
              }
            >
              {id === "anual" && (
                <span
                  className="absolute -top-2.5 right-4 rounded-full px-2.5 py-0.5 text-2xs font-bold"
                  style={{ background: "var(--accent)", color: "var(--on-accent)" }}
                >
                  La lista
                </span>
              )}
              <span className="flex items-baseline justify-between">
                <span className="font-display text-base font-bold" style={{ color: activo ? "var(--accent)" : undefined }}>
                  {o.nombre}
                </span>
                <span className="tnum font-display text-lg font-bold">
                  {precio(id)}
                  <span className="text-xs font-normal text-muted"> /{o.cada}</span>
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-muted">{o.detalle}</span>
            </button>
          );
        })}

        <button
          type="button"
          disabled={ocupada}
          onClick={() => {
            haptic([18, 40, 26]);
            void intentar(() => contratar(opcion), PAGA_CON_APPLE);
          }}
          className={`${BTN} mt-1`}
          style={ACCENT}
        >
          {ocupada ? "Un momento…" : prueba ? `Probar ${DIAS_PRUEBA} días gratis` : `Quiero ${elegida.nombre}`}
        </button>
        {aviso && (
          <p role="alert" className="text-center text-sm" style={{ color: "var(--accent)" }}>
            {aviso}
          </p>
        )}
        <p className="text-center text-2xs leading-snug text-faint">
          {prueba
            ? `Gratis ${DIAS_PRUEBA} días y luego ${precio(opcion)} al ${elegida.cada}. Se renueva sola salvo que la canceles 24 h antes, desde los ajustes de tu cuenta de Apple.`
            : PAGA_CON_APPLE
              ? `${precio(opcion)} al ${elegida.cada}. Se renueva sola salvo que la canceles 24 h antes, desde los ajustes de tu cuenta de Apple.`
              : `${precio(opcion)} al ${elegida.cada}, IVA incluido. Se renueva sola; la cancelas cuando quieras desde Ajustes.`}{" "}
          <u>Condiciones</u> · <u>Privacidad</u>
        </p>
      </div>
    </motion.div>
  );
}

/* ─── Hoja: se acabaron las respuestas de prueba ─────────────── */

export function LimiteCharlas({
  abierta,
  onCerrar,
  onPlus,
}: {
  abierta: boolean;
  onCerrar: () => void;
  onPlus: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
  }, [abierta]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label="Respuestas de prueba agotadas"
      onClose={onCerrar}
      onPointerDown={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      {abierta && (
        <div className="sheet-panel flex flex-col items-center gap-md px-lg pb-safe pt-sm text-center">
          <Asa />
          <Lilita mood="exhausta" size={96} />
          <div className="text-balance">
            <h2 className="font-display text-lg font-bold leading-[1.15] tracking-[-0.02em]">
              Ya me has gastado las {PLANS.free.messages} respuestas de prueba.
            </h2>
            <p className="mx-auto mt-2 max-w-[300px] text-sm text-muted">
              Tu diario sigue igual, gratis. Para seguir hablando conmigo, Plus: {PLANS.plus.messages} respuestas al mes.
            </p>
          </div>
          <button type="button" onClick={onPlus} className={BTN} style={ACCENT}>
            {PAGA_CON_APPLE ? `Probar Plus ${DIAS_PRUEBA} días gratis` : "Ver Plus"}
          </button>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="mb-md min-h-[40px] text-sm font-semibold text-muted"
          >
            Ahora no
          </button>
        </div>
      )}
    </dialog>
  );
}


/* ─── Piezas ─────────────────────────────────────────────────── */

export function Check({ color = "var(--accent)" }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="mt-[2px] shrink-0">
      <path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg width="17" height="20" viewBox="0 0 17 20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14.1 10.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9C3.6 4.8 1.9 5.8 1 7.4c-1.9 3.3-.5 8.1 1.3 10.8.9 1.3 2 2.7 3.4 2.7 1.4-.1 1.9-.9 3.5-.9s2.1.9 3.5.9c1.4 0 2.4-1.3 3.2-2.6 1-1.5 1.4-2.9 1.4-3-.1 0-2.8-1.1-2.8-4.2zM11.6 3c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.2 1.1.1 2.3-.6 3-1.5z"
      />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
