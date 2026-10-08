"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { AnimatePresence, motion } from "motion/react";
import { Lilita } from "./lilita";
import { fromKey, startPeriod, toKey, todayKey, updateSettings } from "@/lib/db";
import { DURATION, EASE_OUT_QUART } from "@/lib/motion";
import { haptic } from "@/lib/use-lilaila";
import { capitalize } from "@/lib/format";
import { esMenor } from "@/lib/pareja";
import { marcarTourPendiente } from "@/lib/tour";

/* Un paso entra por donde se fue el anterior: hacia delante viene de
   la derecha, hacia atrás de la izquierda — el mismo lenguaje que
   "pasar página", no un simple fundido que no dice en qué sentido te
   mueves. */
const STEP_VARIANTS = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 28 : -28 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -28 : 28 }),
};

/* ═══════════════════════════════════════════════════════════════
   ONBOARDING

   Unos segundos: nombre, año de nacimiento, pareja (solo con 18 o
   más), última regla y duración media. Lo justo para que la primera pantalla de Hoy no salga en
   blanco ("día 1 de un ciclo de 28" inventado) — el resto lo aprende
   sola de lo que registre. Sin barra de progreso agresiva ni
   validación estricta: si no se acuerda de la fecha, se salta, y el
   nombre por defecto ya es el suyo.
   ═══════════════════════════════════════════════════════════════ */

const RELATIVOS = ["Hoy", "Ayer", "Hace 2 días", "Hace 3 días", "Hace 4 días"];
const DURACIONES = [24, 26, 28, 30, 32, 35];

type Paso = "nombre" | "edad" | "cumple" | "pareja" | "ultima" | "duracion";

