// Gera src/siteTemplate.ts (catálogo online simples) e src/siteTemplateFull.ts
// (index.html completo, layout "Montar pedido") a partir das cópias em site/.
// O Worker usa esses HTMLs pra servir as PRÉVIAS do catálogo com os dados do ERP,
// sem tocar no site que está no ar. Roda sempre que atualizar os arquivos em site/
// (o deploy também roda isto).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function gerar(arquivoHtml, arquivoTs, nomeConst) {
  const html = fs.readFileSync(path.join(raiz, "site", arquivoHtml), "utf8");
  const out =
    `// GERADO por scripts/gen-site-template.mjs a partir de site/${arquivoHtml} — NÃO edite à mão.\n` +
    `export const ${nomeConst} = ${JSON.stringify(html)};\n`;
  fs.writeFileSync(path.join(raiz, "src", arquivoTs), out);
  console.log(`${arquivoTs} gerado — ${html.length} bytes`);
}

gerar("catalogo-online.html", "siteTemplate.ts", "SITE_ONLINE_HTML");
gerar("catalogo-full.html", "siteTemplateFull.ts", "SITE_FULL_HTML");
gerar("loja.html", "siteLoja.ts", "SITE_LOJA_HTML");
