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
    log0("correção de acentos aplicada (latin1)");
  } else {
    let onde = "?"; try { onde = require.resolve("node-firebird"); } catch (e) { onde = "node-firebird não encontrado: " + e.message; }
    log0("! não achei XdrReader p/ corrigir acentos — nomes podem vir quebrados. node-firebird em:", onde);
  }
} catch (e) {
  log0("! não consegui aplicar correção de acentos:", e.message);
}
function log0(...a) { console.log(new Date().toISOString(), ...a); }

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
async function enviarEstoque(itens) {
  const url = CONFIG.api.base.replace(/\/+$/, "") + "/api/integracao/estoque";
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Integracao-Token": CONFIG.api.token },
    body: JSON.stringify({ itens, full: true }),
  });
  return r.ok;
}
async function rodadaEstoque(db) {
  const sql = CONFIG.estoque && CONFIG.estoque.sql;
  if (!sql) return; // estoque desligado até o Syntech informar a tabela de saldo
  let linhas = [];
  try { linhas = await query(db, sql); }
  catch (e) { log("! estoque: consulta falhou —", e.message); return; }
  const itens = linhas.map((r) => ({
    produto: String(r.PRODUTO || "").trim(),
    ref: String(r.REF || "").trim(),
    cor: String(r.COR || "").trim(),
    tamanho: String(r.TAMANHO || "").trim(),
    saldo: Number(r.SALDO) || 0,
    unidade: String(r.UNIDADE || "").trim(),
  })).filter((x) => x.ref || x.produto);
  if (!itens.length) { log("estoque: nada a enviar"); return; }
  // envia em lotes de 500 pra não estourar o tamanho da requisição
  let enviados = 0;
  for (let i = 0; i < itens.length; i += 500) {
    const ok = await enviarEstoque(itens.slice(i, i + 500));
    if (ok) enviados += Math.min(500, itens.length - i);
  }
  log(`estoque: ${enviados}/${itens.length} saldo(s) espelhado(s)`);
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
  const repuxarTudo = !estado.acentosV2;
  const desde = (!repuxarTudo && estado.ultimaAltProd) ? estado.ultimaAltProd : inicio;
  if (repuxarTudo) log("produtos: re-puxando TUDO uma vez p/ corrigir acentos…");
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
    // tamanhos do produto — prefere a MEDIDA real (DETALHE, ex.: 45X45); cai no código se não houver
    let tamanhos = [];
    try {
      let tm;
      try { tm = await query(db, "SELECT TAMANHO, DETALHE FROM TAMANHO_PROD WHERE COD_PROD = ?", [ref]); }
      catch { tm = await query(db, "SELECT TAMANHO FROM TAMANHO_PROD WHERE COD_PROD = ?", [ref]); }
      tamanhos = tm.map((r) => String((r.DETALHE != null && String(r.DETALHE).trim()) || r.TAMANHO || "").trim()).filter(Boolean);
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
  if (todasOk && maiorAlt) salvarEstado({ ...lerEstado(), ultimaAltProd: maiorAlt, acentosV2: true });
  log(`produtos: ${enviados}/${lote.length} enviado(s).` + (todasOk ? ` última alteração: ${maiorAlt}` : " (envio incompleto — tentarei de novo na próxima rodada)"));
}

// ── uma rodada: busca aprovados que mudaram desde a última data e envia ───────
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
    // Pedidos APROVADOS, não cancelados, alterados depois da última vez.
    const SQL_PEDIDOS =
      `SELECT NUMERO, DATA, COD_CLI, STATUS, CANC, DATA_ALT_REG
         FROM PEDIDO
        WHERE STATUS = ? AND COALESCE(CANC, 'N') <> 'S' AND DATA_ALT_REG > ?
        ORDER BY DATA_ALT_REG`;
    const pedidos = await query(db, SQL_PEDIDOS, [STATUS_APROVADO, desde]);
    if (!pedidos.length) { log(`sem pedidos novos (desde ${desde})`); await rodadaProdutos(db, estado); await rodadaEstoque(db); return; }

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
    await rodadaProdutos(db, estado);
    await rodadaEstoque(db);
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
  log("Ponte Tecelagem iniciada.", UMA_VEZ ? "(modo --once)" : `(a cada ${INTERVALO / 1000}s)`);
  await rodada();
  if (UMA_VEZ) { log("fim (--once)"); return; }
  setInterval(rodada, INTERVALO);
}

main().catch((e) => { log("! fatal:", e.message); process.exit(1); });
