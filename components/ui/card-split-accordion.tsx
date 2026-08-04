"use client";

import { useState, type FC, type ReactNode } from "react";
import { motion, MotionConfig, type Transition } from "motion/react";
import { ChevronDown } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════
   Card split accordion — origen: registry.watermelon.sh
   (r/card-split-accordion). Adaptado, no copiado tal cual:

   · El original importaba react-icons y react-use-measure sin
     declararlos en el manifiesto. Fuera los dos: los iconos entran
     por props y la altura ya no se mide a mano.
   · Animaba `height` directamente. Ahora usa grid-template-rows
     0fr→1fr, que no dispara recálculo de layout en cada frame.
   · Traía colores zinc y hex fijos con la variante `dark:`. Aquí el
     tema lo manda [data-theme] en <html>, así que `dark:` no habría
     hecho nada: retokenizado a las variables de Lilaila.

   Lo que sí se conserva, que es lo que vale del componente: al abrir
   uno, la tarjeta se separa de la pila y sus vecinas redondean las
   esquinas hacia ella.
   ═══════════════════════════════════════════════════════════════ */

export interface AccordionItemData {
  id: string;
  title: string;
  /** Texto secundario a la derecha del título */
  meta?: string;
  icon?: ReactNode;
  content: ReactNode;
}

/* Muelle muy amortiguado: llega y para. Sin rebote, que envejece mal. */
const spring: Transition = {
  type: "spring",
  stiffness: 600,
  damping: 50,
  mass: 1,
};

const R = 20;

const AccordionItem: FC<{
  item: AccordionItemData;
  index: number;
  total: number;
  openIndex: number;
  onToggle: (id: string | null) => void;
}> = ({ item, index, total, openIndex, onToggle }) => {
  const isOpen = index === openIndex;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const isBeforeOpen = index === openIndex - 1;
  const isAfterOpen = index === openIndex + 1;
  const isAlone = (isAfterOpen && isLast) || (isBeforeOpen && isFirst);

  // Los bordes interiores se ocultan para que la pila se lea como un
  // bloque; solo reaparecen donde hay una junta real.
  const topWidth = isFirst || isAfterOpen || isOpen ? "1px" : "0px";
  const bottomWidth = isLast || isBeforeOpen || isOpen ? "1px" : "0px";

  let tl = 0,
    tr = 0,
    bl = 0,
    br = 0;
  if (isOpen || isAlone) [tl, tr, bl, br] = [R, R, R, R];
  else if (isBeforeOpen) [bl, br] = [R, R];
  else if (isAfterOpen) [tl, tr] = [R, R];
  else if (isFirst) [tl, tr] = [R, R];
  else if (isLast) [bl, br] = [R, R];

  const panelId = `acc-panel-${item.id}`;

  return (
    <motion.li layout>
      <motion.div
        animate={{
          borderTopLeftRadius: tl,
          borderTopRightRadius: tr,
          borderBottomLeftRadius: bl,
          borderBottomRightRadius: br,
          marginBlock: isOpen ? 10 : 0,
        }}
        className="overflow-hidden will-change-transform"
        style={{
          borderStyle: "solid",
          borderColor: "var(--border)",
          borderTopWidth: topWidth,
          borderBottomWidth: bottomWidth,
          borderLeftWidth: "1px",
          borderRightWidth: "1px",
          background: isOpen ? "var(--accent-soft)" : "var(--surface)",
        }}
      >
        <button
          type="button"
          onClick={() => onToggle(isOpen ? null : item.id)}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="flex min-h-[56px] w-full items-center justify-between gap-md px-4 py-3 text-left"
        >
          <span className="flex min-w-0 items-center gap-3">
            {item.icon && (
              <span
                aria-hidden="true"
                className="shrink-0"
                style={{ color: "var(--accent)" }}
              >
                {item.icon}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold">
                {item.title}
              </span>
              {item.meta && (
                <span className="block truncate text-xs text-faint">
                  {item.meta}
                </span>
              )}
            </span>
          </span>

          <motion.span
            animate={{ rotate: isOpen ? 180 : 0 }}
            className="shrink-0"
            style={{ color: "var(--fg-faint)" }}
          >
            <ChevronDown className="size-5" />
          </motion.span>
        </button>

        {/* grid-template-rows 0fr→1fr: abre a la altura real del
            contenido sin medirlo ni animar `height`. */}
        <motion.div
          id={panelId}
          role="region"
          initial={false}
          animate={{ gridTemplateRows: isOpen ? "1fr" : "0fr", opacity: isOpen ? 1 : 0 }}
          className="grid"
        >
          <div className="overflow-hidden">
            <div className="px-4 pb-4 text-sm leading-relaxed text-muted">
              {item.content}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </motion.li>
  );
};

export const CardSplitAccordion: FC<{
  items: AccordionItemData[];
  className?: string;
}> = ({ items, className }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const openIndex = items.findIndex((i) => i.id === openId);

  return (
    <MotionConfig transition={spring} reducedMotion="user">
      <ul className={className}>
        {items.map((item, index) => (
          <AccordionItem
            key={item.id}
            item={item}
            index={index}
            total={items.length}
            openIndex={openIndex}
            onToggle={setOpenId}
          />
        ))}
      </ul>
    </MotionConfig>
  );
};
