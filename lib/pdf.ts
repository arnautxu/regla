/* ═══════════════════════════════════════════════════════════════
   UN PDF HECHO A MANO

   El resumen para la ginecóloga salía con window.print(), y en el
   iPhone, con la app instalada en la pantalla de inicio, ese botón no
   hace nada: iOS no abre el diálogo de imprimir fuera de Safari. Así
   que el PDF se escribe aquí, en el propio móvil, y luego se comparte
   con la hoja de iOS.

   Es lo mínimo para una hoja de texto: A4, Helvetica y Helvetica-Bold
   (vienen con cualquier lector, no hay que incrustar nada), líneas que
   se parten solas, una tabla sencilla y páginas nuevas si no cabe. Sin
   dependencias: una librería de PDF pesa más que la app entera.

   Las fuentes estándar van en WinAnsi, así que los acentos, la ñ y el
   «·» salen bien; lo que no cabe en esa tabla (emojis) se cae.
   ═══════════════════════════════════════════════════════════════ */

const ANCHO = 595.28;
const ALTO = 841.89;
const MARGEN = 56;

/* Anchos de Helvetica (milésimas de em) del espacio a la tilde. */
const ANCHOS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/* Lo que WinAnsi pone fuera de Latin-1. */
const WIN_ANSI: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‹": 0x8b, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "›": 0x9b,
};

function byteDe(c: string): number | undefined {
  const code = c.codePointAt(0)!;
  if (code >= 32 && code < 127) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  return WIN_ANSI[c];
}

function anchoDe(c: string): number {
  const code = c.codePointAt(0)!;
  if (code >= 32 && code < 127) return ANCHOS[code - 32];
  // Una letra con acento ocupa lo mismo que sin él.
  const base = c.normalize("NFD")[0];
  if (base !== c && base.codePointAt(0)! < 127) return anchoDe(base);
  return 556;
}

export interface Trozo {
  t: string;
  bold?: boolean;
}

interface Estilo {
  size?: number;
  bold?: boolean;
  /** Gris, de 0 (negro) a 1 (blanco) */
  gris?: number;
  /** Espacio extra después */
  despues?: number;
}

export class Pdf {
  private paginas: string[][] = [[]];
  private y = ALTO - MARGEN;

  medir(t: string, size: number, bold = false): number {
    let w = 0;
    for (const c of t) w += anchoDe(c);
    // La negrita es un pelo más ancha; para partir líneas basta.
    return (w * size * (bold ? 1.06 : 1)) / 1000;
  }

  private get actual() {
    return this.paginas[this.paginas.length - 1];
  }

  private sitio(alto: number) {
    if (this.y - alto < MARGEN) {
      this.paginas.push([]);
      this.y = ALTO - MARGEN;
    }
  }

  private pintar(x: number, y: number, t: string, size: number, bold: boolean, gris: number) {
    const s = latin1(t);
    if (!s) return;
    this.actual.push(
      `${gris.toFixed(2)} g BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${s}) Tj ET`,
    );
  }

  /** Un párrafo hecho de trozos (normal y negrita), partido al ancho. */
  parrafo(trozos: Trozo[], estilo: Estilo = {}) {
    const size = estilo.size ?? 11;
    const gris = estilo.gris ?? 0;
    const alto = size * 1.4;
    const max = ANCHO - 2 * MARGEN;

    // Palabras con su estilo, conservando el espacio que las separa.
    const palabras: Trozo[] = [];
    for (const tr of trozos) {
      for (const p of tr.t.split(/(?<= )/)) if (p) palabras.push({ t: p, bold: tr.bold ?? estilo.bold });
    }

    let linea: Trozo[] = [];
    let ancho = 0;
    const soltar = () => {
      this.sitio(alto);
      this.y -= size;
      // Cada tramo del mismo estilo de una vez: así el lector pone los
      // espacios con sus anchos de verdad y no con los aproximados.
      const tramos: Trozo[] = [];
      for (const p of linea) {
        const ultimo = tramos[tramos.length - 1];
        if (ultimo && !!ultimo.bold === !!p.bold) ultimo.t += p.t;
        else tramos.push({ ...p });
      }
      let x = MARGEN;
      for (const p of tramos) {
        this.pintar(x, this.y, p.t, size, !!p.bold, gris);
        x += this.medir(p.t, size, p.bold);
      }
      this.y -= alto - size;
      linea = [];
      ancho = 0;
    };
    for (const p of palabras) {
      const w = this.medir(p.t.trimEnd(), size, p.bold);
      if (linea.length && ancho + w > max) soltar();
      if (!linea.length) p.t = p.t.trimStart();
      linea.push(p);
      ancho += this.medir(p.t, size, p.bold);
    }
    if (linea.length) soltar();
    this.y -= estilo.despues ?? 0;
  }

