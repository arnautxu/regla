import "server-only";

/**
 * El prompt de Lilita se escribió para Lídia y Arnau. Con cuentas, cada
 * persona es «la usuaria» y su pareja tiene el nombre que ella haya
 * dado, o no existe (no tiene, no lo dice o es menor): entonces Lilita
 * no se mete con nadie más que con el útero y el mundo.
 */
export function paraLaUsuaria(prompt: string, pareja: string | null | undefined) {
  const nombre = pareja?.trim() || null;
  return prompt
    .replace(/\s+o contra Arnau \(su novio, que hizo esta app\)/g, nombre ? ` o contra ${nombre} (su pareja)` : "")
    .replace(/, el mundo o Arnau\./g, nombre ? `, el mundo o ${nombre}.` : " o el mundo.")
    .replaceAll("Lídia", "la usuaria").replaceAll("Lidia", "la usuaria")
    .replaceAll("Arnau", nombre ?? "su pareja");
}
