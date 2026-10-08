import { test } from "node:test";
import assert from "node:assert/strict";
import { chatInstructions } from "../lib/server/lilita-prompt";
import type { LilitaContext } from "../lib/ai-context";

const base: LilitaContext = {
  sangrando: false, diasDeRetraso: 0, cicloMedio: 28, reglaMedia: 5, ciclosRegistrados: 3,
  confianza: "media" as LilitaContext["confianza"], diaDeMierda: false, patrones: [], humor: "normal" as LilitaContext["humor"],
  frenoDeMano: false, notas: [], memorias: [], puedeRecordar: false,
};

test("Lilita sabe cómo se llama la pareja que se ha puesto", () => {
  const p = chatInstructions({ ...base, pareja: "Willy" });
  assert.match(p, /Su pareja se llama Willy\./);
  assert.match(p, /contra Willy \(su pareja\)/);
  assert.doesNotMatch(p, /Arnau/);
});

test("sin pareja no sale ningún nombre", () => {
  const p = chatInstructions({ ...base, pareja: null });
  assert.doesNotMatch(p, /Arnau/);
  assert.match(p, /no te inventes ningún nombre/);
});

test("Arnau solo como pareja de Lídia", () => {
  const p = chatInstructions({ ...base, pareja: "Arnau" });
  assert.match(p, /Su pareja se llama Arnau\./);
  assert.match(p, /Lídia/);
});