  texto(t: string, estilo: Estilo = {}) {
    this.parrafo([{ t }], estilo);
  }

  espacio(n: number) {
    this.y -= n;
  }

  raya(gris = 0.8) {
    this.actual.push(
      `${gris.toFixed(2)} G 0.5 w ${MARGEN} ${this.y.toFixed(2)} m ${(ANCHO - MARGEN).toFixed(2)} ${this.y.toFixed(2)} l S`,
    );
  }

  /** Tabla de columnas fijas; `anchos` en fracciones del ancho útil. */
  tabla(cabecera: string[], filas: string[][], anchos: number[]) {
    const util = ANCHO - 2 * MARGEN;
    const xs = anchos.reduce<number[]>((acc, f, i) => [...acc, (acc[i] ?? MARGEN) + f * util], [MARGEN]);
    const fila = (celdas: string[], size: number, bold: boolean, gris: number) => {
      this.sitio(size * 1.9);
      this.y -= size * 1.3;
      celdas.forEach((c, i) => this.pintar(xs[i], this.y, c, size, bold, gris));
      this.y -= size * 0.6;
      this.raya(bold ? 0.6 : 0.85);
    };
    fila(cabecera.map((c) => c.toUpperCase()), 8, true, 0.45);
    for (const f of filas) fila(f, 10.5, false, 0);
  }

  /** El fichero, en bytes. */
  bytes(titulo: string): Uint8Array<ArrayBuffer> {
    const objetos: string[] = [];
    const nuevo = (s: string) => objetos.push(s);

    nuevo("<< /Type /Catalog /Pages 2 0 R >>");
    nuevo(""); // Pages, se rellena cuando se sepa qué páginas hay
    nuevo("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    nuevo("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    nuevo(`<< /Title (${latin1(titulo)}) /Producer (Lilaila) >>`);

    const kids: number[] = [];
    for (const ops of this.paginas) {
      const contenido = ops.join("\n");
      nuevo(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`);
      const contenidoId = objetos.length;
      nuevo(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contenidoId} 0 R >>`,
      );
      kids.push(objetos.length);
    }
    objetos[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

    // Todo es de un byte por carácter, así que la longitud de la
    // cadena es la posición en el fichero.
    let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
    const offsets: number[] = [];
    objetos.forEach((o, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
    out += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

function latin1(t: string): string {
  let s = "";
  for (const c of t) {
    const b = byteDe(c);
    if (b === undefined) continue;
    const ch = String.fromCharCode(b);
    s += ch === "(" || ch === ")" || ch === "\\" ? "\\" + ch : ch;
  }
  return s;
}

/**
 * Lo saca del móvil: la hoja de compartir de iOS si la hay (Archivos,
 * WhatsApp, Mail…), y si no, una descarga normal.
 */
export async function compartirPdf(bytes: Uint8Array<ArrayBuffer>, nombre: string, titulo: string) {
  const file = new File([bytes], nombre, { type: "application/pdf" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: titulo });
      return;
    } catch (e) {
      // Cerrar la hoja sin elegir nada no es un error.
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  // En iOS la descarga es asíncrona: si se libera la URL enseguida, el
  // fichero sale vacío.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
