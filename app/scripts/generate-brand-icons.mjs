/**
 * Gera favicon/PWA a partir de public/favicon-source.png (512×512 recomendado).
 * Atualize landing-logo.png e favicon-source.png juntos, depois: node scripts/generate-brand-icons.mjs
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = resolve(root, "public");
const source = resolve(publicDir, "favicon-source.png");

if (!existsSync(source)) {
  console.error("Arquivo não encontrado:", source);
  process.exit(1);
}

const outputs = [
  { file: "icon-512.png", size: 512 },
  { file: "icon-192.png", size: 192 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "favicon-48.png", size: 48 },
  { file: "favicon-32.png", size: 32 },
  { file: "favicon-16.png", size: 16 },
];

for (const { file, size } of outputs) {
  await sharp(source).resize(size, size, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(resolve(publicDir, file));
  console.log("OK", file, size);
}

await sharp(source).resize(32, 32, { fit: "cover" }).png().toFile(resolve(publicDir, "favicon.ico"));
console.log("OK favicon.ico (32px PNG)");
