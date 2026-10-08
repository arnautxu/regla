/**
 * El prompt de Lilita se escribió para Lídia y Arnau. Arnau solo es la
 * pareja de Lídia, en su instalación de siempre y si sigue siendo el
 * nombre que ella tiene puesto. Para todos los demás (y para Lídia si
 * lo cambia), la pareja es el nombre que se haya dado en Ajustes, o no
 * existe (no tiene, no lo dice o es menor): entonces Lilita no se mete
 * con nadie más que con el útero y el mundo.
 */
export function paraLaUsuaria(
  prompt: string,
  pareja: string | null | undefined,
  usuaria: string = "la usuaria",
) {
  const nombre = pareja?.trim() || null;
  if (usuaria === "Lídia" && nombre === "Arnau") return prompt;
  const conUsuaria =
    usuaria === "Lídia" ? prompt : prompt.replaceAll("Lídia", usuaria).replaceAll("Lidia", usuaria);
  return conUsuaria
    .replace(/\s+o contra Arnau \(su novio, que hizo esta app\)/g, nombre ? ` o contra ${nombre} (su pareja)` : "")
    .replace(/, el mundo o Arnau\./g, nombre ? `, el mundo o ${nombre}.` : " o el mundo.")
    .replaceAll("Arnau", nombre ?? "su pareja");
}

/** Lo que Lilita sabe de su pareja, dicho como un dato más. */
export function lineaPareja(pareja: string | null | undefined): string {
  const nombre = pareja?.trim() || null;
  return nombre
    ? `Su pareja se llama ${nombre}.`
    : "No sabes si tiene pareja ni cómo se llamaría: no te inventes ningún nombre.";
}
