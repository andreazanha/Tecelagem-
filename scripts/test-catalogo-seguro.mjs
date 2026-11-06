// Teste das funções PURAS do catálogo seguro (filtro de região, região comercial, autorização).
// Bundla o módulo TS com esbuild (tira os tipos) e roda asserts. Uso:
//   node scripts/test-catalogo-seguro.mjs
// (as funções de token precisam do D1 e são testadas na URL de teste, não aqui.)
import { build } from "esbuild";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const out = join(tmpdir(), "cs-bundle-" + Date.now() + ".mjs");
await build({
  entryPoints: ["src/catalogo-seguro.ts"],
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: out,
  logLevel: "silent",
});
const cs = await import(pathToFileURL(out).href);

let falhas = 0;
const eq = (nome, a, b) => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A === B) { console.log("  ✓ " + nome); return; }
  falhas++; console.log("  ✗ " + nome + "\n     esperado: " + B + "\n     recebido: " + A);
};
const ok = (nome, v) => eq(nome, !!v, true);

console.log("regiaoDeUF:");
eq("SP → sul", cs.regiaoDeUF("SP"), "sul");
eq("BA → norte", cs.regiaoDeUF("BA"), "norte");
eq("MG → sul", cs.regiaoDeUF("MG"), "sul");
eq("CE → norte", cs.regiaoDeUF("CE"), "norte");

console.log("regiaoComercial (tabela atribuída prioritária + divergência):");
eq("loja_regiao norte, UF SP → DIVERGÊNCIA", cs.regiaoComercial({ id: "1", loja_regiao: "norte", uf: "SP" }).tipo, "divergencia");
eq("loja_regiao sul, UF SP → sul", cs.regiaoComercial({ id: "1", loja_regiao: "sul", uf: "SP" }), { tipo: "ok", regiao: "sul" });
eq("sem loja_regiao, UF BA → norte", cs.regiaoComercial({ id: "1", uf: "BA" }), { tipo: "ok", regiao: "norte" });
eq("loja_regiao norte, sem UF → norte (atribuída manda)", cs.regiaoComercial({ id: "1", loja_regiao: "norte" }), { tipo: "ok", regiao: "norte" });
eq("sem nada → indefinida", cs.regiaoComercial({ id: "1" }).tipo, "indefinida");

console.log("autorizadoCatalogo:");
ok("codigo_erp preenchido → autorizado", cs.autorizadoCatalogo({ id: "1", codigo_erp: "123", bloqueado: 0 }));
ok("CNPJ válido, sem erp → autorizado", cs.autorizadoCatalogo({ id: "1", cnpj: "11.222.333/0001-81", bloqueado: 0 }));
eq("bloqueado → NÃO autorizado", cs.autorizadoCatalogo({ id: "1", codigo_erp: "123", bloqueado: 1 }), false);
eq("sem erp e CNPJ inválido → NÃO autorizado", cs.autorizadoCatalogo({ id: "1", cnpj: "000", bloqueado: 0 }), false);

console.log("filtrarRegiao (isolamento — o mais importante):");
const doc = {
  atualizado_em: 123,
  produtos: [
    { id: "p1", nome: "Manta", norte: 90, sul: 70, valor_norte: 90, valor_sul: 70, desconto_pct_norte: 5, desconto_pct_sul: 10,
      refil: { valor_norte: 30, valor_sul: 20 } },
  ],
  edicao_limitada: { produtos: [{ id: "e1", norte: 150, sul: 120 }] },
};
const sul = cs.filtrarRegiao(doc, "sul");
const norte = cs.filtrarRegiao(doc, "norte");
const sulStr = JSON.stringify(sul), norteStr = JSON.stringify(norte);

ok("SUL: mantém 'sul'", "sul" in sul.produtos[0]);
eq("SUL: remove 'norte'", "norte" in sul.produtos[0], false);
eq("SUL: nenhum campo _norte sobra", /_norte/i.test(sulStr), false);
ok("SUL: mantém valor_sul/desconto_pct_sul", sul.produtos[0].valor_sul === 70 && sul.produtos[0].desconto_pct_sul === 10);
ok("SUL: refil só com valor_sul", sul.produtos[0].refil.valor_sul === 20 && !("valor_norte" in sul.produtos[0].refil));
ok("SUL: edicao_limitada filtrada", sul.edicao_limitada.produtos[0].sul === 120 && !("norte" in sul.edicao_limitada.produtos[0]));
eq("NORTE: nenhum campo _sul sobra", /_sul\b/i.test(norteStr) || /"sul"/.test(norteStr), false);
ok("NORTE: mantém norte", norte.produtos[0].norte === 90 && norte.produtos[0].valor_norte === 90);
ok("preserva campos neutros (atualizado_em, nome)", sul.atualizado_em === 123 && sul.produtos[0].nome === "Manta");

console.log(falhas === 0 ? "\n✅ TODOS OS TESTES PASSARAM" : `\n❌ ${falhas} teste(s) falharam`);
process.exit(falhas === 0 ? 0 : 1);