const AÑO = new Date().getFullYear();
const AÑOS = Array.from({ length: 71 }, (_, i) => AÑO - 10 - i);

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [name, setName] = useState("");
  const [birthYear, setBirthYear] = useState(AÑO - 20);
  const [cumplidos18, setCumplidos18] = useState<boolean | null>(null);
  const [partner, setPartner] = useState("");
  const [sinPareja, setSinPareja] = useState<"no" | "secreto" | null>(null);
  const [lastPeriod, setLastPeriod] = useState<string | "unsure" | null>(null);
  const [avgLength, setAvgLength] = useState(28);
  const [saving, setSaving] = useState(false);

  // Con justo 18 años de diferencia hay que preguntar si ya los ha
  // cumplido; la pareja solo se pregunta a mayores de edad.
  const exacto = AÑO - birthYear === 18;
  const menor = esMenor({ birthYear, cumplidos18: cumplidos18 ?? false });
  const pasos: Paso[] = [
    "nombre",
    "edad",
    ...(exacto ? (["cumple"] as const) : []),
    ...(menor ? [] : (["pareja"] as const)),
    "ultima",
    "duracion",
  ];
  const paso = pasos[step];
  const ultimo = step === pasos.length - 1;
  const bloqueado = paso === "cumple" && cumplidos18 === null;

  function goNext() {
    setDir(1);
    setStep((s) => s + 1);
  }
  function goBack() {
    setDir(-1);
    setStep((s) => s - 1);
  }

  const base = fromKey(todayKey());

  async function finish() {
    if (saving) return;
    setSaving(true);
    haptic([18, 40, 26]);
    // Antes de guardar: en cuanto "onboarded" pasa a true el shell
    // deja de pintar esto, y tiene que encontrarse el tour ya pedido.
    marcarTourPendiente();
    await updateSettings({
      name: name.trim() || "Lidia",
      avgCycleLength: avgLength,
      birthYear,
      cumplidos18: exacto ? !!cumplidos18 : undefined,
      partnerName: menor || sinPareja ? null : partner.trim() || null,
      onboarded: true,
    });
    if (lastPeriod && lastPeriod !== "unsure") {
      await startPeriod(lastPeriod);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-between gap-xl px-safe pb-2xl pt-safe">
      <div className="flex justify-center gap-1.5 pt-lg" aria-hidden="true">
        {pasos.map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-6 rounded-full transition-colors duration-200"
            style={{ background: i <= step ? "var(--accent)" : "var(--border)" }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
      {paso === "nombre" && (
        <motion.div
          key="nombre"
          custom={dir}
          variants={STEP_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
          className="flex flex-1 flex-col items-center justify-center gap-lg"
        >
          <Lilita mood="energica" size={128} />
          <div className="text-balance text-center">
            <h1 className="font-display text-xl font-bold leading-[1.15] tracking-[-0.03em]">
              Bienvenida al infierno mensual. Estoy aquí.
            </h1>
            <p className="mt-2 text-sm text-muted">¿Cómo te llamo?</p>
          </div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 40))}
            placeholder="Lidia"
            aria-label="Tu nombre"
            className="w-full rounded-2xl px-4 py-3.5 text-center font-display text-lg outline-none"
            style={{ background: "var(--surface)", boxShadow: "var(--depth-sm)" }}
          />
        </motion.div>
      )}

      {paso === "edad" && (
        <motion.div
          key="edad"
          custom={dir}
          variants={STEP_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
          className="flex flex-1 flex-col items-center justify-center gap-lg"
        >
          <Lilita mood="neutral" size={112} />
          <div className="text-balance text-center">
            <h1 className="font-display text-lg font-bold leading-[1.2] tracking-[-0.02em]">
              ¿En qué año naciste?
            </h1>
            <p className="mt-2 text-sm text-muted">
              No es por cotillear: según la edad te cuento unas cosas u otras.
            </p>
          </div>
          <RuedaAños value={birthYear} onChange={(a) => {
            setBirthYear(a);
            setCumplidos18(null);
          }} />
        </motion.div>
      )}

      {paso === "cumple" && (
        <motion.div
          key="cumple"
          custom={dir}
          variants={STEP_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
          className="flex flex-1 flex-col items-center justify-center gap-lg"
        >
          <Lilita mood="energica" size={112} />
          <div className="text-balance text-center">
            <h1 className="font-display text-lg font-bold leading-[1.2] tracking-[-0.02em]">
              ¿Ya has cumplido los 18?
            </h1>
            <p className="mt-2 text-sm text-muted">Este año te tocan. Dime si ya ha pasado la tarta.</p>
          </div>
          <div className="flex w-full flex-col gap-2">
            {([[true, "Sí, ya los tengo"], [false, "Todavía no"]] as const).map(([v, label]) => (
              <Opcion key={label} activa={cumplidos18 === v} onClick={() => setCumplidos18(v)}>
                {label}
              </Opcion>
            ))}
          </div>
        </motion.div>
      )}

      {paso === "pareja" && (
        <motion.div
          key="pareja"
          custom={dir}
          variants={STEP_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
          className="flex flex-1 flex-col items-center justify-center gap-lg"
        >
          <Lilita mood="flirty" size={112} />
          <div className="text-balance text-center">
            <h1 className="font-display text-lg font-bold leading-[1.2] tracking-[-0.02em]">
              ¿Hay alguien a quien avisar cuando te pongas en modo monstruo?
            </h1>
            <p className="mt-2 text-sm text-muted">
              Tu pareja, si tienes. Solo el nombre, para que yo sepa a quién echarle la culpa.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <input
              value={partner}
              onChange={(e) => {
                setPartner(e.target.value.slice(0, 40));
                setSinPareja(null);
              }}
              placeholder="Su nombre"
              aria-label="Nombre de tu pareja"
              className="w-full rounded-2xl px-4 py-3.5 text-center font-display text-lg outline-none"
              style={{
                background: "var(--surface)",
                boxShadow: partner.trim() && !sinPareja ? "inset 0 0 0 2px var(--accent), 2px 2px 0 0 var(--depth-shadow)" : "var(--depth-sm)",
              }}
            />
            <Opcion suave activa={sinPareja === "no"} onClick={() => setSinPareja("no")}>
              No tengo pareja
            </Opcion>
            <Opcion suave activa={sinPareja === "secreto"} onClick={() => setSinPareja("secreto")}>
              Prefiero no decirlo
            </Opcion>
          </div>
          <p className="text-center text-xs text-faint">
            Luego puedes invitarle para que le lleguen los avisos. O cambiarlo, que la gente cambia.
          </p>
        </motion.div>
      )}

      {paso === "ultima" && (
        <motion.div
          key="ultima"
          custom={dir}
          variants={STEP_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
          className="flex flex-1 flex-col items-center justify-center gap-lg"
        >
          <Lilita mood="neutral" size={116} />
          <div className="text-balance text-center">
            <h1 className="font-display text-lg font-bold leading-[1.2] tracking-[-0.02em]">
              ¿Cuándo te bajó la última vez?
            </h1>
            <p className="mt-2 text-sm text-muted">
              Así me hago una idea de dónde vas. Si no te acuerdas, no pasa
              nada.
            </p>
          </div>

          <ul className="flex w-full flex-col gap-2">
            {RELATIVOS.map((label, i) => {
              const date = addDays(base, -i);
              const key = toKey(date);
              const active = lastPeriod === key;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => {
                      haptic(10);
                      setLastPeriod(key);
                    }}
                    className="flex min-h-[52px] w-full items-center justify-between rounded-2xl px-4 text-left transition-[transform,box-shadow] duration-150 active:scale-[0.98] active:translate-x-[1px] active:translate-y-[1px]"
                    style={
                      active
                        ? {
                            background: "var(--accent)",
                            color: "var(--on-accent)",
                            boxShadow: "3px 3px 0 0 var(--depth-shadow)",
                          }
                        : { background: "var(--surface)", boxShadow: "var(--depth-sm)" }
                    }
                  >
                    <span className="font-display text-base font-bold">
                      {label}
                    </span>
                    <span className="text-sm" style={{ opacity: active ? 0.85 : 0.6 }}>
                      {capitalize(format(date, "EEEE d", { locale: es }))}
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => {
                  haptic(8);
                  setLastPeriod("unsure");
                }}
                className="flex min-h-[48px] w-full items-center justify-center rounded-2xl px-4 text-sm transition-[transform,box-shadow] duration-150 active:scale-[0.98]"
                style={
                  lastPeriod === "unsure"
                    ? { background: "var(--accent-soft)", color: "var(--accent)", boxShadow: "var(--depth-sm)" }
                    : { background: "var(--surface)", boxShadow: "var(--depth-sm)", color: "var(--fg-muted)" }
                }
              >
                No me acuerdo bien
              </button>
            </li>
          </ul>
        </motion.div>
      )}

      {paso === "duracion" && (
        <motion.div
          key="duracion"
          custom={dir}
          variants={STEP_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: DURATION.standard, ease: EASE_OUT_QUART }}
          className="flex flex-1 flex-col items-center justify-center gap-lg"
        >
          <Lilita mood="cuidando" size={116} />
          <div className="text-balance text-center">
            <h1 className="font-display text-lg font-bold leading-[1.2] tracking-[-0.02em]">
              ¿Cada cuánto te suele venir?
            </h1>
            <p className="mt-2 text-sm text-muted">
              Un cálculo aproximado. Lo voy afinando sola con lo que
              registres.
            </p>
          </div>

          <div className="grid w-full grid-cols-3 gap-2">
            {DURACIONES.map((d) => {
              const active = avgLength === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    haptic(10);
                    setAvgLength(d);
                  }}
                  className="flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-2xl transition-[transform,box-shadow] duration-150 active:scale-[0.96] active:translate-x-[1px] active:translate-y-[1px]"
                  style={
                    active
                      ? {
                          background: "var(--accent)",
                          color: "var(--on-accent)",
                          boxShadow: "3px 3px 0 0 var(--depth-shadow)",
                        }
                      : { background: "var(--surface)", boxShadow: "var(--depth-sm)" }
                  }
                >
                  <span className="tnum font-display text-xl font-bold">{d}</span>
                  <span className="text-2xs" style={{ opacity: active ? 0.85 : 0.6 }}>
                    días
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-faint">
            No hace falta saberlo seguro: 28 es razonable si no tienes ni idea.
          </p>
        </motion.div>
      )}
      </AnimatePresence>

      <div className="flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => {
              haptic(6);
              goBack();
            }}
            className="min-h-[52px] flex-1 rounded-full text-base font-bold"
            style={{ color: "var(--fg-muted)" }}
          >
            Atrás
          </button>
        )}
        <button
          type="button"
          disabled={saving || bloqueado}
          onClick={() => {
            if (!ultimo) {
              haptic(10);
              goNext();
            } else {
              void finish();
            }
          }}
          className="min-h-[52px] flex-[2] rounded-full font-display text-base font-bold tracking-[-0.01em] transition-[transform,box-shadow] duration-150 ease-[var(--ease-out-quart)] active:scale-[0.975] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-40"
          style={{
            background: "var(--accent)",
            color: "var(--on-accent)",
            boxShadow: "3px 3px 0 0 var(--depth-shadow)",
          }}
        >
          {ultimo ? "Empezar" : "Seguir"}
        </button>
      </div>
    </div>
  );
}

function Opcion({
  activa,
  suave,
  onClick,
  children,
}: {
  activa: boolean;
  suave?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic(10);
        onClick();
      }}
      className={`flex w-full items-center justify-center rounded-2xl px-4 transition-[transform,box-shadow] duration-150 active:scale-[0.98] ${suave ? "min-h-[48px] text-sm" : "min-h-[54px] font-display text-base font-bold"}`}
      style={
        activa
          ? suave
            ? { background: "var(--accent-soft)", color: "var(--accent)", boxShadow: "var(--depth-sm)" }
            : { background: "var(--accent)", color: "var(--on-accent)", boxShadow: "3px 3px 0 0 var(--depth-shadow)" }
          : { background: "var(--surface)", boxShadow: "var(--depth-sm)", color: suave ? "var(--fg-muted)" : undefined }
      }
    >
      {children}
    </button>
  );
}

