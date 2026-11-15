// Gera web/src/version.ts a CADA build, com um número que muda sozinho a cada deploy.
// Fonte: contagem de commits do git (sobe +1 a cada publicação) + hash + data do commit.
// Objetivo: o cabeçalho do sistema confirma que a versão NOVA carregou. Se o número não
// mudar depois de atualizar a página, é cache do navegador — não falha de publicação.
// (Roda no deploy, igual a gen-bridge-script.mjs e gen-site-template.mjs.)
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (cmd, fb) => {
  try {
    return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return fb;
  }
};

const count = git("git rev-list --count HEAD", "");
const sha = git("git rev-parse --short HEAD", "dev");
const data = git('git show -s --format=%cd --date=format:%Y-%m-%d HEAD', new Date().toISOString().slice(0, 10));
// Número da versão: contagem de commits. Fallback (sem git) muda com o tempo, pra nunca
// ficar preso num valor fixo como aconteceu antes.
const num = count || String(Math.floor(Date.now() / 60000) % 100000);
const VERSION = `v3.${num}.0`;

const out = `// GERADO por scripts/gen-version.mjs no build — NÃO edite à mão.
// O número sobe sozinho a cada deploy (contagem de commits do git). Se ele NÃO mudar
// depois de você atualizar a página, é cache do navegador (não é falha de publicação).
export const VERSION = ${JSON.stringify(VERSION)};
export const VERSION_SHA = ${JSON.stringify(sha)};
export const VERSION_DATA = ${JSON.stringify(data)};
`;

writeFileSync(join(root, "web/src/version.ts"), out);
console.log("version.ts →", VERSION, sha, data);
