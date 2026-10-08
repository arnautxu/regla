export const PLANS = {
  free: { name: "Gratis", euros: 0, messages: 0, voiceSeconds: 0, description: "Tu diario gratis. El plan gratuito no incluye respuestas de Lilita." },
  plus: { name: "Plus", euros: 6.99, messages: 300, voiceSeconds: 0, description: "300 respuestas al mes para entender tus registros." },
  voice: { name: "Plus con voz", euros: 12.99, messages: 300, voiceSeconds: 1200, description: "300 respuestas y 10 llamadas de hasta 2 minutos al mes." },
} as const;
export type Plan = keyof typeof PLANS;

/** Plus también se vende por años: el mismo derecho, otro periodo. */
export const PLUS_ANUAL_EUROS = 49.99;
export type Periodo = "mensual" | "anual";
