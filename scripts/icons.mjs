/**
 * Genera los PNG de icono a partir de public/icon.svg.
 *
 * iOS necesita PNG para el icono de pantalla de inicio: no acepta SVG
 * en apple-touch-icon. Se regenera con `npm run icons` cada vez que
 * cambie el dibujo de Lilita.
 */
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const BG = "#1a1012";

const svg = await readFile(join(pub, "icon.svg"));

async function render(size, out) {
  const png = await sharp(svg, { density: 400 })
    .resize(size, size)
    .png()
    .toBuffer();
  await writeFile(join(pub, out), png);
  console.log(`  ${out}  ${size}×${size}`);
}

/**
 * Maskable: Android recorta hasta un 20% por cada lado, así que el
 * dibujo se renderiza al 78% y se rellena con el fondo. Sin esto,
 * a Lilita le cortan las zapatillas.
 */
async function renderMaskable(size, out) {
  const inner = Math.round(size * 0.78);
  const pad = Math.round((size - inner) / 2);
  const png = await sharp(svg, { density: 400 })
    .resize(inner, inner)
    .extend({
      top: pad,
      bottom: size - inner - pad,
      left: pad,
      right: size - inner - pad,
      background: BG,
    })
    .png()
    .toBuffer();
  await writeFile(join(pub, out), png);
  console.log(`  ${out}  ${size}×${size} (maskable)`);
}

/* La App Store rechaza iconos con transparencia: se aplana sobre el
   fondo. Y la pantalla de arranque es el icono sobre su mismo fondo. */
async function renderIos() {
  const ios = join(root, "ios", "App", "App", "Assets.xcassets");
  const icon = await sharp(svg, { density: 800 })
    .resize(1024, 1024)
    .flatten({ background: BG })
    .png()
    .toBuffer();
  await writeFile(join(ios, "AppIcon.appiconset", "AppIcon-512@2x.png"), icon);
  const lilita = await sharp(svg, { density: 800 }).resize(640, 640).png().toBuffer();
  const splash = await sharp({
    create: { width: 2732, height: 2732, channels: 3, background: BG },
  })
    .composite([{ input: lilita, gravity: "center" }])
    .png()
    .toBuffer();
  for (const f of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
    await writeFile(join(ios, "Splash.imageset", f), splash);
  }
  console.log("  iOS: AppIcon 1024×1024 y splash 2732×2732");
}

console.log("Generando iconos…");
await render(192, "icon-192.png");
await render(512, "icon-512.png");
await render(180, "apple-touch-icon.png");
await renderMaskable(512, "icon-maskable-512.png");
await renderIos();
console.log("Listo.");
