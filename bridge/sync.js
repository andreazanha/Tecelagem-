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
    if (!pedidos.length) { log(`sem novidades (desde ${desde})`); return; }

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
  } catch (e) {
    log("! erro na rodada:", e.message);
  } finally {
    try { db.detach(); } catch { /* ok */ }
  }
}

// Firebird compara TIMESTAMP como texto 'YYYY-MM-DD HH:MM:SS'.
function formatarParaFirebird(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "1900-01-01 00:00:00";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function main() {
  log("Ponte Tecelagem iniciada.", UMA_VEZ ? "(modo --once)" : `(a cada ${INTERVALO / 1000}s)`);
  await rodada();
  if (UMA_VEZ) { log("fim (--once)"); return; }
  setInterval(rodada, INTERVALO);
}

main().catch((e) => { log("! fatal:", e.message); process.exit(1); });
