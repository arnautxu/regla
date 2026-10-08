// USD micro-units, independent of retail EUR pricing. Conservative published
// non-promotional rates; changing model requires an explicitly priced entry.
export const CHAT_MODEL = "gemini-3.5-flash-lite";
export const MAX_INPUT_BYTES = 16_000;
export const MAX_OUTPUT_TOKENS = 320;
export const INPUT_MICRO_USD_PER_TOKEN = 0.3;
export const OUTPUT_MICRO_USD_PER_TOKEN = 2.5;
export const CHAT_RESERVE_MICRO_USD = 6_000;
export const VOICE_SECONDS_PER_CALL = 120;
export const VOICE_RESERVE_MICRO_USD = 300_000;

export function textCost(input: number, output: number) {
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) throw new Error("Invalid usage");
  return Math.ceil(input * INPUT_MICRO_USD_PER_TOKEN + output * OUTPUT_MICRO_USD_PER_TOKEN);
}
