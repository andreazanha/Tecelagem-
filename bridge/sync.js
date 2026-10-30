// ─────────────────────────────────────────────────────────────────────────────
// PONTE Syntech (Firebird) → Tecelagem
// Lê os pedidos APROVADOS (STATUS = 10) no ERP e envia pro sistema (porta de
// entrada POST /api/integracao/pedido). Só puxa o que mudou desde a última vez
// (campo PEDIDO.DATA_ALT_REG), então não reprocessa tudo.
//
// Roda no PC da fábrica (que fica ligado). Veja o README.md pra instalar.
// As credenciais ficam SÓ neste PC, no arquivo config.json (nunca no repositório).
// ─────────────────────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const Firebird = require("node-firebird");

// ── Correção de acentos (ç, ã, é, ô…) ────────────────────────────────────────
// A lib node-firebird decodifica TODO texto como UTF-8 (valor fixo no código dela;
// a opção "encoding" é ignorada na leitura). Mas o banco da Big Tricot guarda em
// WIN1252/latin1 — lido como UTF-8 vira "AC�CIA", "BEG�NIA". Aqui trocamos a
// decodificação para latin1 (igual ao WIN1252 nos acentos do português), sem
// precisar instalar nada nem mexer no config.json.
function carregarSerialize() {
  // 1) caminhos conhecidos (funciona na maioria das instalações)
  for (const t of ["node-firebird/lib/serialize", "node-firebird/serialize"]) {
    try { const m = require(t); if (m && m.XdrReader) return m; } catch { /* tenta o próximo */ }
  }
  // 2) à prova de bala: varre a pasta do pacote node-firebird atrás do arquivo
  //    que exporta o XdrReader, não importa o nome/subpasta/versão.
  try {
    let raiz = path.dirname(require.resolve("node-firebird")); // .../node-firebird/lib
    for (let i = 0; i < 4 && !fs.existsSync(path.join(raiz, "package.json")); i++) raiz = path.dirname(raiz);
    const pilha = [raiz]; const vistos = new Set();
    while (pilha.length) {
      const d = pilha.pop(); if (vistos.has(d)) continue; vistos.add(d);
      let itens = []; try { itens = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const it of itens) {
        const full = path.join(d, it.name);
        if (it.isDirectory()) { if (it.name !== "node_modules") pilha.push(full); continue; }
        if (!it.isFile() || !it.name.endsWith(".js")) continue;
        let src = ""; try { src = fs.readFileSync(full, "utf8"); } catch { continue; }
        if (src.indexOf("XdrReader") === -1 || src.indexOf("readText") === -1) continue;
        try { const m = require(full); if (m && m.XdrReader && m.XdrReader.prototype && m.XdrReader.prototype.readText) return m; } catch { /* tenta o próximo */ }
      }
    }
  } catch { /* ignora */ }
  return null;
}
try {
  const serialize = carregarSerialize();
  const XR = serialize && serialize.XdrReader;
  if (XR && XR.prototype && typeof XR.prototype.readText === "function") {
    const _readText = XR.prototype.readText;
    XR.prototype.readText = function (len, _enc) { return _readText.call(this, len, "latin1"); };
    // ESCRITA: mesma correção ao GRAVAR (ex.: criar cliente com acento). Sem isto, "ÔMEGA"
    // ia como UTF-8 e o banco WIN1252 guardava "Â"MEGA". Força latin1 no addString/addText.
    const XW = serialize && serialize.XdrWriter;
    if (XW && XW.prototype && typeof XW.prototype.addText === "function") {
      const _addString = XW.prototype.addString, _addText = XW.prototype.addText;
      XW.prototype.addString = function (s, _enc) { return _addString.call(this, s, "latin1"); };
      XW.prototype.addText = function (s, _enc) { return _addText.call(this, s, "latin1"); };
      log0("correção de acentos aplicada (latin1) — leitura e escrita");
    } else {
      log0("correção de acentos aplicada (latin1) — só leitura (XdrWriter não encontrado)");
    }
  } else {
    let onde = "?"; try { onde = require.resolve("node-firebird"); } catch (e) { onde = "node-firebird não encontrado: " + e.message; }
    log0("! não achei XdrReader p/ corrigir acentos — nomes podem vir quebrados. node-firebird em:", onde);
  }
} catch (e) {
  log0("! não consegui aplicar correção de acentos:", e.message);
}
function log0(...a) { console.log(new Date().toISOString(), ...a); }

// Versão desta ponte. O servidor também guarda uma cópia; se a de lá for mais
// nova, a ponte baixa e se atualiza sozinha (veja autoAtualizar). Ao mudar o
// sync.js, suba este número — é isso que dispara a atualização nos PCs.
const PONTE_VERSAO = "2026-10-30.2";

const DIR = __dirname;
const CONFIG = JSON.parse(fs.readFileSync(path.join(DIR, "config.json"), "utf8"));
const STATE_FILE = path.join(DIR, "state.json");
const UMA_VEZ = process.argv.includes("--once"); // --once = roda uma vez e sai (p/ Agendador de Tarefas)

const STATUS_APROVADO = Number(CONFIG.statusAprovado || 10);
const INTERVALO = Math.max(30, Number(CONFIG.intervaloSegundos || 120)) * 1000;

const fbOpts = {
  host: CONFIG.firebird.host || "127.0.0.1",
  port: Number(CONFIG.firebird.port || 3050),
  database: CONFIG.firebird.database,
  user: CONFIG.firebird.user || "SYSDBA",
  password: CONFIG.firebird.password,
  lowercase_keys: false,
  role: null,
  pageSize: 4096,
  // NÃO ligar "blobAsText" aqui: materializar BLOB em TODA leitura trava a amostragem
  // de tabelas do diagnóstico. A confirmação das procedures (Fase 4) não lê nenhum BLOB.
  // OBS: a opção "encoding" do node-firebird é IGNORADA na leitura (a lib sempre
  // decodifica como UTF-8). A correção de acentos é feita acima, no patch do
  // XdrReader (latin1). Não precisa colocar nada de encoding no config.json.
};

function log(...a) { console.log(new Date().toISOString(), ...a); }

// ── estado (última data processada) ──────────────────────────────────────────
function lerEstado() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}
function salvarEstado(s) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); } catch (e) { log("! não salvou estado:", e.message); }
}

