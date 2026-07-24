import { Fragment, useEffect, useMemo, useState } from "react";
import { api, type Pedido } from "../api";

type Etq = { cliente: string; modelo: string; tamanho: string | null; cor: string | null; composicao: string | null; kit?: boolean };

// Configuração da folha de etiquetas (tudo em milímetros). Casa com as folhas
// de etiqueta adesiva comuns (tipo Pimaco): tamanho da folha + margem + tamanho
// da etiqueta + espaçamento + nº de colunas/linhas por página.
type Pagina = "A4" | "carta";
// Dimensões da folha (mm) e o valor CSS de @page size.
const PAG: Record<Pagina, { w: number; h: number; css: string; nome: string }> = {
  A4: { w: 210, h: 297, css: "A4", nome: "A4 (210 × 297 mm)" },
  carta: { w: 216, h: 279, css: "letter", nome: "Carta / Letter (216 × 279 mm)" },
};
type EtqCfg = { pagina: Pagina; margemTopo: number; margemEsq: number; larguraEt: number; alturaEt: number; gapH: number; gapV: number; colunas: number; linhas: number; fonte: number };
// Padrão = Pimaco 6180 (folha Carta, 66,7 × 25,4 mm, 3 × 10 = 30 etiquetas).
const CFG_PADRAO: EtqCfg = { pagina: "carta", margemTopo: 12.7, margemEsq: 4.8, larguraEt: 66.7, alturaEt: 25.4, gapH: 3.2, gapV: 0, colunas: 3, linhas: 10, fonte: 8 };
const CFG_KEY = "etq-cfg";
const PRESETS_KEY = "etq-presets"; // modelos salvos pelo usuário
// Modelos prontos (medidas oficiais aproximadas — ajuste fino no print de teste).
const PRESETS_FIXOS: { nome: string; cfg: EtqCfg }[] = [
  { nome: "Pimaco 6180 · 66,7 × 25,4 mm (Carta · 3 × 10 = 30)", cfg: { ...CFG_PADRAO } },
  { nome: "Pimaco A4251 · 38,2 × 21,2 mm (A4 · 5 × 13 = 65)", cfg: { pagina: "A4", margemTopo: 10.8, margemEsq: 9.8, larguraEt: 38.2, alturaEt: 21.2, gapH: 0, gapV: 0, colunas: 5, linhas: 13, fonte: 6 } },
];
function carregarCfg(): EtqCfg {
  try { const s = localStorage.getItem(CFG_KEY); if (s) return { ...CFG_PADRAO, ...JSON.parse(s) }; } catch { /* ignore */ }
  return { ...CFG_PADRAO };
}

const CAMPOS: { k: keyof EtqCfg; label: string; step?: number }[] = [
  { k: "colunas", label: "Colunas", step: 1 }, { k: "linhas", label: "Linhas por página", step: 1 },
  { k: "larguraEt", label: "Largura da etiqueta (mm)" }, { k: "alturaEt", label: "Altura da etiqueta (mm)" },
  { k: "margemEsq", label: "Margem esquerda (mm)" }, { k: "margemTopo", label: "Margem superior (mm)" },
  { k: "gapH", label: "Espaço horizontal (mm)" }, { k: "gapV", label: "Espaço vertical (mm)" },
  { k: "fonte", label: "Tamanho da fonte (pt)" },
];