const ALTO = 48;

/** Rueda de años como la del sistema: se arrastra y se queda en uno. */
function RuedaAños({ value, onChange }: { value: number; onChange: (a: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const actual = AÑOS.indexOf(value);

  // Al entrar, el año elegido en el centro.
  useEffect(() => {
    ref.current?.scrollTo({ top: AÑOS.indexOf(value) * ALTO });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-[240px] w-full overflow-hidden rounded-2xl" style={{ background: "var(--surface)", boxShadow: "var(--depth-sm)" }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-xl"
        style={{ height: ALTO, background: "var(--accent-soft)", boxShadow: "inset 0 0 0 2px var(--accent)" }}
      />
      <div
        ref={ref}
        role="listbox"
        aria-label="Año de nacimiento"
        tabIndex={0}
        onScroll={(e) => {
          const i = Math.round(e.currentTarget.scrollTop / ALTO);
          const a = AÑOS[Math.max(0, Math.min(AÑOS.length - 1, i))];
          if (a !== value) {
            haptic(4);
            onChange(a);
          }
        }}
        onKeyDown={(e) => {
          const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          ref.current?.scrollTo({ top: (actual + d) * ALTO, behavior: "smooth" });
        }}
        className="relative h-full snap-y snap-mandatory overflow-y-auto [scrollbar-width:none]"
        style={{ paddingBlock: 120 - ALTO / 2 }}
      >
        {AÑOS.map((a, i) => {
          const lejos = Math.abs(i - actual);
          return (
            <button
              key={a}
              type="button"
              role="option"
              aria-selected={a === value}
              onClick={() => ref.current?.scrollTo({ top: i * ALTO, behavior: "smooth" })}
              className="tnum flex w-full snap-center items-center justify-center font-display font-bold transition-[font-size,opacity] duration-100"
              style={{
                height: ALTO,
                fontSize: lejos === 0 ? 26 : 19,
                opacity: lejos === 0 ? 1 : Math.max(0.15, 0.4 - lejos * 0.08),
                color: lejos === 0 ? "var(--accent)" : undefined,
              }}
            >
              {a}
            </button>
          );
        })}
      </div>
    </div>
  );
}
