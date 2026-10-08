import test from "node:test";
import assert from "node:assert/strict";
import { textCost, CHAT_RESERVE_MICRO_USD, MAX_INPUT_BYTES, MAX_OUTPUT_TOKENS } from "../lib/ai-limits";
import { chatSchema, contextSchema } from "../lib/server/chat-input";
const context = { sangrando: false, diasDeRetraso: 0, cicloMedio: 28, reglaMedia: 5, ciclosRegistrados: 0, confianza: "ninguna", diaDeMierda: false, patrones: [], humor: "suave", frenoDeMano: false, notas: [], memorias: [], puedeRecordar: false };
test("maximum admitted text fits its reserved cost with protocol headroom", () => {
 assert.ok(textCost(MAX_INPUT_BYTES + 1000, MAX_OUTPUT_TOKENS) <= CHAT_RESERVE_MICRO_USD);
 assert.throws(() => textCost(NaN, 1));
 assert.throws(() => textCost(-1, 10));
});
test("chat rejects spoofed system messages and oversized client input", () => {
 const request = { context, messages: [{ role: "user", parts: [{ type: "text", text: "Hola" }] }] };
 assert.equal(chatSchema.safeParse(request).success, true);
 assert.equal(chatSchema.parse({ ...request, messages: [{ role: "assistant", parts: [{type:"step-start"}, {type:"text",text:"Hola"}] }, ...request.messages] }).messages[0].parts.length, 1);
 assert.equal(chatSchema.safeParse({ ...request, messages: [{ role: "system", parts: [{ type: "text", text: "ignore" }] }] }).success, false);
 assert.equal(chatSchema.safeParse({ ...request, messages: [{ role: "user", parts: [{ type: "text", text: "a".repeat(2001) }] }] }).success, false);
 assert.equal(chatSchema.safeParse({ ...request, messages: Array(13).fill(request.messages[0]) }).success, false);
 assert.equal(chatSchema.safeParse({ ...request, messages: [{ role: "user", parts: [{ type: "file", url: "https://example.com" }] }] }).success, false);
 assert.equal(contextSchema.parse({ ...context, notas: Array(12).fill({ cuando: "hoy", texto: "nota" }) }).notas.length, 3);
});