// Conteúdo de uma etiqueta (HTML), reaproveitado na prévia e na impressão.
// Layout horizontal (a etiqueta 6180 é larga e baixa): modelo + tamanho na
// primeira linha; cor e composição juntas na segunda; cliente embaixo.
// Normaliza nome de modelo para casar composição: minúsculo, sem acento,
// espaços colapsados. Assim "ALMOFADA ACÁCIA" casa com "Almofada Acacia".
function normalizar(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}
// Nome do modelo em 1 linha, com o tipo abreviado.
// Ex.: "Almofada Bubbles" → "Alm: Bubbles"; "Manta Acácia" → "Man: Acácia".
function modeloLinha(modelo: string): string {
  const nome = (modelo || "").trim();
  const sp = nome.indexOf(" ");
  if (sp <= 0) return nome;
  const tipo = nome.slice(0, sp), resto = nome.slice(sp + 1);
  const low = tipo.toLowerCase();
  const abrev = low === "almofada" ? "Alm:" : low === "manta" ? "Man:" : tipo;
  return `${abrev} ${resto}`;
}
// Kit: extrai o nome ("Kora") e a composição do pacote ("70×2,20 + 2× 55×35 · c/ ench.").
function kitInfo(produto: string, tamanho: string | null): { nome: string; comp: string } {
  const p = (produto || "").replace(/^\s*KIT\s+/i, "").trim();
  const m = p.match(/^([^\s+]+)/);
  const nome = m ? m[1] : p;
  let resto = p.slice(nome.length).trim();
  const ench = /ench/i.test(resto);
  resto = resto.replace(/c\/?\s*enchimento/i, "").trim();
  let comp = `${tamanho || ""} ${resto}`.trim()
    .replace(/\+\s*(\d+)\s*-\s*/g, " + $1× ")
    .replace(/[xX]/g, "×").replace(/\./g, ",").replace(/\s+/g, " ").trim();
  if (ench) comp += " · c/ ench.";
  return { nome, comp };
}
// Título-caso simples: "KORA" → "Kora", "BELLA VIDA" → "Bella Vida".
function cap(s: string): string {
  return (s || "").toLowerCase().replace(/\b\p{L}/gu, (m) => m.toUpperCase());
}
// Formata medida do kit: "70X2.20" → "70×2,20".
function fmtMedida(s: string): string {
  return (s || "").replace(/[xX]/g, "×").replace(/\./g, ",").trim();
}
// Tipo da peça principal pela largura (mesma regra da produção, classificar.ts):
// ≤75 cm → Peseira; acima → Manta; pequena (≤60×60) → Almofada. Aceita medida
// em metros (n < 10 vira cm, ex.: 2,20 → 220).
function tipoPrincipal(tamanho: string): string {
  const m = (tamanho || "").toUpperCase().replace(/\s/g, "").match(/^([\d.,]+)X([\d.,]+)/);
  if (!m) return "Peça";
  const cm = (x: string) => { const n = parseFloat(x.replace(",", ".")); return n < 10 ? Math.round(n * 100) : Math.round(n); };
  const W = cm(m[1]), H = cm(m[2]);
  if (W <= 60 && H <= 60) return "Almofada";
  if (W <= 75) return "Peseira";
  return "Manta";
}
// Peças de um kit = 1 principal (peseira/manta, tamanho no campo tamanho) +
// N almofadas descritas no nome como "+2-55X35". Kit VAZIO (só a capa) vem
// marcado com "CAPA" no nome → "Capa"; kit CHEIO (c/ enchimento) → "Almofada".
// Mesma leitura da produção (classificar.ts › composicaoKit).
function kitPecas(produto: string, tamanho: string | null): { tipo: string; tamanho: string }[] {
  const nome = (produto || "").toUpperCase();
  const pecas: { tipo: string; tamanho: string }[] = [];
  const mainSize = (tamanho || "").trim();
  if (mainSize) pecas.push({ tipo: tipoPrincipal(mainSize), tamanho: fmtMedida(mainSize) });
  const count = parseInt(nome.match(/\+\s*(\d+)/)?.[1] || "0", 10);
  const almSize = (nome.match(/\+\s*\d+\s*-?\s*(\d[\d.,]*\s*X\s*\d[\d.,]*)/i)?.[1] || "").replace(/\s+/g, "");
  const almTipo = /\bCAPA\b/.test(nome) ? "Capa" : "Almofada"; // vazio = capa; cheio = almofada
  if (almSize && count) for (let i = 0; i < count; i++) pecas.push({ tipo: almTipo, tamanho: fmtMedida(almSize) });
  return pecas.length ? pecas : [{ tipo: "Peça", tamanho: fmtMedida(mainSize) }];
}
function conteudoEt(e: Etq): string {
  if (e.kit) {
    // Cada etiqueta do kit é uma peça (peseira/manta ou almofada): modelo em
    // cima, tipo+tamanho da peça em destaque, cor + composição, cliente.
    const comp = e.composicao ? ` · ${e.composicao}` : "";
    return `<div class="mod">${e.modelo}</div>
      <div class="lin"><b>${e.tamanho || "—"}</b></div>
      <div class="lin">Cor: <b>${e.cor || "—"}</b><span class="comp">${comp}</span></div>
      <div class="cli">${e.cliente || ""}</div>`;
  }
  const comp = e.composicao ? ` · ${e.composicao}` : "";
  const mod = `<div class="mod">${modeloLinha(e.modelo)}</div>`;
  return `${mod}
    <div class="lin">Tam: <b>${e.tamanho || "—"}</b><span class="comp">${comp}</span></div>
    <div class="lin">Cor: <b>${e.cor || "—"}</b></div>
    <div class="cli">${e.cliente || ""}</div>`;
}