// ── Firebird (promessas em cima da API de callback) ──────────────────────────
function conectar() {
  return new Promise((resolve, reject) => {
    Firebird.attach(fbOpts, (err, db) => (err ? reject(err) : resolve(db)));
  });
}
function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}
// Transação explícita (pra gravar cabeçalho + itens + cores do pedido TUDO OU NADA).
function transacao(db) {
  return new Promise((resolve, reject) => {
    db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, tr) => (err ? reject(err) : resolve(tr)));
  });
}
function trQuery(tr, sql, params = []) {
  return new Promise((resolve, reject) => {
    tr.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}
function trCommit(tr) { return new Promise((resolve, reject) => tr.commit((err) => (err ? reject(err) : resolve()))); }
function trRollback(tr) { return new Promise((resolve) => { try { tr.rollback(() => resolve()); } catch { resolve(); } }); }
// Formata CNPJ/CPF (só dígitos) pontuado, como o APP_CLIENTES_SEARCH espera.
function formatarDoc(s) {
  const d = String(s || "").replace(/\D+/g, "");
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
}
// Data no formato que as procedures do Syntech esperam: MM/DD/YYYY.
function dataUSA(d) { const p = (n) => String(n).padStart(2, "0"); return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`; }

// ── chamada na nossa API ─────────────────────────────────────────────────────
async function enviarPedido(payload) {
  const url = CONFIG.api.base.replace(/\/+$/, "") + "/api/integracao/pedido";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
    body: JSON.stringify(payload),
  });
  const txt = await r.text();
  let js = {};
  try { js = JSON.parse(txt); } catch { /* resposta não-JSON */ }
  return { ok: r.ok, status: r.status, js, txt };
}

// ── auto-atualização ──────────────────────────────────────────────────────────
// Pergunta ao servidor se existe uma versão mais nova da ponte. Se existir, baixa
// e sobrescreve este próprio arquivo — a versão nova passa a valer na PRÓXIMA
// rodada (o start.bat roda "node sync.js --once" de novo a cada 2 min). Assim o
// usuário nunca mais precisa copiar arquivo. Qualquer falha aqui é ignorada: a
// ponte continua funcionando com a versão atual.
async function autoAtualizar() {
  try {
    if (!CONFIG.api || !CONFIG.api.base) return;
    const url = CONFIG.api.base.replace(/\/+$/, "") + "/api/integracao/bridge-sync";
    const r = await fetch(url, { headers: { "X-Integracao-Token": CONFIG.api.token || "" } });
    if (!r.ok) return; // 401/404/sem versão no servidor → segue com a atual
    const novo = await r.text();
    // validações de segurança: conteúdo precisa parecer o sync.js de verdade
    if (!novo || novo.length < 1000 || novo.indexOf("PONTE Syntech") === -1 || novo.indexOf("PONTE_VERSAO") === -1) return;
    const m = novo.match(/PONTE_VERSAO\s*=\s*["']([^"']+)["']/);
    const versaoNova = m && m[1];
    if (!versaoNova || versaoNova === PONTE_VERSAO) return; // já estou na última
    fs.writeFileSync(__filename, novo);
    log(`ponte ATUALIZADA sozinha: ${PONTE_VERSAO} → ${versaoNova}.`);
    // IMPORTANTE: NÃO continuar rodando o código VELHO que já está na memória.
    // No modo --once (Agendador de Tarefas re-executa a cada 2 min), saímos agora
    // e o PRÓXIMO ciclo já carrega a versão nova do disco. Evita o "ciclo chato" de
    // rodar a versão velha (que pode travar) depois de atualizar.
    if (UMA_VEZ) {
      log(`saindo pra o próximo ciclo (~${INTERVALO / 1000}s) rodar a versão nova.`);
      // NÃO sair na marra com process.exit() agora: fazer isso enquanto o socket do
      // fetch ainda está fechando dá "Assertion failed UV_HANDLE_CLOSING" no Windows.
      // Em vez disso, sinaliza pro main NÃO rodar o código velho e deixa o processo
      // encerrar limpo; um timer curto garante a saída caso algo segure o event loop.
      setTimeout(() => process.exit(0), 1200);
      return true;
    }
    log(`vale na próxima rodada (~${INTERVALO / 1000}s).`);
  } catch (e) {
    log("! auto-atualização falhou (seguindo na versão atual):", e.message);
  }
  return false;
}

// ── monta e envia UM pedido (cabeçalho + itens) ──────────────────────────────
async function processarPedido(db, ped) {
  // Cliente (só o nome é garantido; cnpj/cidade/uf são opcionais — ajuste se o ERP tiver).
  let clienteNome = null;
  try {
    const cl = await query(db, "SELECT NOME FROM CLIENTES WHERE CODIGO = ?", [ped.COD_CLI]);
    clienteNome = cl[0] ? String(cl[0].NOME || "").trim() : null;
  } catch { /* sem cliente */ }

  // Itens: quebra por COR e TAMANHO (CORES_PEDIDO.QUANT). Pula item BAIXADO ('B').
  // TAMANHO real = TAMANHO_PROD.DETALHE (ex.: 45X45). Se o join não casar, cai no código do tamanho.
  const SQL_ITENS =
    `SELECT IT.COD_PROD, PR.NOME AS PRODUTO, IT.TAMANHO,
            TP.DETALHE AS TAM_DETALHE,
            CR.NOME AS COR, IC.QUANT, IT.PRECO,
            IT.QUANT_PED, IT.QUANT_ENTR, IT.BAIXADO
       FROM ITENS_PEDIDO IT
       INNER JOIN PRODUTOS PR ON PR.CODIGO = IT.COD_PROD
       LEFT JOIN CORES_PEDIDO IC ON IC.NUMERO = IT.NUMERO AND IC.COD_PROD = IT.COD_PROD AND IC.TAMANHO = IT.TAMANHO
       LEFT JOIN CORES CR ON CR.NUMERO = IC.COD_COR
       LEFT JOIN TAMANHO_PROD TP ON TP.COD_PROD = IT.COD_PROD AND TP.AUTOINC = IT.AUTOINC_TAM
      WHERE IT.NUMERO = ? AND COALESCE(IT.BAIXADO, ' ') <> 'B'
      ORDER BY IT.COD_PROD, IT.AUTOINC_TAM`;

  let linhas = [];
  try {
    linhas = await query(db, SQL_ITENS, [ped.NUMERO]);
  } catch (e) {
    // Se o join do TAMANHO_PROD falhar (nome de coluna diferente nessa base), tenta sem ele.
    log(`  (itens: join TAMANHO_PROD falhou — ${e.message}; tentando sem o detalhe)`);
    const SQL_SIMPLES =
      `SELECT IT.COD_PROD, PR.NOME AS PRODUTO, IT.TAMANHO, NULL AS TAM_DETALHE,
              CR.NOME AS COR, IC.QUANT, IT.PRECO, IT.QUANT_PED, IT.QUANT_ENTR, IT.BAIXADO
         FROM ITENS_PEDIDO IT
         INNER JOIN PRODUTOS PR ON PR.CODIGO = IT.COD_PROD
         LEFT JOIN CORES_PEDIDO IC ON IC.NUMERO = IT.NUMERO AND IC.COD_PROD = IT.COD_PROD AND IC.TAMANHO = IT.TAMANHO
         LEFT JOIN CORES CR ON CR.NUMERO = IC.COD_COR
        WHERE IT.NUMERO = ? AND COALESCE(IT.BAIXADO, ' ') <> 'B'
        ORDER BY IT.COD_PROD, IT.AUTOINC_TAM`;
    linhas = await query(db, SQL_SIMPLES, [ped.NUMERO]);
  }

  const itens = linhas
    .map((r) => {
      const qtd = Number(r.QUANT != null ? r.QUANT : r.QUANT_PED) || 0;
      const tamanho = String((r.TAM_DETALHE != null && String(r.TAM_DETALHE).trim()) || r.TAMANHO || "").trim();
      return {
        produto: String(r.PRODUTO || "").trim(),
        ref: String(r.COD_PROD || "").trim(),
        cor: String(r.COR || "").trim(),
        tamanho,
        qtd,
        preco: Number(r.PRECO) || 0,
      };
    })
    .filter((it) => it.produto && it.qtd > 0);

  if (!itens.length) { log(`  pedido ${ped.NUMERO}: sem itens válidos — pulado`); return; }

  const toISO = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : (d ? String(d) : null));
  const payload = {
    numero: String(ped.NUMERO),
    data: toISO(ped.DATA),
    cliente: { nome: clienteNome || "SEM CLIENTE" },
    itens,
  };

  const res = await enviarPedido(payload);
  if (res.ok && res.js && res.js.duplicado) log(`  pedido ${ped.NUMERO}: já existia (ok)`);
  else if (res.ok) log(`  pedido ${ped.NUMERO}: enviado ✓ (${itens.length} item(ns))`);
  else log(`  pedido ${ped.NUMERO}: FALHOU (${res.status}) ${res.txt.slice(0, 160)}`);
  return res.ok;
}

// ── ESTOQUE: lê o saldo do ERP e espelha no sistema (só leitura lá no site/CRM) ──
// A consulta fica no config.estoque.sql porque o nome da tabela/colunas de saldo
// varia por base — o pessoal do Syntech informa. Ela deve devolver as colunas:
//   PRODUTO, REF, COR, TAMANHO, SALDO, UNIDADE
async function enviarEstoque(itens, lote, fim) {
  const url = CONFIG.api.base.replace(/\/+$/, "") + "/api/integracao/estoque";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
    body: JSON.stringify({ itens, full: true, lote, fim: !!fim }),
  });
  return r.ok;
}
async function rodadaEstoque(db) {
  // PREFERIDO: estoque EXATO por cor/tamanho via a procedure OFICIAL do Syntech
  // (documento de integração: APP_ESTOQUE_DETALHADO(COD_PROD) → COR, COD_COR, TAMANHO, SALDO…).
  // Se não funcionar (procedure ausente/erro), CAI no modo antigo (CONFIG.estoque.sql).
  let itens = null;
  try { itens = await estoquePorCor(db); } catch (e) { log("! estoque por cor: erro —", e.message); itens = null; }

  if (!itens) {
    const sql = CONFIG.estoque && CONFIG.estoque.sql;
    if (!sql) { log("estoque: sem APP_ESTOQUE_DETALHADO e sem CONFIG.estoque.sql — nada a espelhar"); return; }
    let linhas = [];
    try { linhas = await query(db, sql); }
    catch (e) { log("! estoque: consulta (fallback) falhou —", e.message); return; }
    itens = linhas.map((r) => ({
      produto: String(r.PRODUTO || "").trim(),
      ref: String(r.REF || "").trim(),
      cor: String(r.COR || "").trim(),
      tamanho: String(r.TAMANHO || "").trim(),
      saldo: Number(r.SALDO) || 0,
      unidade: String(r.UNIDADE || "").trim(),
    })).filter((x) => x.ref || x.produto);
  }
  // Usa um 'lote' único por rodada; no ÚLTIMO lote (e só se TODOS deram certo) manda
  // fim=true, e aí o servidor apaga o estoque que sumiu do Syntech (sem saldo fantasma).
  // Se algum lote falhar, não manda o fim — melhor deixar linha velha do que apagar por engano.
  const lote = "L" + Date.now();
  if (!itens.length) {
    // Syntech sem NENHUM saldo (leitura ok, mas nada retornou) → manda fim com itens vazio
    // pra o servidor ZERAR o espelho (senão ficaria estoque fantasma). Só acontece quando
    // a leitura foi bem-sucedida e genuinamente vazia (erro vira null e cai no fallback).
    const ok = await enviarEstoque([], lote, true);
    log(ok ? "estoque: Syntech vazio — espelho zerado" : "estoque: vazio, mas falhou ao zerar (tenta na próxima)");
    return;
  }
  // envia em lotes de 500 pra não estourar o tamanho da requisição.
  let enviados = 0, todasOk = true;
  for (let i = 0; i < itens.length; i += 500) {
    const ultimo = i + 500 >= itens.length;
    const ok = await enviarEstoque(itens.slice(i, i + 500), lote, ultimo && todasOk);
    if (ok) enviados += Math.min(500, itens.length - i); else todasOk = false;
  }
  log(`estoque: ${enviados}/${itens.length} saldo(s) por cor espelhado(s)` + (todasOk ? " [espelho = Syntech]" : " (incompleto — mantém linhas antigas)"));
}

// Estoque EXATO por cor/tamanho usando a procedure do documento de integração.
// Lista os produtos ativos e chama APP_ESTOQUE_DETALHADO(COD_PROD) pra cada um.
// Devolve null (pra cair no fallback) se a procedure não existir / falhar em TODOS.
async function estoquePorCor(db) {
  const cfg = CONFIG.estoque || {};
  if (cfg.porCor === false) return null; // dá pra desligar no config se precisar
  const proc = cfg.proc || "APP_ESTOQUE_DETALHADO";
  // TODOS os produtos (inclusive INATIVOS): as peças de kit costumam ficar inativas no
  // Syntech, mas o catálogo precisa do estoque por cor delas pra calcular o kit.
  const prodSql = cfg.produtosSql || "SELECT CODIGO FROM PRODUTOS";
  let prods = [];
  try { prods = await query(db, prodSql); }
  catch (e) { log("! estoque por cor: lista de produtos falhou —", e.message); return null; }
  if (!prods || !prods.length) return null;
  // A procedure devolve a cor como CÓDIGO (NUMERO da tabela CORES). O catálogo casa a cor
  // pelo NOME — então montamos aqui o mapa código→nome da tabela CORES (a mesma que o
  // catálogo usa pros produtos). Assim o estoque por cor casa certinho.
  const corNomePorCod = new Map();
  try {
    const cs = await query(db, "SELECT NUMERO, NOME FROM CORES");
    for (const c of (cs || [])) { const cod = String(c.NUMERO != null ? c.NUMERO : "").trim(); const nm = String(c.NOME || "").trim(); if (cod && nm) corNomePorCod.set(cod, nm); }
  } catch (e) { log("! estoque por cor: mapa de cores (CORES) falhou —", e.message); }
  const itens = [];
  let okP = 0, erroP = 0, primeiroErro = "";
  for (const p of prods) {
    const cod = String((p.CODIGO != null ? p.CODIGO : (p.COD_PROD != null ? p.COD_PROD : p.COD)) || "").trim();
    if (!cod) continue;
    try {
      const rows = await query(db, `SELECT * FROM ${proc}(?)`, [cod]);
      let temLinha = false;
      for (const r of (rows || [])) {
        const codCor = String(r.COD_COR != null ? r.COD_COR : (r.COR != null ? r.COR : "")).trim();
        // nome da cor: mapa CORES (por código) > NOME que a procedure devolver > o código cru.
        const cor = corNomePorCod.get(codCor) || String(r.NOME || r.COR || "").trim();
        const tam = String(r.TAMANHO || "").trim();
        if (!cor && !tam) continue;
        itens.push({ produto: cod, ref: cod, cor, tamanho: tam, saldo: Number(r.SALDO) || 0, unidade: "" });
        temLinha = true;
      }
      if (temLinha) okP++;
    } catch (e) { erroP++; if (!primeiroErro) primeiroErro = e.message; }
  }
  // Reporta o resultado pro servidor (aparece no indicador "Estoque do Syntech"),
  // pra dar pra diagnosticar sem precisar olhar o log da ponte.
  try {
    const base = CONFIG.api.base.replace(/\/+$/, "");
    await fetch(base + "/api/integracao/estoque-diag", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token || "" },
      body: JSON.stringify({ proc, com_cor: okP, sem_detalhe: erroP, itens: itens.length, produtos: prods.length, erro: String(primeiroErro || "").slice(0, 300) }),
    });
  } catch { /* não bloqueia o estoque */ }
  // Nenhum produto respondeu → procedure errada/ausente → cai no fallback antigo.
  if (!okP && erroP) { log(`! estoque por cor: ${proc} falhou em todos (${erroP}) — ${primeiroErro}. Uso o modo antigo.`); return null; }
  log(`estoque por cor: ${itens.length} saldo(s) por cor de ${okP} produto(s)` + (erroP ? ` (${erroP} sem detalhe)` : ""));
  return itens;
}

// ── RECEITA DO KIT: lê INSUMOS_PROD (kit → peças) e espelha no sistema ─────────
// O kit (ex.: QC1078-1 "KIT BALLS QUEEN + 55X35") é montado por insumos (KT1078-C x2,
// KT1078-P x1). A tabela é pequena; manda tudo e o servidor substitui. Assim o
// catálogo sabe quais produtos são kit e calcula o estoque ao vivo pelas peças.
async function rodadaKits(db) {
  let rows = [];
  try { rows = await query(db, "SELECT CODIGO, COD_PROD, QUANTIDADE, TAMANHO FROM INSUMOS_PROD"); }
  catch (e) { log("! kits: consulta falhou —", e.message); return; }
  const itens = rows.map((r) => ({
    kit: String(r.CODIGO || "").trim(),
    componente: String(r.COD_PROD || "").trim(),
    quantidade: Number(r.QUANTIDADE) || 1,
    tamanho: String(r.TAMANHO || "").trim(),
  })).filter((x) => x.kit && x.componente);
  if (!itens.length) { log("kits: nada a enviar"); return; }
  try {
    const url = CONFIG.api.base.replace(/\/+$/, "") + "/api/integracao/kits";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
      body: JSON.stringify({ itens }),
    });
    log(`kits: ${r.ok ? itens.length + " linha(s) de receita espelhada(s)" : "falhou (" + r.status + ")"}`);
  } catch (e) { log("! kits: falhou ao enviar —", e.message); }
}

// ── CATÁLOGO: produtos (nome, preços, grupo, classe, cores, tamanhos) ─────────
// Incremental por PRODUTOS.DATA_ALT_REG (muda em qualquer alteração, incl. estoque).
async function enviarProdutos(itens) {
  const url = CONFIG.api.base.replace(/\/+$/, "") + "/api/integracao/produtos";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
    body: JSON.stringify({ itens }),
  });
  return r.ok;
}
function hexCor(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  return /^#/.test(s) ? s : (/^[0-9a-fA-F]{6}$/.test(s) ? "#" + s : s);
}
async function rodadaProdutos(db, estado) {
  if (CONFIG.produtos && CONFIG.produtos.ativo === false) return;
  // Correção de acentos (v2): força UMA re-leitura completa dos produtos pra
  // regravar com os acentos certos. Depois o incremental normal volta sozinho —
  // o usuário não precisa apagar o state.json.
  const inicio = (CONFIG.produtos && CONFIG.produtos.desde ? `${CONFIG.produtos.desde} 00:00:00` : "1900-01-01 00:00:00");
  const repuxarTudo = !estado.acentosV2 || !estado.precosV1 || !estado.repuxaV3;
  const desde = (!repuxarTudo && estado.ultimaAltProd) ? estado.ultimaAltProd : inicio;
  if (repuxarTudo) log("produtos: re-puxando TUDO uma vez (acentos + preços por tamanho)…");
  const SQL_PROD =
    (CONFIG.produtos && CONFIG.produtos.sql) ||
    `SELECT A.CODIGO, A.NOME, A.UNIDADE, A.PRECO_VENDA, A.PRECO_VENDA_LJ, A.INATIVO,
            A.PROMOCAO, A.DESCONTO_AUTO, B.DESCRICAO AS CLASSE, C.DESCRICAO AS GRUPO,
            A.DATA_ALT_REG, A.ESTOQUE_ATUAL
       FROM PRODUTOS A
       LEFT JOIN CLASS_PROD B ON B.CODIGO = A.CLASSIFICACAO
       LEFT JOIN GRUPO_PROD C ON C.CODIGO = A.GRUPO
      WHERE A.DATA_ALT_REG > ?
      ORDER BY A.DATA_ALT_REG`;
  let prods = [];
  try { prods = await query(db, SQL_PROD, [desde]); }
  catch (e) { log("! produtos: consulta falhou —", e.message); return; }
  if (!prods.length) { log(`produtos: sem novidades (desde ${desde})`); return; }

  log(`produtos: ${prods.length} novo(s)/alterado(s)`);
  const lote = [];
  let maiorAlt = estado.ultimaAltProd || null;
  for (const p of prods) {
    const ref = String(p.CODIGO || "").trim();
    if (!ref) continue;
    // cores do produto (com nome e hex)
    let cores = [];
    try {
      const cr = await query(db, "SELECT C.NUMERO, C.NOME, C.COR_HTML FROM CORES_PROD CP INNER JOIN CORES C ON C.NUMERO = CP.COD_COR WHERE CP.COD_PROD = ?", [ref]);
      cores = cr.map((r) => ({ numero: r.NUMERO, nome: String(r.NOME || "").trim(), hex: hexCor(r.COR_HTML) }));
    } catch { /* sem cores */ }
    // tamanhos do produto — COM preço por tamanho (a Big Tricot usa "Preços
    // Diferenciados": cada tamanho tem seu preço). Em TAMANHO_PROD:
    //   PRECO_VENDA = atacado ; PRECO_VENDA_LJ = varejo (loja).
    // Prefere a MEDIDA real (DETALHE, ex.: 45X45); cai no código do tamanho se não houver.
    let tamanhos = [];
    try {
      let tm;
      try { tm = await query(db, "SELECT TAMANHO, DETALHE, PRECO_VENDA, PRECO_VENDA_LJ FROM TAMANHO_PROD WHERE COD_PROD = ? ORDER BY AUTOINC", [ref]); }
      catch {
        try { tm = await query(db, "SELECT TAMANHO, DETALHE FROM TAMANHO_PROD WHERE COD_PROD = ?", [ref]); }
        catch { tm = await query(db, "SELECT TAMANHO FROM TAMANHO_PROD WHERE COD_PROD = ?", [ref]); }
      }
      tamanhos = tm.map((r) => {
        const medida = String((r.DETALHE != null && String(r.DETALHE).trim()) || r.TAMANHO || "").trim();
        return {
          medida,
          tamanho: String(r.TAMANHO || "").trim(),
          atacado: Number(r.PRECO_VENDA) || 0,
          varejo: Number(r.PRECO_VENDA_LJ) || 0,
        };
      }).filter((x) => x.medida);
    } catch { /* sem tamanhos */ }
    const promo = String(p.PROMOCAO || "") === "S" && p.DESCONTO_AUTO != null;
    const desc = promo ? Number(p.DESCONTO_AUTO) || 0 : 0;
    const pa = Number(p.PRECO_VENDA) || 0, pv = Number(p.PRECO_VENDA_LJ) || 0;
    lote.push({
      ref,
      nome: String(p.NOME || "").trim(),
      unidade: String(p.UNIDADE || "").trim(),
      classe: String(p.CLASSE || "").trim(),
      grupo: String(p.GRUPO || "").trim(),
      preco_atacado: pa,
      preco_varejo: pv,
      preco_atacado_promo: promo ? Math.round(pa * (1 - desc / 100) * 100) / 100 : null,
      preco_varejo_promo: promo ? Math.round(pv * (1 - desc / 100) * 100) / 100 : null,
      estoque_geral: Number(p.ESTOQUE_ATUAL) || 0,
      inativo: String(p.INATIVO || "") === "S" ? 1 : 0,
      cores, tamanhos,
      data_alt_reg: p.DATA_ALT_REG instanceof Date ? p.DATA_ALT_REG.toISOString() : String(p.DATA_ALT_REG || ""),
    });
    const alt = formatarParaFirebird(p.DATA_ALT_REG);
    if (!maiorAlt || alt > maiorAlt) maiorAlt = alt;
  }
  // envia em lotes de 200. Só avança a "marca d'água" se TUDO foi enviado —
  // assim, se um envio falhar, ele tenta de novo na próxima rodada (não pula).
  let enviados = 0, todasOk = true;
  for (let i = 0; i < lote.length; i += 200) {
    const ok = await enviarProdutos(lote.slice(i, i + 200));
    if (ok) enviados += Math.min(200, lote.length - i); else todasOk = false;
  }
  if (todasOk && maiorAlt) salvarEstado({ ...lerEstado(), ultimaAltProd: maiorAlt, acentosV2: true, precosV1: true, repuxaV3: true });
  log(`produtos: ${enviados}/${lote.length} enviado(s).` + (todasOk ? ` última alteração: ${maiorAlt}` : " (envio incompleto — tentarei de novo na próxima rodada)"));
}

// ── DIAGNÓSTICO (uma vez): descobre a estrutura do banco do Syntech ───────────
// Lista as tabelas/colunas e tira uma amostra das tabelas de produto/tamanho/preço
// e manda pro servidor (POST /api/integracao/diag). Serve pra eu (dev) descobrir
// o nome EXATO das colunas de preço por tamanho sem o usuário fazer nada. Roda só
// UMA vez (controlado pela flag no state.json); pra pedir de novo, troca o nome
// da flag aqui embaixo (DIAG_FLAG) numa versão nova da ponte.
const DIAG_FLAG = "diagV3_pedidos";
function limparValor(v) {
  if (v == null) return v;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return `[blob ${v.length}b]`;
  if (typeof v === "string") return v.length > 300 ? v.slice(0, 300) + "…" : v;
  if (typeof v === "object") { try { return JSON.parse(JSON.stringify(v)); } catch { return String(v); } }
  return v;
}
function limparLinha(r) {
  const o = {};
  for (const k of Object.keys(r || {})) o[k] = limparValor(r[k]);
  return o;
}
async function enviarDiag(diag) {
  try {
    const url = CONFIG.api.base.replace(/\/+$/, "") + "/api/integracao/diag";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
      body: JSON.stringify(diag),
    });
    return r.ok;
  } catch (e) { log("! diagnóstico: falhou ao enviar —", e.message); return false; }
}
async function rodadaDiagnostico(db, estado) {
  if (estado[DIAG_FLAG]) return; // já mandei
  log("diagnóstico: explorando a estrutura do banco (uma vez só)…");
  const diag = { versao: PONTE_VERSAO, quando: new Date().toISOString(), tabelas: [], amostras: {}, erros: [] };
  try {
    const tbs = await query(db,
      "SELECT TRIM(RDB$RELATION_NAME) AS NOME FROM RDB$RELATIONS WHERE COALESCE(RDB$SYSTEM_FLAG,0)=0 AND RDB$VIEW_BLR IS NULL ORDER BY RDB$RELATION_NAME");
    const nomes = tbs.map((r) => String(r.NOME || "").trim()).filter(Boolean);
    // sempre amostra essas (centrais p/ preço por tamanho)
    const candidatas = new Set(["PRODUTOS", "TAMANHO_PROD"]);
    for (const nome of nomes) {
      let cols = [];
      try {
        const cs = await query(db,
          "SELECT TRIM(RF.RDB$FIELD_NAME) AS CAMPO FROM RDB$RELATION_FIELDS RF WHERE RF.RDB$RELATION_NAME = ? ORDER BY RF.RDB$FIELD_POSITION",
          [nome]);
        cols = cs.map((r) => String(r.CAMPO || "").trim()).filter(Boolean);
      } catch (e) { diag.erros.push(`cols ${nome}: ${e.message}`); }
      diag.tabelas.push({ nome, colunas: cols });
      const un = nome.toUpperCase();
      if (/PRECO|PRECOS|VALOR|TABPR|TAB_PR|PRCO/.test(un)) candidatas.add(nome);
      if (cols.some((cc) => { const u = cc.toUpperCase(); return /PRECO|VALOR|ATACAD|VAREJO|^C[0-9]$|CUSTO/.test(u); })) candidatas.add(nome);
    }
    for (const nome of candidatas) {
      try {
        const rows = await query(db, `SELECT FIRST 3 * FROM ${nome}`);
        diag.amostras[nome] = rows.map(limparLinha);
      } catch (e) { diag.erros.push(`amostra ${nome}: ${e.message}`); }
    }
  } catch (e) { diag.erros.push("geral: " + e.message); }

  // ── Estrutura de ESCRITA de PEDIDO (Fase 4: criar pedido no Syntech) ─────────
  // SÓ LEITURA. Mapeia colunas obrigatórias, o gerador do NUMERO (valor atual sem
  // incrementar) e um pedido real de exemplo, pra eu montar o INSERT certo depois.
  diag.pedido = { colunas: {}, geradores: [], amostra: {}, outras: {}, erros: [] };
  const colsComNull = async (tabela) => {
    try {
      const cs = await query(db,
        "SELECT TRIM(RF.RDB$FIELD_NAME) AS CAMPO, RF.RDB$NULL_FLAG AS NOTNULL, F.RDB$FIELD_TYPE AS TIPO, F.RDB$FIELD_LENGTH AS TAM, RF.RDB$DEFAULT_SOURCE AS DEFSRC " +
        "FROM RDB$RELATION_FIELDS RF JOIN RDB$FIELDS F ON F.RDB$FIELD_NAME = RF.RDB$FIELD_SOURCE WHERE RF.RDB$RELATION_NAME = ? ORDER BY RF.RDB$FIELD_POSITION",
        [tabela]);
      return cs.map((r) => ({ campo: String(r.CAMPO || "").trim(), obrigatorio: Number(r.NOTNULL) === 1, tipo: r.TIPO, tam: r.TAM, def: r.DEFSRC ? String(r.DEFSRC).trim() : null }));
    } catch (e) { diag.pedido.erros.push(`cols ${tabela}: ${e.message}`); return []; }
  };
  try {
    for (const t of ["PEDIDO", "ITENS_PEDIDO", "CORES_PEDIDO"]) diag.pedido.colunas[t] = await colsComNull(t);
    // geradores (sequências): valor atual SEM incrementar (GEN_ID passo 0).
    try {
      const gs = await query(db, "SELECT TRIM(RDB$GENERATOR_NAME) AS NOME FROM RDB$GENERATORS WHERE COALESCE(RDB$SYSTEM_FLAG,0)=0 ORDER BY RDB$GENERATOR_NAME");
      for (const g of gs) {
        const nome = String(g.NOME || "").trim(); if (!nome) continue;
        const rel = /PEDIDO|ORC|\bPED\b|NUMERO|SEQ/.test(nome.toUpperCase());
        let valor = null;
        if (rel && /^[A-Za-z0-9_$]+$/.test(nome)) { try { const v = await query(db, `SELECT GEN_ID(${nome}, 0) AS V FROM RDB$DATABASE`); valor = v[0] ? v[0].V : null; } catch { /* ignora */ } }
        diag.pedido.geradores.push({ nome, valor });
      }
    } catch (e) { diag.pedido.erros.push("geradores: " + e.message); }
    // amostra de um pedido real recente (cabeçalho + itens + cores) pra copiar o formato.
    try {
      const ped = await query(db, "SELECT FIRST 1 * FROM PEDIDO ORDER BY NUMERO DESC");
      if (ped[0]) {
        diag.pedido.amostra.pedido = limparLinha(ped[0]);
        const num = ped[0].NUMERO;
        try { diag.pedido.amostra.itens = (await query(db, "SELECT FIRST 5 * FROM ITENS_PEDIDO WHERE NUMERO = ?", [num])).map(limparLinha); } catch (e) { diag.pedido.erros.push("itens: " + e.message); }
        try { diag.pedido.amostra.cores = (await query(db, "SELECT FIRST 5 * FROM CORES_PEDIDO WHERE NUMERO = ?", [num])).map(limparLinha); } catch (e) { diag.pedido.erros.push("cores: " + e.message); }
      }
    } catch (e) { diag.pedido.erros.push("amostra pedido: " + e.message); }
    // caminhos de "pedido de fora" (Bling / Site-API) — se existirem.
    for (const t of ["BLING_PEDIDOS", "BLING_ITENS", "WEB_VARIACOES", "CATALOGO", "PEDIDO_VENDA_FIO"]) {
      try { diag.pedido.outras[t] = (await query(db, `SELECT FIRST 2 * FROM ${t}`)).map(limparLinha); } catch (e) { diag.pedido.erros.push(`${t}: ${e.message}`); }
    }
    // ── VIA OFICIAL: procedures APP_* do Syntech (site → ERP) ──────────────────
    // O manual documenta APP_PEDIDO_INSERT_V2 / APP_ITENS_PEDIDO_INSERT /
    // APP_CORES_PEDIDO_INSERT / APP_CLIENTES_SEARCH / APP_CLIENTES_INSERT_V2.
    // Confirmo aqui que EXISTEM neste install e com quais parâmetros (ordem/tipo).
    diag.pedido.procedures = {};
    try {
      const procs = await query(db,
        "SELECT TRIM(RDB$PROCEDURE_NAME) AS NOME FROM RDB$PROCEDURES " +
        "WHERE COALESCE(RDB$SYSTEM_FLAG,0)=0 AND RDB$PROCEDURE_NAME LIKE 'APP%' ORDER BY RDB$PROCEDURE_NAME");
      for (const pr of procs) {
        const nome = String(pr.NOME || "").trim(); if (!nome) continue;
        let params = [];
        try {
          const ps = await query(db,
            "SELECT TRIM(PP.RDB$PARAMETER_NAME) AS CAMPO, PP.RDB$PARAMETER_NUMBER AS ORDEM, " +
            "PP.RDB$PARAMETER_TYPE AS TIPO_PARAM, F.RDB$FIELD_TYPE AS TIPO, F.RDB$FIELD_LENGTH AS TAM " +
            "FROM RDB$PROCEDURE_PARAMETERS PP JOIN RDB$FIELDS F ON F.RDB$FIELD_NAME = PP.RDB$FIELD_SOURCE " +
            "WHERE PP.RDB$PROCEDURE_NAME = ? ORDER BY PP.RDB$PARAMETER_TYPE, PP.RDB$PARAMETER_NUMBER",
            [nome]);
          params = ps.map((r) => ({ campo: String(r.CAMPO || "").trim(), ordem: r.ORDEM, dir: Number(r.TIPO_PARAM) === 1 ? "out" : "in", tipo: r.TIPO, tam: r.TAM }));
        } catch (e) { diag.pedido.erros.push(`params ${nome}: ${e.message}`); }
        diag.pedido.procedures[nome] = params;
      }
    } catch (e) { diag.pedido.erros.push("procedures: " + e.message); }
    // ── Plano B: triggers BEFORE INSERT (tipo 1) das 3 tabelas de pedido ───────
    // Só os NOMES (o CÓDIGO/fonte é BLOB e não leio aqui pra não travar). Serve só
    // pra saber SE existem gatilhos que auto-preenchem algo — plano B caso falte SP.
    diag.pedido.triggers = {};
    try {
      for (const t of ["PEDIDO", "ITENS_PEDIDO", "CORES_PEDIDO"]) {
        const trs = await query(db,
          "SELECT TRIM(RDB$TRIGGER_NAME) AS NOME, RDB$TRIGGER_TYPE AS TIPO, RDB$TRIGGER_SEQUENCE AS SEQ, " +
          "COALESCE(RDB$TRIGGER_INACTIVE,0) AS INATIVO " +
          "FROM RDB$TRIGGERS WHERE RDB$RELATION_NAME = ? AND RDB$TRIGGER_TYPE = 1 " +
          "AND COALESCE(RDB$SYSTEM_FLAG,0)=0 ORDER BY RDB$TRIGGER_SEQUENCE",
          [t]);
        diag.pedido.triggers[t] = trs.map((r) => ({
          nome: String(r.NOME || "").trim(), tipo: r.TIPO, seq: r.SEQ,
          inativo: Number(r.INATIVO) === 1,
        }));
      }
    } catch (e) { diag.pedido.erros.push("triggers: " + e.message); }
  } catch (e) { diag.pedido.erros.push("geral: " + e.message); }

  const ok = await enviarDiag(diag);
  if (ok) {
    salvarEstado({ ...lerEstado(), [DIAG_FLAG]: true });
    log(`diagnóstico: enviado (${diag.tabelas.length} tabelas, ${Object.keys(diag.amostras).length} amostras). Não roda de novo.`);
  } else {
    log("diagnóstico: não enviou — tenta na próxima rodada.");
  }
}

// Diagnóstico MINÚSCULO e à prova de trava (Fase 4): só confirma se as procedures
// oficiais do Syntech (APP_PEDIDO_INSERT_V2 etc.) existem e com quais parâmetros.
// NÃO varre as 420 tabelas (isso é o que travava) — só lê metadados de RDB$PROCEDURES
// e os NOMES dos triggers. Roda uma vez (flag própria) e manda num POST pequeno.
const DIAG_PROCS_FLAG = "diagProcsV1";
async function rodadaDiagProcs(db, estado) {
  if (estado[DIAG_PROCS_FLAG]) return;
  log("diag-procs: confirmando as procedures APP_* (leve, uma vez só)…");
  const out = { versao: PONTE_VERSAO, quando: new Date().toISOString(), procedures: {}, triggers: {}, erros: [] };
  try {
    const procs = await query(db,
      "SELECT TRIM(RDB$PROCEDURE_NAME) AS NOME FROM RDB$PROCEDURES " +
      "WHERE COALESCE(RDB$SYSTEM_FLAG,0)=0 AND RDB$PROCEDURE_NAME LIKE 'APP%' ORDER BY RDB$PROCEDURE_NAME");
    for (const pr of procs) {
      const nome = String(pr.NOME || "").trim(); if (!nome) continue;
      let params = [];
      try {
        const ps = await query(db,
          "SELECT TRIM(PP.RDB$PARAMETER_NAME) AS CAMPO, PP.RDB$PARAMETER_NUMBER AS ORDEM, " +
          "PP.RDB$PARAMETER_TYPE AS TIPO_PARAM, F.RDB$FIELD_TYPE AS TIPO, F.RDB$FIELD_LENGTH AS TAM " +
          "FROM RDB$PROCEDURE_PARAMETERS PP JOIN RDB$FIELDS F ON F.RDB$FIELD_NAME = PP.RDB$FIELD_SOURCE " +
          "WHERE PP.RDB$PROCEDURE_NAME = ? ORDER BY PP.RDB$PARAMETER_TYPE, PP.RDB$PARAMETER_NUMBER",
          [nome]);
        params = ps.map((r) => ({ campo: String(r.CAMPO || "").trim(), ordem: r.ORDEM, dir: Number(r.TIPO_PARAM) === 1 ? "out" : "in", tipo: r.TIPO, tam: r.TAM }));
      } catch (e) { out.erros.push(`params ${nome}: ${e.message}`); }
      out.procedures[nome] = params;
    }
  } catch (e) { out.erros.push("procedures: " + e.message); }
  try {
    for (const t of ["PEDIDO", "ITENS_PEDIDO", "CORES_PEDIDO"]) {
      const trs = await query(db,
        "SELECT TRIM(RDB$TRIGGER_NAME) AS NOME, RDB$TRIGGER_TYPE AS TIPO, RDB$TRIGGER_SEQUENCE AS SEQ, " +
        "COALESCE(RDB$TRIGGER_INACTIVE,0) AS INATIVO " +
        "FROM RDB$TRIGGERS WHERE RDB$RELATION_NAME = ? AND RDB$TRIGGER_TYPE = 1 " +
        "AND COALESCE(RDB$SYSTEM_FLAG,0)=0 ORDER BY RDB$TRIGGER_SEQUENCE",
        [t]);
      out.triggers[t] = trs.map((r) => ({ nome: String(r.NOME || "").trim(), tipo: r.TIPO, seq: r.SEQ, inativo: Number(r.INATIVO) === 1 }));
    }
  } catch (e) { out.erros.push("triggers: " + e.message); }
  let ok = false;
  try {
    const url = CONFIG.api.base.replace(/\/+$/, "") + "/api/integracao/diag-procs";
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
      body: JSON.stringify(out),
    });
    ok = r.ok;
  } catch (e) { log("! diag-procs: falhou ao enviar —", e.message); }
  if (ok) {
    salvarEstado({ ...lerEstado(), [DIAG_PROCS_FLAG]: true });
    log(`diag-procs: enviado (${Object.keys(out.procedures).length} procedures APP_*). Não roda de novo.`);
  } else {
    log("diag-procs: não enviou — tenta na próxima rodada.");
  }
}

// Descobre a RECEITA DO KIT no Syntech. O kit (ex.: produto QC1078-1 "KIT BALLS
// QUEEN + 55X35") é montado em "Industrialização Simplificada → Cadastro de Insumos
// de Produtos": tem INSUMOS (ex.: KT1078-C qtd 2, KT1078-P qtd 1). Então procuramos
// tabelas cujo nome fala de INSUMO/ESTRUTURA/FICHA/RECEITA/COMPONENTE/KIT, listamos as
// colunas e uma amostra pequena (só colunas NÃO-blob, pra não travar). Uma vez só.
const DIAG_KIT_FLAG = "diagKitV2";
async function rodadaDiagKit(db, estado) {
  if (estado[DIAG_KIT_FLAG]) return;
  log("diag-kit: procurando a receita do kit (tabelas de INSUMOS/estrutura)…");
  const out = { versao: PONTE_VERSAO, quando: new Date().toISOString(), tabelas: {}, amostras: {}, erros: [] };
  try {
    const rels = await query(db,
      "SELECT TRIM(RDB$RELATION_NAME) AS NOME FROM RDB$RELATIONS " +
      "WHERE COALESCE(RDB$SYSTEM_FLAG,0)=0 AND RDB$VIEW_BLR IS NULL AND " +
      "(RDB$RELATION_NAME LIKE '%INSUMO%' OR RDB$RELATION_NAME LIKE '%ESTRUT%' OR " +
      "RDB$RELATION_NAME LIKE '%FICHA%' OR RDB$RELATION_NAME LIKE '%RECEITA%' OR " +
      "RDB$RELATION_NAME LIKE '%COMPONENT%' OR RDB$RELATION_NAME LIKE '%COMPOS%' OR " +
      "RDB$RELATION_NAME LIKE '%MATPRIMA%' OR RDB$RELATION_NAME LIKE '%MAT_PRIMA%' OR " +
      "RDB$RELATION_NAME LIKE '%INDUSTR%' OR RDB$RELATION_NAME LIKE '%KIT%' OR " +
      "RDB$RELATION_NAME LIKE '%GRADE%') " +
      "ORDER BY RDB$RELATION_NAME");
    for (const rr of rels) {
      const nome = String(rr.NOME || "").trim(); if (!nome) continue;
      let cols = [];
      try {
        const cs = await query(db,
          "SELECT TRIM(RF.RDB$FIELD_NAME) AS CAMPO, F.RDB$FIELD_TYPE AS TIPO, F.RDB$FIELD_LENGTH AS TAM " +
          "FROM RDB$RELATION_FIELDS RF JOIN RDB$FIELDS F ON F.RDB$FIELD_NAME = RF.RDB$FIELD_SOURCE " +
          "WHERE RF.RDB$RELATION_NAME = ? ORDER BY RF.RDB$FIELD_POSITION", [nome]);
        cols = cs.map((r) => ({ campo: String(r.CAMPO || "").trim(), tipo: r.TIPO, tam: r.TAM }));
      } catch (e) { out.erros.push(`cols ${nome}: ${e.message}`); }
      out.tabelas[nome] = cols;
      const naoBlob = cols.filter((c) => Number(c.tipo) !== 261 && c.campo).map((c) => c.campo);
      if (naoBlob.length) {
        const lista = naoBlob.map((c) => '"' + c + '"').join(", ");
        try {
          const sel = "SELECT FIRST 6 " + lista + ' FROM "' + nome + '"';
          const rows = await query(db, sel);
          out.amostras[nome] = (rows || []).slice(0, 6);
        } catch (e) { out.erros.push(`amostra ${nome}: ${e.message}`); }
        // Amostra DIRIGIDA: linhas que citam "1078" (o kit QC1078-1 e seus insumos
        // KT1078-C/KT1078-P) em qualquer coluna de texto (CHAR=14, VARCHAR=37).
        const texto = cols.filter((c) => (Number(c.tipo) === 14 || Number(c.tipo) === 37) && c.campo).map((c) => c.campo);
        if (texto.length) {
          try {
            const where = texto.map((c) => '"' + c + "\" LIKE '%1078%'").join(" OR ");
            const sel2 = "SELECT FIRST 20 " + lista + ' FROM "' + nome + '" WHERE ' + where;
            const rows2 = await query(db, sel2);
            if (rows2 && rows2.length) out.amostras[nome + " (1078)"] = rows2.slice(0, 20);
          } catch (e) { out.erros.push(`amostra1078 ${nome}: ${e.message}`); }
        }
      }
    }
  } catch (e) { out.erros.push("relations: " + e.message); }
  let ok = false;
  try {
    const url = CONFIG.api.base.replace(/\/+$/, "") + "/api/integracao/diag-kit";
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token }, body: JSON.stringify(out) });
    ok = r.ok;
  } catch (e) { log("! diag-kit: falhou ao enviar —", e.message); }
  if (ok) { salvarEstado({ ...lerEstado(), [DIAG_KIT_FLAG]: true }); log(`diag-kit: enviado (${Object.keys(out.tabelas).length} tabela(s)). Não roda de novo.`); }
  else log("diag-kit: não enviou — tenta na próxima.");
}

// ── FASE 4: envia pros Syntech os pedidos da loja B2B (via procedures APP_*) ──
// Busca no worker os pedidos liberados (GET /pedidos-para-erp), e pra cada um grava
// no Firebird usando as procedures OFICIAIS (APP_PEDIDO_INSERT_V2 devolve o NUMERO;
// depois APP_ITENS_PEDIDO_INSERT e APP_CORES_PEDIDO_INSERT). Tudo numa transação:
// dá erro no meio → rollback e marca 'erro' no worker (tenta de novo depois). Entra
// como ORÇAMENTO/PENDENTE no Syntech (as SPs gravam APROV='N').
async function rodadaGravarPedidos(db) {
  const base = CONFIG.api.base.replace(/\/+$/, "");
  let lista = [];
  try {
    const r = await fetch(base + "/api/integracao/pedidos-para-erp", { headers: { "X-Integracao-Token": CONFIG.api.token } });
    if (!r.ok) return;
    const j = await r.json();
    lista = Array.isArray(j.pedidos) ? j.pedidos : [];
  } catch (e) { log("! loja→ERP: não busquei pendentes —", e.message); return; }
  if (!lista.length) return;
  log(`loja→ERP: ${lista.length} pedido(s) da loja pra gravar no Syntech`);
  for (const p of lista) {
    try {
      const numero = await gravarUmPedido(db, p);
      await fetch(base + "/api/integracao/pedido-erp-gravado", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
        body: JSON.stringify({ id: p.id, numero_erp: numero.numero, cod_cli: numero.codCli }),
      });
      log(`  ✓ pedido ${p.id} → Syntech NÚMERO ${numero.numero} (orçamento/pendente)`);
    } catch (e) {
      log(`  ! pedido ${p.id}: ${e.message}`);
      try {
        await fetch(base + "/api/integracao/pedido-erp-erro", {
          method: "POST", headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
          body: JSON.stringify({ id: p.id, erro: e.message }),
        });
      } catch { /* ignora */ }
    }
  }
}
async function gravarUmPedido(db, p) {
  // 1) COD_CLI + COD_PRAZO do cliente: usa o cache; senão procura pelo CNPJ (SP oficial).
  let codCli = p.cod_cli ? String(p.cod_cli).trim() : "";
  let codPrazo = "";
  try {
    const rs = await query(db, "SELECT CODIGO, COD_PRAZO FROM APP_CLIENTES_SEARCH(?)", [formatarDoc(p.cnpj)]);
    if (rs && rs[0]) {
      if (!codCli && rs[0].CODIGO != null) codCli = String(rs[0].CODIGO);
      if (rs[0].COD_PRAZO != null) codPrazo = String(rs[0].COD_PRAZO);
    }
  } catch (e) { /* se falhar e não tiver cache, cai no erro abaixo */ }
  if (!codCli) throw new Error("cliente não encontrado no Syntech (CNPJ " + p.cnpj + ")");

  // 2) agrupa itens por (produto, tamanho): QUANT_PED = soma das cores; resolve
  //    o COD_PROD EXATO (como está em PRODUTOS, com o TAB se houver) e o AUTOINC_TAM.
  const itens = Array.isArray(p.itens) ? p.itens : [];
  if (!itens.length) throw new Error("pedido sem itens");
  const grupos = new Map();
  for (const it of itens) {
    const ref = String(it.ref || "").trim();
    const tam = String(it.erp_tamanho || "").trim();
    const qtd = Math.trunc(Number(it.qtd) || 0);
    const preco = Number(it.valor_unit) || 0;
    const codCor = it.cod_cor;
    if (!ref || qtd <= 0) continue;
    const key = ref + "|" + tam;
    let g = grupos.get(key);
    if (!g) {
      let codExato = ref;
      try { const pr = await query(db, "SELECT CODIGO FROM PRODUTOS WHERE TRIM(CODIGO)=?", [ref]); if (pr && pr[0] && pr[0].CODIGO != null) codExato = String(pr[0].CODIGO); } catch { /* usa ref */ }
      let autoincTam = 0;
      try { const ta = await query(db, "SELECT AUTOINC FROM TAMANHO_PROD WHERE TRIM(COD_PROD)=? AND TRIM(TAMANHO)=?", [ref, tam]); if (ta && ta[0] && ta[0].AUTOINC != null) autoincTam = Number(ta[0].AUTOINC); } catch { /* 0 */ }
      g = { codExato, tam, preco, autoincTam, quant: 0, cores: [] };
      grupos.set(key, g);
    }
    g.quant += qtd;
    if (codCor != null && String(codCor) !== "") g.cores.push({ codCor: String(codCor), qtd });
  }
  if (!grupos.size) throw new Error("nenhum item válido");
  const valorTotal = [...grupos.values()].reduce((s, g) => s + g.quant * g.preco, 0);
  const hoje = dataUSA(new Date());
  // FRETE é um CÓDIGO numérico (não aceita vazio): regra Big Tricot — pedido >= R$ 3.000
  // entra CIF (0 = Emitente/Big Tricot paga); abaixo disso FOB (1 = Destinatário/cliente paga).
  const frete = valorTotal >= 3000 ? "0" : "1";

  // 3) grava TUDO numa transação (cabeçalho → itens → cores).
  const tr = await transacao(db);
  let numero;
  try {
    // APP_PEDIDO_INSERT_V2 (19 params) é SELECTABLE e devolve o NUMERO. OPCAO_PRECO='A'
    // (atacado), IMEI nulo obrigatório, NOME_APP='Loja B2B'. DESCONTO/VALOR_FRETE = 0.
    // FRETE (9º) vai com código válido (0/1) — vazio dava "Conversion error from string ''".
    const cab = await trQuery(tr,
      "SELECT NUMERO FROM app_pedido_insert_v2(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      // Campos OPCIONAIS vão como NULL (e não ""): no Firebird, "" num campo que a
      // procedure converte em número/data dá "Conversion error from string ''"; NULL não.
      [
        hoje,                          // 1  DATA (MM/DD/YYYY)
        String(valorTotal.toFixed(2)), // 2  VALOR
        hoje,                          // 3  DATA_ENTR
        String(codCli),                // 4  COD_CLI
        "Pedido Loja B2B (site)",      // 5  OBS_PED
        codPrazo || null,              // 6  COD_PRAZO (NULL se o cliente não tem prazo)
        "A",                           // 7  OPCAO_PRECO (atacado)
        null,                          // 8  GUIA
        frete,                         // 9  FRETE (0 CIF / 1 FOB)
        null,                          // 10 COD_DIG
        null,                          // 11 COD_VEND
        null,                          // 12 COD_TRANSP
        null,                          // 13 FORMA_PAGTO
        hoje,                          // 14 DATA_ALT_REG (data)
        null,                          // 15 IMEI (nulo obrigatório)
        null,                          // 16 CLASSIF_PED
        "0",                           // 17 DESCONTO
        "0",                           // 18 VALOR_FRETE
        "Loja B2B",                    // 19 NOME_APP
      ]);
    numero = cab && cab[0] ? (cab[0].NUMERO != null ? cab[0].NUMERO : cab[0].VNUMERO) : null;
    if (!numero) throw new Error("APP_PEDIDO_INSERT_V2 não devolveu o NÚMERO");
    for (const g of grupos.values()) {
      await trQuery(tr, "execute procedure app_itens_pedido_insert(?,?,?,?,?,?,?)",
        [String(numero), g.codExato, g.tam, String(g.autoincTam), String(g.quant), String(g.preco.toFixed(2)), ""]);
      for (const co of g.cores) {
        await trQuery(tr, "execute procedure app_cores_pedido_insert(?,?,?,?,?,?)",
          [String(numero), g.codExato, String(co.codCor), g.tam, String(g.autoincTam), String(co.qtd)]);
      }
    }
    await trCommit(tr);
  } catch (e) {
    await trRollback(tr);
    throw e;
  }
  return { numero, codCli };
}

// ── Fase S: espelha a tabela PRAZO (formas de pagamento) do Syntech ───────────
async function rodadaPrazos(db) {
  const base = CONFIG.api.base.replace(/\/+$/, "");
  let prazos = [];
  try {
    const rs = await query(db, "SELECT CODIGO, DESCRICAO FROM PRAZO ORDER BY CODIGO");
    prazos = (rs || []).map((r) => ({ codigo: String(r.CODIGO ?? "").trim(), descricao: String(r.DESCRICAO ?? "").trim() })).filter((p) => p.codigo);
  } catch (e) { log("! prazos: não li a tabela PRAZO —", e.message); return; }
  if (!prazos.length) return;
  try {
    await fetch(base + "/api/integracao/prazos", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
      body: JSON.stringify({ prazos }),
    });
    log(`prazos: ${prazos.length} forma(s) de pagamento sincronizada(s)`);
  } catch (e) { log("! prazos: não enviei —", e.message); }
}

// ── Fase S: cria no Syntech os clientes APROVADOS e liberados pelo gestor ──────
async function rodadaGravarClientes(db) {
  const base = CONFIG.api.base.replace(/\/+$/, "");
  let lista = [];
  try {
    const r = await fetch(base + "/api/integracao/clientes-para-erp", { headers: { "X-Integracao-Token": CONFIG.api.token } });
    if (!r.ok) return;
    const j = await r.json();
    lista = Array.isArray(j.clientes) ? j.clientes : [];
  } catch (e) { log("! clientes→ERP: não busquei pendentes —", e.message); return; }
  if (!lista.length) return;
  log(`clientes→ERP: ${lista.length} cadastro(s) da loja pra criar no Syntech`);
  for (const cli of lista) {
    try {
      const codigo = await criarUmCliente(db, cli);
      await fetch(base + "/api/integracao/cliente-erp-gravado", {
        method: "POST", headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
        body: JSON.stringify({ id: cli.id, codigo_erp: codigo }),
      });
      log(`  ✓ cliente ${cli.nome} → Syntech CÓDIGO ${codigo}`);
    } catch (e) {
      log(`  ! cliente ${cli.id} (${cli.nome}): ${e.message}`);
      try {
        await fetch(base + "/api/integracao/cliente-erp-erro", {
          method: "POST", headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
          body: JSON.stringify({ id: cli.id, erro: e.message }),
        });
      } catch { /* ignora */ }
    }
  }
}

async function criarUmCliente(db, cli) {
  const doc = formatarDoc(cli.cnpj);
  // 1) se já existe no Syntech (mesmo CNPJ), reaproveita o CÓDIGO (não duplica cliente).
  try {
    const rs = await query(db, "SELECT CODIGO FROM APP_CLIENTES_SEARCH(?)", [doc]);
    if (rs && rs[0] && rs[0].CODIGO != null && String(rs[0].CODIGO).trim() !== "") return String(rs[0].CODIGO).trim();
  } catch (e) { /* se falhar a busca, tenta inserir */ }
  // 2) monta os 21 parâmetros do APP_CLIENTES_INSERT_V2 (ordem EXATA do manual).
  const nome = String(cli.nome || "").trim().slice(0, 60) || "CLIENTE";
  const fantasia = String(cli.fantasia || cli.nome || "").trim().slice(0, 60) || nome;
  const numeroInt = (() => { const n = parseInt(String(cli.numero || "").replace(/\D/g, ""), 10); return isNaN(n) ? "0" : String(n); })();
  const simples = (() => { const s = String(cli.simples_nacional || "").trim().toUpperCase(); return (s === "S" || s === "M") ? s : ""; })();
  const cep = (() => { const d = String(cli.cep || "").replace(/\D/g, ""); return d.length === 8 ? d.slice(0, 5) + "-" + d.slice(5) : ""; })();
  const celular = String(cli.whatsapp || "").trim();           // CELULAR = WhatsApp do cadastro
  const telefone = String(cli.telefone || "").trim();
  const funcCadastro = String(CONFIG.funcCadastro != null ? CONFIG.funcCadastro : 10); // funcionário "do site"
  const codPrazo = String(cli.loja_cod_prazo || "").trim() || "1"; // 1 = à vista (padrão)
  const params = [
    nome,                                                 // 1  NOME
    fantasia,                                             // 2  FANTASIA
    doc,                                                  // 3  CNPJ_CPF (pontuado)
    String(cli.inscricao_estadual || "").trim(),          // 4  INSC_RG
    String(cli.endereco || "").trim(),                    // 5  ENDERECO
    numeroInt,                                            // 6  NUMERO (inteiro; 0 se vazio)
    String(cli.complemento || "").trim(),                 // 7  COMPL
    String(cli.bairro || "").trim(),                      // 8  BAIRRO
    cep,                                                  // 9  CEP (xxxxx-xxx)
    String(cli.cidade || "").trim(),                      // 10 CIDADE
    String(cli.uf || "").trim().toUpperCase().slice(0, 2),// 11 UF
    String(cli.email || "").trim(),                       // 12 EMAIL
    null,                                                 // 13 DATA_NASC (null: loja não coleta; '' daria erro de conversão)
    telefone,                                             // 14 TELEFONE
    celular,                                              // 15 CELULAR
    simples,                                              // 16 SIMPLES_NACIONAL (S/M/'')
    funcCadastro,                                         // 17 FUNC_CADASTRO
    "S",                                                  // 18 MALA_DIRETA
    codPrazo,                                             // 19 COD_PRAZO
    "",                                                   // 20 GUIA
    null,                                                 // 21 IMEI (nulo obrigatório)
  ];
  const rs = await query(db, "SELECT CODIGO FROM app_clientes_insert_v2(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", params);
  const codigo = rs && rs[0] && rs[0].CODIGO != null ? String(rs[0].CODIGO).trim() : "";
  if (!codigo) throw new Error("APP_CLIENTES_INSERT_V2 não devolveu CODIGO");
  return codigo;
}

// ── uma rodada: busca aprovados que mudaram desde a última data e envia ───────
// ── Representantes (GUIAS) → sistema ─────────────────────────────────────────────
// Lê a tabela GUIAS do Syntech (o "Cadastro de Representantes") e manda a lista pro
// sistema, que liga tudo pelo CÓDIGO (nunca mais por nome). Tabela pequena: manda
// inteira toda rodada (o servidor é idempotente). Nunca apaga nada no ERP — só lê.
async function rodadaRepresentantes(db) {
  let linhas;
  try {
    linhas = await query(db,
      `SELECT CODIGO, NOME, FANTASIA, CPF, UF, CIDADE, TELEFONE, EMAIL, COMISSAO, BLOQUEADO
         FROM GUIAS ORDER BY CODIGO`);
  } catch (e) { log("! representantes: não li GUIAS —", e.message); return; }
  const representantes = linhas.map((g) => ({
    codigo: String(g.CODIGO == null ? "" : g.CODIGO).trim(),
    fantasia: String(g.FANTASIA || "").trim(),
    nome: String(g.NOME || "").trim(),
    cpf: String(g.CPF || "").trim(),
    uf: String(g.UF || "").trim(),
    cidade: String(g.CIDADE || "").trim(),
    telefone: String(g.TELEFONE || "").trim(),
    email: String(g.EMAIL || "").trim(),
    comissao: g.COMISSAO == null ? null : Number(g.COMISSAO),
    bloqueado: g.BLOQUEADO == null ? "" : String(g.BLOQUEADO).trim(),
  })).filter((g) => g.codigo && (g.fantasia || g.nome));
  if (!representantes.length) { log("representantes: GUIAS vazia — nada a enviar"); return; }
  const url = CONFIG.api.base.replace(/\/+$/, "") + "/api/integracao/representantes";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
      body: JSON.stringify({ representantes }),
    });
    const txt = await r.text(); let js = {}; try { js = JSON.parse(txt); } catch { /* não-JSON */ }
    if (r.ok) log(`representantes: ${representantes.length} enviado(s) ✓ (com código no sistema: ${js.com_codigo != null ? js.com_codigo : "?"})`);
    else log(`representantes: FALHOU (${r.status}) ${txt.slice(0, 160)}`);
  } catch (e) { log("! representantes: erro ao enviar —", e.message); }
}

// ── Carteira por código (CLIENTES.GUIA) → sistema ───────────────────────────────
// Manda, pra cada cliente, o código do representante dele no Syntech (CLIENTES.GUIA).
// O sistema grava em clientes.rep_codigo e passa a contar a carteira por código —
// independente da grafia do nome. Só lê; nunca escreve no ERP.
async function rodadaCarteira(db) {
  let linhas;
  try {
    linhas = await query(db,
      "SELECT CODIGO, GUIA FROM CLIENTES WHERE GUIA IS NOT NULL AND TRIM(GUIA) <> '' AND TRIM(GUIA) <> '0'");
  } catch (e) { log("! carteira: não li CLIENTES.GUIA —", e.message); return; }
  const mapa = linhas
    .map((r) => ({ cod: String(r.CODIGO == null ? "" : r.CODIGO).trim(), guia: String(r.GUIA == null ? "" : r.GUIA).trim() }))
    .filter((m) => m.cod && m.guia && m.guia !== "0");
  if (!mapa.length) { log("carteira: nenhum cliente com representante no Syntech"); return; }
  const url = CONFIG.api.base.replace(/\/+$/, "") + "/api/integracao/carteira-codigos";
  let aplicados = 0, enviados = 0;
  for (let i = 0; i < mapa.length; i += 500) {
    const lote = mapa.slice(i, i + 500);
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
        body: JSON.stringify({ mapa: lote }),
      });
      const txt = await r.text(); let js = {}; try { js = JSON.parse(txt); } catch { /* não-JSON */ }
      if (r.ok) { enviados += lote.length; aplicados += Number(js.atualizados) || 0; }
      else { log(`carteira: lote FALHOU (${r.status}) ${txt.slice(0, 160)}`); return; }
    } catch (e) { log("! carteira: erro ao enviar lote —", e.message); return; }
  }
  log(`carteira: ${enviados} cliente(s) enviado(s) ✓ (${aplicados} atualizado(s) no sistema)`);
}

async function rodada() {
  const estado = lerEstado();
  const desde = estado.ultimaAlt || (CONFIG.desde ? `${CONFIG.desde} 00:00:00` : "1900-01-01 00:00:00");
  let db;
  try {
    db = await conectar();
  } catch (e) {
    log("! não conectou no Firebird:", e.message);
    return;
  }
  try {
    // Diagnóstico da estrutura do banco (roda só uma vez; não trava a rodada).
    try { await rodadaDiagnostico(db, estado); } catch (e) { log("! diagnóstico:", e.message); }
    // Confirmação leve das procedures APP_* (Fase 4; roda só uma vez).
    try { await rodadaDiagProcs(db, estado); } catch (e) { log("! diag-procs:", e.message); }
    // Descobre a receita do kit (tabelas com KIT; roda só uma vez).
    try { await rodadaDiagKit(db, estado); } catch (e) { log("! diag-kit:", e.message); }
    // Envia pros Syntech os pedidos da loja B2B liberados (Fase 4).
    try { await rodadaGravarPedidos(db); } catch (e) { log("! loja→ERP:", e.message); }
    // Espelha as formas de pagamento (PRAZO) e cria os clientes aprovados no Syntech (Fase S).
    try { await rodadaPrazos(db); } catch (e) { log("! prazos:", e.message); }
    try { await rodadaGravarClientes(db); } catch (e) { log("! clientes→ERP:", e.message); }
    // Pedidos APROVADOS, não cancelados, alterados depois da última vez.
    const SQL_PEDIDOS =
      `SELECT NUMERO, DATA, COD_CLI, STATUS, CANC, DATA_ALT_REG
         FROM PEDIDO
        WHERE STATUS = ? AND COALESCE(CANC, 'N') <> 'S' AND DATA_ALT_REG > ?
        ORDER BY DATA_ALT_REG`;
    const pedidos = await query(db, SQL_PEDIDOS, [STATUS_APROVADO, desde]);
    if (!pedidos.length) { log(`sem pedidos novos (desde ${desde})`); await rodadaRepresentantes(db); await rodadaCarteira(db); await rodadaProdutos(db, estado); await rodadaEstoque(db); await rodadaKits(db); return; }

    log(`${pedidos.length} pedido(s) aprovado(s) novo(s)/alterado(s)`);
    let maiorAlt = estado.ultimaAlt || null;
    for (const ped of pedidos) {
      try {
        await processarPedido(db, ped);
      } catch (e) {
        log(`  pedido ${ped.NUMERO}: erro ao processar — ${e.message}`);
        continue; // não avança a marca d'água se der erro (tenta de novo na próxima)
      }
      const alt = ped.DATA_ALT_REG instanceof Date ? ped.DATA_ALT_REG.toISOString() : String(ped.DATA_ALT_REG);
      if (!maiorAlt || alt > maiorAlt) maiorAlt = alt;
      // avança a marca d'água item a item (assim um erro no meio não reprocessa os já enviados)
      salvarEstado({ ...estado, ultimaAlt: formatarParaFirebird(ped.DATA_ALT_REG) });
    }
    log("rodada ok. última data:", formatarParaFirebird(maiorAlt));
    await rodadaRepresentantes(db);
    await rodadaCarteira(db);
    await rodadaProdutos(db, estado);
    await rodadaEstoque(db);
    await rodadaKits(db);
  } catch (e) {
    log("! erro na rodada:", e.message);
  } finally {
    try { db.detach(); } catch { /* ok */ }
  }
}

// Firebird compara TIMESTAMP como texto 'YYYY-MM-DD HH:MM:SS'.
// Usamos UTC pra bater com o valor que o node-firebird devolve (senão a marca
// d'água fica deslocada no fuso e o produto é reenviado toda rodada).
function formatarParaFirebird(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "1900-01-01 00:00:00";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

async function main() {
  log(`Ponte Tecelagem iniciada (v${PONTE_VERSAO}).`, UMA_VEZ ? "(modo --once)" : `(a cada ${INTERVALO / 1000}s)`);
  const atualizou = await autoAtualizar();
  if (atualizou && UMA_VEZ) return; // baixou versão nova: não roda o código velho; sai limpo (timer cuida)
  await rodada();
  if (UMA_VEZ) { log("fim (--once)"); return; }
  setInterval(rodada, INTERVALO);
}

main().catch((e) => { log("! fatal:", e.message); process.exit(1); });
