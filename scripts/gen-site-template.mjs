// Gera src/siteTemplate.ts a partir de site/catalogo-online.html (cópia do site
// real da Big Tricot, com a injeção de window.__PREVIEW_DATA__). O Worker usa
// esse HTML pra servir uma PRÉVIA do catálogo com os produtos do ERP, sem tocar
// no site que está no ar. Rode sempre que atualizar o site vendorizado (o deploy
// também roda isto).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(raiz, "site", "catalogo-online.html"), "utf8");

const out =
  "// GERADO por scripts/gen-site-template.mjs a partir de site/catalogo-online.html — NÃO edite à mão.\n" +
  `export const SITE_ONLINE_HTML = ${JSON.stringify(html)};\n`;

fs.writeFileSync(path.join(raiz, "src", "siteTemplate.ts"), out);
console.log(`siteTemplate.ts gerado — ${html.length} bytes`);