export function ImpressaoEtiquetas() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  type Row = { pedido: string | null; pedido_id: string; cliente: string; modelo: string; tamanho: string | null; cor: string | null; qtd: number; composicao: string | null; kit: boolean };
  const [rowsDb, setRowsDb] = useState<Row[]>([]);   // vindos de pedidos salvos
  const [rowsPdf, setRowsPdf] = useState<Row[]>([]); // vindos de PDF aberto (teste)
  const [pdfsAbertos, setPdfsAbertos] = useState<{ id: string; nome: string }[]>([]);
  const [importando, setImportando] = useState(false);
  const [compMap, setCompMap] = useState<Record<string, string>>({}); // composição por modelo (minúsculo)
  // Composição usada quando o cadastro do modelo não tiver uma (ex.: sistema em construção).
  const [composicaoPadrao, setComposicaoPadrao] = useState<string>(() => { try { return localStorage.getItem("etq-comp") ?? "100% Poliéster"; } catch { return "100% Poliéster"; } });
  const rows = useMemo<Row[]>(() => [...rowsDb, ...rowsPdf], [rowsDb, rowsPdf]);
  // Edição por linha: quantidade a imprimir e se entra na impressão (reimpressão).
  const [linhas, setLinhas] = useState<{ qtd: number; incluir: boolean }[]>([]);
  const [cfg, setCfg] = useState<EtqCfg>(carregarCfg);
  const [presets, setPresets] = useState<{ nome: string; cfg: EtqCfg }[]>([]);
  const [carregando, setCarregando] = useState(false);
  // Para reaproveitar folha meio usada: pular as primeiras (inicio-1) etiquetas.
  const [inicio, setInicio] = useState(1);
  const [modalSalvar, setModalSalvar] = useState(false); // diálogo "salvar modelo"
  const [novoNome, setNovoNome] = useState("");
  const [incluirKits, setIncluirKits] = useState(false); // por padrão os kits ficam de fora

  const todosPresets = [...PRESETS_FIXOS, ...presets];
  function aplicarPreset(nome: string) { const p = todosPresets.find((x) => x.nome === nome); if (p) setCfg({ ...p.cfg }); }
  async function recarregarPresets() {
    try { const srv = await api.listarPresetsEtiqueta(); setPresets(srv.map((p) => ({ nome: p.nome, cfg: p.cfg as unknown as EtqCfg }))); return srv; } catch { return null; }
  }
  async function gravarPreset(n: string) {
    const nome = n.trim(); if (!nome) return;
    try { await api.salvarPresetEtiqueta(nome, cfg); await recarregarPresets(); setModalSalvar(false); setNovoNome(""); alert(`Modelo "${nome}" salvo.`); }
    catch { alert("Não consegui salvar o modelo no servidor."); }
  }
  function salvarPorCima(nome: string) {
    if (!confirm(`Salvar a configuração atual por cima de "${nome}"?`)) return;
    gravarPreset(nome);
  }
  async function excluirPreset(nome: string) {
    if (!confirm(`Excluir o modelo "${nome}"?`)) return;
    try { await api.excluirPresetEtiqueta(nome); await recarregarPresets(); } catch { alert("Não consegui excluir."); }
  }

  useEffect(() => { api.listarPedidos().then(setPedidos).catch(() => {}); }, []);
  // Carrega modelos salvos do servidor; migra os que estavam só no navegador (uma vez).
  useEffect(() => {
    (async () => {
      let locais: { nome: string; cfg: EtqCfg }[] = [];
      try { const s = localStorage.getItem(PRESETS_KEY); if (s) locais = JSON.parse(s); } catch { /* ignore */ }
      if (locais.length) {
        for (const p of locais) { try { await api.salvarPresetEtiqueta(p.nome, p.cfg); } catch { /* ignore */ } }
        const srv = await recarregarPresets();
        if (srv && locais.every((p) => srv.some((s) => s.nome === p.nome))) { try { localStorage.removeItem(PRESETS_KEY); } catch { /* ignore */ } }
        return;
      }
      recarregarPresets();
    })();
  }, []);
  // Mapa de composição por modelo (para preencher etiquetas de PDF aberto).
  useEffect(() => {
    api.listarModelos().then((ms) => {
      const m: Record<string, string> = {};
      for (const x of ms) if (x.nome && x.composicao) m[normalizar(x.nome)] = x.composicao;
      setCompMap(m);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!sel.length) { setRowsDb([]); return; }
    setCarregando(true);
    api.etiquetasPedidos(sel).then((rs) => setRowsDb(rs.map((r) => ({ ...r, kit: !!r.kit })))).catch(() => setRowsDb([])).finally(() => setCarregando(false));
  }, [sel]);

  // Abre um PDF de pedido (sem salvar) e adiciona as etiquetas para teste.
  async function abrirPdf(file: File) {
    setImportando(true);
    try {
      const sug = await api.importarPedidoPdf(file);
      const pid = "pdf:" + file.name + ":" + (sug.numero_erp || "") + ":" + pdfsAbertos.length;
      const cliente = sug.cliente_nome || file.name.replace(/\.pdf$/i, "");
      // Importa tudo (kits inclusos com a marca kit); a exibição decide o que entra.
      const novas: Row[] = (sug.itens || [])
        .filter((it) => Math.trunc(it.qtd) > 0)
        .map((it) => ({ pedido: sug.numero_erp || file.name, pedido_id: pid, cliente, modelo: it.produto, tamanho: it.tamanho || null, cor: it.cor_grade || null, qtd: Math.trunc(it.qtd), composicao: null, kit: it.parte === "kit" }));
      if (!novas.length) { alert("Não achei itens de produção nesse PDF (ou só tem pronta entrega)."); return; }
      setRowsPdf((r) => [...r, ...novas]);
      setPdfsAbertos((p) => [...p, { id: pid, nome: sug.numero_erp ? `${sug.numero_erp} · ${cliente}` : file.name }]);
    } catch {
      alert("Não consegui ler esse PDF. Confira se é um PDF de pedido do sistema.");
    } finally {
      setImportando(false);
    }
  }
  function tirarPdf(id: string) {
    setRowsPdf((r) => r.filter((x) => x.pedido_id !== id));
    setPdfsAbertos((p) => p.filter((x) => x.id !== id));
  }
  useEffect(() => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ } }, [cfg]);
  useEffect(() => { try { localStorage.setItem("etq-comp", composicaoPadrao); } catch { /* ignore */ } }, [composicaoPadrao]);
  // Ao trocar de pedidos, reinicia a edição (tudo marcado, quantidade do pedido).
  useEffect(() => { setLinhas(rows.map((r) => ({ qtd: Math.max(0, Math.trunc(r.qtd)), incluir: true }))); }, [rows]);

  const setC = (k: keyof EtqCfg, v: string) => setCfg((c) => ({ ...c, [k]: Math.max(0, Number(v.replace(",", ".")) || 0) }));
  const pag = PAG[cfg.pagina] || PAG.A4;
  const porPagina = Math.max(1, cfg.colunas * cfg.linhas);
  // Pula espaços já usados na 1ª folha (reaproveitar folha meio usada).
  const offset = Math.min(porPagina - 1, Math.max(0, Math.trunc(inicio) - 1));

  // Ordem dos pedidos = ordem em que foram adicionados.
  const ordemPedidos = useMemo(() => {
    const o = sel.slice();
    for (const r of rows) if (!o.includes(r.pedido_id)) o.push(r.pedido_id);
    return o.filter((pid) => rows.some((r) => r.pedido_id === pid));
  }, [sel, rows]);

  // Células da folha: mesmo modelo junto (já vem ordenado do backend). Os
  // pedidos entram um após o outro, sem carreira em branco entre eles.
  const cells = useMemo<(Etq | null)[]>(() => {
    const compFallback = composicaoPadrao.trim() || null;
    // Composição pelo cadastro. Tolerante a acento/caixa/tamanho e ao TIPO no
    // começo: o pedido vem "ALMOFADA BALI" mas o cadastro é só "Bali".
    const entradas = Object.entries(compMap);
    const compDoCadastro = (modelo: string): string | null => {
      const b = normalizar(modelo);
      if (!b) return null;
      const semTipo = b.includes(" ") ? b.slice(b.indexOf(" ") + 1) : b; // tira "Almofada/Manta/Pes"
      if (compMap[b]) return compMap[b];
      if (compMap[semTipo]) return compMap[semTipo];
      for (const [k, v] of entradas) {
        if (k === b || k === semTipo) return v;
        if (b.startsWith(k + " ") || k.startsWith(b + " ")) return v;              // tamanho no fim
        if (semTipo.startsWith(k + " ") || k.startsWith(semTipo + " ")) return v;  // nome + tamanho
      }
      return null;
    };
    const out: (Etq | null)[] = [];
    for (const pid of ordemPedidos) {
      rows.forEach((r, i) => {
        if (r.pedido_id !== pid) return;
        if (r.kit && !incluirKits) return; // kits só quando marcado "Incluir kits"
        const ln = linhas[i] ?? { qtd: Math.trunc(r.qtd), incluir: true };
        if (!ln.incluir) return;
        const composicao = r.composicao || compDoCadastro(r.kit ? kitInfo(r.modelo, r.tamanho).nome : r.modelo) || compFallback;
        const qtd = Math.max(0, Math.trunc(ln.qtd));
        if (r.kit) {
          // Cada kit vira 3 etiquetas: 1 peça principal (peseira/manta) + 2 almofadas.
          const nome = "Kit " + cap(kitInfo(r.modelo, r.tamanho).nome);
          const pecas = kitPecas(r.modelo, r.tamanho);
          for (let n = 0; n < qtd; n++)
            for (const pc of pecas)
              out.push({ cliente: r.cliente, modelo: nome, tamanho: `${pc.tipo} ${pc.tamanho}`.trim(), cor: r.cor, composicao, kit: true });
        } else {
          for (let n = 0; n < qtd; n++)
            out.push({ cliente: r.cliente, modelo: r.modelo, tamanho: r.tamanho, cor: r.cor, composicao, kit: false });
        }
      });
    }
    return out;
  }, [rows, linhas, ordemPedidos, composicaoPadrao, compMap, incluirKits]);

  const etqs = useMemo(() => cells.filter(Boolean) as Etq[], [cells]);
  // Células finais = espaços pulados (folha usada) + células (etiquetas + separadores).
  const finalCells = useMemo<(Etq | null)[]>(() => [...Array(offset).fill(null), ...cells], [offset, cells]);
  const totalCel = finalCells.length;
  const paginas = Math.max(1, Math.ceil(totalCel / porPagina));
  const usadasUltima = totalCel === 0 ? 0 : (totalCel % porPagina === 0 ? porPagina : totalCel % porPagina);
  const sobra = totalCel === 0 ? porPagina : porPagina - usadasUltima; // espaços vazios na última folha
  const label = (p: Pedido) => `${p.numero_erp || p.codigo_pai || p.id.slice(0, 6)} · ${p.cliente_nome}`;
  const setLinha = (i: number, patch: Partial<{ qtd: number; incluir: boolean }>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const marcarTodas = (v: boolean) => setLinhas((ls) => ls.map((l) => ({ ...l, incluir: v })));
  const temKits = rows.some((r) => r.kit);
  const qtdKits = rows.filter((r) => r.kit).reduce((s, r) => s + Math.max(0, Math.trunc(r.qtd)), 0);

  // CSS comum da etiqueta (prévia e impressão), com a fonte configurável.
  // Disposição horizontal: linha de topo com modelo (esq.) e tamanho (dir.).
  const cssEt = `.et{position:absolute;overflow:hidden;box-sizing:border-box;padding:1.4mm 2.2mm;display:flex;flex-direction:column;justify-content:center;gap:0.5mm;font-family:Arial,Helvetica,sans-serif}
    .mod{font-size:${(cfg.fonte * 1.3).toFixed(1)}pt;font-weight:800;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lin{font-size:${cfg.fonte}pt;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lin b{color:#111}
    .lin .comp{color:#555;font-weight:400}
    .cli{font-size:${(cfg.fonte * 0.82).toFixed(1)}pt;color:#555;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;

  function imprimir() {
    let body = "";
    for (let pg = 0; pg < paginas; pg++) {
      let labels = "";
      for (let k = 0; k < porPagina; k++) {
        const cel = finalCells[pg * porPagina + k]; // null = espaço em branco (pulado ou separador)
        if (!cel) continue;
        const col = k % cfg.colunas, row = Math.floor(k / cfg.colunas);
        const x = cfg.margemEsq + col * (cfg.larguraEt + cfg.gapH);
        const y = cfg.margemTopo + row * (cfg.alturaEt + cfg.gapV);
        labels += `<div class="et" style="left:${x}mm;top:${y}mm;width:${cfg.larguraEt}mm;height:${cfg.alturaEt}mm">${conteudoEt(cel)}</div>`;
      }
      body += `<div class="pg">${labels}</div>`;
    }
    const pag = PAG[cfg.pagina] || PAG.A4;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
      @page { size: ${pag.css}; margin: 0; } *{box-sizing:border-box} body{margin:0}
      .pg{position:relative;width:${pag.w}mm;height:${pag.h}mm;overflow:hidden;page-break-after:always}
      ${cssEt}
    </style></head><body>${body}<script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  // Prévia da 1ª página em A4 proporcional (posições em % da folha).
  const pct = (mm: number, total: number) => (mm / total) * 100;
  // Fonte da prévia proporcional à impressão real: cfg.fonte(pt) → mm → % da
  // largura da folha (cqw), então a prévia mostra exatamente o que cabe.
  const fpt = (mult: number) => `${(cfg.fonte * mult * 0.3528 / pag.w * 100).toFixed(3)}cqw`;

  return (
    <>
      <div className="page-head"><div><h1>Impressão de etiquetas</h1><div className="breadcrumb">Expedição › Etiquetas dos pedidos</div></div></div>

      <div className="card pad">
        <div className="row-gap" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label className="campo" style={{ minWidth: 280 }}>
            <span className="campo-label">Adicionar pedido</span>
            <select value="" onChange={(e) => { const id = e.target.value; if (id && !sel.includes(id)) setSel((s) => [...s, id]); e.currentTarget.value = ""; }}>
              <option value="">— escolha um pedido —</option>
              {pedidos.filter((p) => !sel.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
            </select>
          </label>
          <label className="campo" style={{ minWidth: 170 }} title="Para testar sem pedido salvo: abra um PDF de pedido do sistema.">
            <span className="campo-label">Ou abrir PDF (testar)</span>
            <label className="btn btn-soft" style={{ margin: 0, cursor: "pointer", textAlign: "center" }}>
              {importando ? "Lendo…" : "📂 Abrir PDF de pedido"}
              <input type="file" accept="application/pdf,.pdf" style={{ display: "none" }} disabled={importando}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) abrirPdf(f); e.currentTarget.value = ""; }} />
            </label>
          </label>
          <label className="campo" style={{ minWidth: 150 }} title="Para reaproveitar uma folha que já tem etiquetas coladas: conte os espaços já usados (esquerda→direita, cima→baixo) e comece na próxima.">
            <span className="campo-label">Começar na etiqueta nº</span>
            <input type="number" min={1} max={porPagina} step={1} value={String(inicio)} onChange={(e) => setInicio(Math.max(1, Math.min(porPagina, Math.trunc(Number(e.target.value) || 1))))} />
          </label>
          {temKits && (
            <label className="campo" style={{ minWidth: 150, cursor: "pointer" }} title="Por padrão os kits ficam de fora. Marque para gerar as etiquetas do kit: 1 da peseira/manta + 2 das almofadas.">
              <span className="campo-label">Kits</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 0" }}>
                <input type="checkbox" checked={incluirKits} onChange={(e) => setIncluirKits(e.target.checked)} /> Incluir kits ({qtdKits} → {qtdKits * 3} etq.)
              </span>
            </label>
          )}
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} disabled={etqs.length === 0} onClick={imprimir}>🖨️ Imprimir</button>
        </div>
        {(sel.length > 0 || pdfsAbertos.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {sel.map((id) => { const p = pedidos.find((x) => x.id === id); return (
              <span key={id} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{p ? label(p) : id}
                <button className="icon-btn" title="Tirar" style={{ padding: 0, lineHeight: 1 }} onClick={() => setSel((s) => s.filter((x) => x !== id))}>✕</button></span>
            ); })}
            {pdfsAbertos.map((pf) => (
              <span key={pf.id} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--accent-soft, #eef)" }}>📄 {pf.nome}
                <button className="icon-btn" title="Tirar" style={{ padding: 0, lineHeight: 1 }} onClick={() => tirarPdf(pf.id)}>✕</button></span>
            ))}
          </div>
        )}
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          {carregando || importando ? "Carregando…" : (sel.length === 0 && pdfsAbertos.length === 0) ? "Escolha um pedido salvo, ou abra um PDF de pedido para testar. Pronta entrega fica de fora." : <>Peças de produção: <strong>{etqs.length}</strong> etiqueta(s) · <strong>{paginas}</strong> folha(s) {cfg.pagina === "carta" ? "Carta" : "A4"} ({porPagina} por folha){offset > 0 && <> · pulando {offset} espaço(s) na 1ª folha</>}. {sobra > 0 ? <>Sobram <strong>{sobra}</strong> espaço(s) na última folha — adicione outro pedido pra completar e não desperdiçar.</> : <>Folha(s) cheia(s), sem sobra. 👍</>}</>}
        </p>
      </div>

      {/* Conferir / editar: mesmo modelo junto; marcar o que imprimir (reimpressão) */}
      {rows.length > 0 && (
        <div className="card pad" style={{ marginTop: 14 }}>
          <div className="row-gap" style={{ alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
            <strong>📋 Conferir / editar etiquetas</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>Mesmo modelo junto. Desmarque o que não quer e ajuste a quantidade — útil pra reimprimir só algumas.</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="btn btn-soft" style={{ padding: "6px 10px" }} onClick={() => marcarTodas(true)}>Marcar todas</button>
              <button className="btn btn-soft" style={{ padding: "6px 10px" }} onClick={() => marcarTodas(false)}>Desmarcar</button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 520 }}>
              <thead><tr><th style={{ width: 34 }}></th><th>Modelo</th><th>Tamanho</th><th>Cor</th><th className="num" style={{ width: 90 }}>Qtd</th></tr></thead>
              <tbody>
                {ordemPedidos.map((pid) => {
                  const idxs = rows.map((r, i) => ({ r, i })).filter((x) => x.r.pedido_id === pid);
                  if (!idxs.length) return null;
                  const ped = pedidos.find((p) => p.id === pid);
                  return (
                    <Fragment key={pid}>
                      <tr><td colSpan={5} style={{ background: "var(--accent-soft, #eef)", fontWeight: 700, fontSize: 12.5 }}>Pedido {ped ? label(ped) : idxs[0].r.pedido || pid.slice(0, 6)}</td></tr>
                      {idxs.map(({ r, i }) => {
                        const ln = linhas[i] ?? { qtd: Math.trunc(r.qtd), incluir: true };
                        const foraKit = r.kit && !incluirKits; // kit que não vai imprimir
                        return (
                          <tr key={i} style={{ opacity: (ln.incluir && !foraKit) ? 1 : 0.4 }} title={foraKit ? "Kit não incluído — marque 'Incluir kits' acima" : undefined}>
                            <td><input type="checkbox" checked={ln.incluir} onChange={(e) => setLinha(i, { incluir: e.target.checked })} /></td>
                            <td>{r.kit ? <>{kitInfo(r.modelo, r.tamanho).nome} <span className="chip" style={{ fontSize: 10, padding: "1px 6px", background: "var(--accent-soft, #eef)" }}>KIT</span></> : r.modelo}</td>
                            <td>{r.kit ? kitInfo(r.modelo, r.tamanho).comp : (r.tamanho || "—")}</td>
                            <td>{r.cor || "—"}</td>
                            <td className="num"><input type="number" min={0} className="w-sm" style={{ width: 66, textAlign: "right" }} value={String(ln.qtd)} onChange={(e) => setLinha(i, { qtd: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /></td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Configuração da folha de etiquetas (em mm) */}
      <div className="card pad" style={{ marginTop: 14 }}>
        <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <strong>⚙️ Configuração da etiqueta</strong>
          <span className="muted" style={{ fontSize: 12.5 }}>Medidas em mm. Salva automático.</span>
        </div>
        <div className="row-gap" style={{ alignItems: "flex-end", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <label className="campo" style={{ margin: 0, minWidth: 200 }} title="Usada quando o modelo não tem composição cadastrada.">
            <span className="campo-label">Composição padrão</span>
            <input type="text" value={composicaoPadrao} placeholder="ex.: 100% Poliéster" onChange={(e) => setComposicaoPadrao(e.target.value)} />
          </label>
          <label className="campo" style={{ margin: 0, minWidth: 220 }}>
            <span className="campo-label">Tamanho da folha</span>
            <select value={cfg.pagina} onChange={(e) => setCfg((c) => ({ ...c, pagina: e.target.value as Pagina }))}>
              {(Object.keys(PAG) as Pagina[]).map((k) => <option key={k} value={k}>{PAG[k].nome}</option>)}
            </select>
          </label>
          <label className="campo" style={{ margin: 0, minWidth: 260 }}>
            <span className="campo-label">Modelo de etiqueta</span>
            <select value="" onChange={(e) => { if (e.target.value) aplicarPreset(e.target.value); e.currentTarget.value = ""; }}>
              <option value="">— escolher um modelo salvo —</option>
              {todosPresets.map((p) => <option key={p.nome} value={p.nome}>{p.nome}</option>)}
            </select>
          </label>
          <button className="btn btn-soft" onClick={() => { setNovoNome(""); setModalSalvar(true); }}>💾 Salvar modelo</button>
          {presets.length > 0 && (
            <select className="campo" style={{ padding: "8px 10px" }} value="" onChange={(e) => { if (e.target.value) excluirPreset(e.target.value); e.currentTarget.value = ""; }}>
              <option value="">🗑 Excluir meu modelo…</option>
              {presets.map((p) => <option key={p.nome} value={p.nome}>{p.nome}</option>)}
            </select>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {CAMPOS.map((c) => (
            <label key={c.k} className="campo" style={{ margin: 0 }}>
              <span className="campo-label" style={{ fontSize: 11.5 }}>{c.label}</span>
              <input type="number" min={0} step={c.step ?? "any"} value={String(cfg[c.k])} onChange={(e) => setC(c.k, e.target.value)} />
            </label>
          ))}
        </div>
      </div>

      {/* Prévia da 1ª folha (proporcional ao tamanho escolhido) */}
      <div style={{ marginTop: 16 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Prévia da folha {cfg.pagina === "carta" ? "Carta" : "A4"} (1ª de {paginas}):</div>
        <div className="a4-folha" style={{ padding: 0, position: "relative", aspectRatio: `${pag.w} / ${pag.h}` }}>
          {Array.from({ length: porPagina }, (_, k) => {
            const col = k % cfg.colunas, row = Math.floor(k / cfg.colunas);
            const x = cfg.margemEsq + col * (cfg.larguraEt + cfg.gapH);
            const y = cfg.margemTopo + row * (cfg.alturaEt + cfg.gapV);
            const style = { position: "absolute" as const, left: pct(x, pag.w) + "%", top: pct(y, pag.h) + "%", width: pct(cfg.larguraEt, pag.w) + "%", height: pct(cfg.alturaEt, pag.h) + "%", overflow: "hidden" };
            if (etqs.length && k < offset) return <div key={k} className="a4-et a4-et-skip" style={style}>usada</div>;
            const e = etqs.length ? finalCells[k] : ({ cliente: "Cliente", modelo: "(etiqueta)", tamanho: "", cor: "", composicao: "" } as Etq);
            if (!e) return <div key={k} className="a4-et a4-et-empty" style={style}></div>;
            if (e.kit) {
              return (
                <div key={k} className="a4-et" style={{ ...style, gap: 0, justifyContent: "center" }}>
                  <div className="a4-mod" style={{ fontSize: fpt(1.3), lineHeight: 1.05 }}>{e.modelo}</div>
                  <div className="a4-lin" style={{ fontSize: fpt(1), lineHeight: 1.15 }}><b>{e.tamanho || "—"}</b></div>
                  <div className="a4-lin" style={{ fontSize: fpt(1), lineHeight: 1.15 }}>Cor: <b>{e.cor || "—"}</b>{e.composicao ? <span style={{ color: "#55555e" }}> · {e.composicao}</span> : ""}</div>
                  <div className="a4-cli" style={{ fontSize: fpt(0.82), lineHeight: 1.15 }}>{e.cliente}</div>
                </div>
              );
            }
            return (
              <div key={k} className="a4-et" style={{ ...style, gap: 0, justifyContent: "center" }}>
                <div className="a4-mod" style={{ fontSize: fpt(1.3), lineHeight: 1.05 }}>{modeloLinha(e.modelo)}</div>
                <div className="a4-lin" style={{ fontSize: fpt(1), lineHeight: 1.15 }}>Tam: <b>{e.tamanho || "—"}</b>{e.composicao ? <span style={{ color: "#55555e" }}> · {e.composicao}</span> : ""}</div>
                <div className="a4-lin" style={{ fontSize: fpt(1), lineHeight: 1.15 }}>Cor: <b>{e.cor || "—"}</b></div>
                <div className="a4-cli" style={{ fontSize: fpt(0.82), lineHeight: 1.15 }}>{e.cliente}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Diálogo: salvar modelo (novo ou por cima de um existente) */}
      {modalSalvar && (
        <div className="modal-bg" onClick={() => setModalSalvar(false)}>
          <div className="modal-card" style={{ maxWidth: 460, width: "min(460px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Salvar modelo de etiqueta</h2>
            <label className="campo" style={{ margin: 0 }}>
              <span className="campo-label">Novo modelo (dê um nome)</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="ex.: minha etiqueta A4251" style={{ flex: 1 }}
                  onKeyDown={(e) => { if (e.key === "Enter") gravarPreset(novoNome); }} />
                <button className="btn btn-primary" disabled={!novoNome.trim()} onClick={() => gravarPreset(novoNome)}>Salvar novo</button>
              </div>
            </label>
            {presets.length > 0 && (
              <>
                <p className="muted" style={{ fontSize: 13, margin: "14px 0 6px" }}>Ou clique em um modelo salvo para <strong>salvar por cima</strong>:</p>
                <div style={{ maxHeight: "42vh", overflowY: "auto", border: "1px solid var(--line)", borderRadius: 12 }}>
                  {presets.map((p) => (
                    <div key={p.nome} className="row-gap" style={{ alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid #f3f4f8", cursor: "pointer" }} onClick={() => salvarPorCima(p.nome)}>
                      <span className="strong">{p.nome}</span>
                      <button className="btn btn-soft" style={{ marginLeft: "auto", padding: "5px 12px" }} onClick={(e) => { e.stopPropagation(); salvarPorCima(p.nome); }}>Salvar aqui</button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              <button className="btn btn-soft" onClick={() => setModalSalvar(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
