// Gera src/bridgeScript.ts a partir de bridge/sync.js.
// O Worker serve esse conteúdo em GET /api/integracao/bridge-sync, e a ponte
// (sync.js) baixa de lá pra se atualizar sozinha. Rode sempre que mudar o
// bridge/sync.js (o deploy também roda isto automaticamente).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(raiz, "bridge", "sync.js"), "utf8");
const m = src.match(/PONTE_VERSAO\s*=\s*["']([^"']+)["']/);
const versao = m ? m[1] : "0";

const out =
  "// GERADO por scripts/gen-bridge-script.mjs a partir de bridge/sync.js — NÃO edite à mão.\n" +
  `export const SYNC_VERSAO = ${JSON.stringify(versao)};\n` +
  `export const SYNC_JS = ${JSON.stringify(src)};\n`;

fs.writeFileSync(path.join(raiz, "src", "bridgeScript.ts"), out);
console.log(`bridgeScript.ts gerado — versão ${versao}, ${src.length} bytes`);
