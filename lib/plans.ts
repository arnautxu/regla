export const PLANS = {
  free: { name: "Gratis", euros: 0, messages: 10, voiceSeconds: 0, description: "Tu diario y 10 respuestas de prueba, una sola vez." },
  plus: { name: "Plus", euros: 9.99, messages: 300, voiceSeconds: 0, description: "300 respuestas al mes para entender tus registros." },
  voice: { name: "Plus con voz", euros: 14.99, messages: 300, voiceSeconds: 1200, description: "300 respuestas y 10 llamadas de hasta 2 minutos al mes." },
} as const;
export type Plan = keyof typeof PLANS;
