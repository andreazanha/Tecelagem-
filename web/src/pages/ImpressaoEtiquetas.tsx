import { useEffect, useMemo, useState } from "react";
import { api, type Pedido } from "../api";

type Etq = { cliente: string; modelo: string; tamanho: string | null; cor: string | null; composicao: string | null };

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
function carregarPresets(): { nome: string; cfg: EtqCfg }[] {
  try { const s = localStorage.getItem(PRESETS_KEY); if (s) return JSON.parse(s); } catch { /* ignore */ }
  return [];
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
function conteudoEt(e: Etq): string {
  const comp = e.composicao ? ` · ${e.composicao}` : "";
  return `<div class="top"><span class="mod">${e.modelo || ""}</span><span class="tam">${e.tamanho || "—"}</span></div>
    <div class="mid">Cor: <b>${e.cor || "—"}</b><span class="comp">${comp}</span></div>
    <div class="cli">${e.cliente || ""}</div>`;
}

export function ImpressaoEtiquetas() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [rows, setRows] = useState<{ cliente: string; modelo: string; tamanho: string | null; cor: string | null; qtd: number; composicao: string | null }[]>([]);
  const [cfg, setCfg] = useState<EtqCfg>(carregarCfg);
  const [presets, setPresets] = useState<{ nome: string; cfg: EtqCfg }[]>(carregarPresets);
  const [carregando, setCarregando] = useState(false);

  const todosPresets = [...PRESETS_FIXOS, ...presets];
  function aplicarPreset(nome: string) { const p = todosPresets.find((x) => x.nome === nome); if (p) setCfg({ ...p.cfg }); }
  function salvarPreset() {
    const nome = prompt("Nome do modelo de etiqueta (ex.: minha etiqueta pequena):");
    const n = (nome || "").trim(); if (!n) return;
    const novos = [...presets.filter((p) => p.nome !== n), { nome: n, cfg: { ...cfg } }];
    setPresets(novos); try { localStorage.setItem(PRESETS_KEY, JSON.stringify(novos)); } catch { /* ignore */ }
    alert(`Modelo "${n}" salvo.`);
  }
  function excluirPreset(nome: string) {
    if (!confirm(`Excluir o modelo "${nome}"?`)) return;
    const novos = presets.filter((p) => p.nome !== nome);
    setPresets(novos); try { localStorage.setItem(PRESETS_KEY, JSON.stringify(novos)); } catch { /* ignore */ }
  }

  useEffect(() => { api.listarPedidos().then(setPedidos).catch(() => {}); }, []);
  useEffect(() => {
    if (!sel.length) { setRows([]); return; }
    setCarregando(true);
    api.etiquetasPedidos(sel).then(setRows).catch(() => setRows([])).finally(() => setCarregando(false));
  }, [sel]);
  useEffect(() => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ } }, [cfg]);

  const etqs = useMemo<Etq[]>(() => {
    const out: Etq[] = [];
    for (const r of rows) for (let i = 0; i < Math.max(0, Math.trunc(r.qtd)); i++)
      out.push({ cliente: r.cliente, modelo: r.modelo, tamanho: r.tamanho, cor: r.cor, composicao: r.composicao });
    return out;
  }, [rows]);

  const setC = (k: keyof EtqCfg, v: string) => setCfg((c) => ({ ...c, [k]: Math.max(0, Number(v.replace(",", ".")) || 0) }));
  const pag = PAG[cfg.pagina] || PAG.A4;
  const porPagina = Math.max(1, cfg.colunas * cfg.linhas);
  const paginas = Math.max(1, Math.ceil(etqs.length / porPagina));
  const label = (p: Pedido) => `${p.numero_erp || p.codigo_pai || p.id.slice(0, 6)} · ${p.cliente_nome}`;

  // CSS comum da etiqueta (prévia e impressão), com a fonte configurável.
  // Disposição horizontal: linha de topo com modelo (esq.) e tamanho (dir.).
  const cssEt = `.et{position:absolute;overflow:hidden;box-sizing:border-box;padding:1.4mm 2.2mm;display:flex;flex-direction:column;justify-content:center;gap:0.5mm;font-family:Arial,Helvetica,sans-serif;border:0.2mm solid #000;border-radius:1mm}
    .top{display:flex;justify-content:space-between;align-items:baseline;gap:2mm}
    .mod{font-size:${(cfg.fonte * 1.35).toFixed(1)}pt;font-weight:800;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tam{font-size:${(cfg.fonte * 1.05).toFixed(1)}pt;font-weight:700;color:#111;white-space:nowrap;flex:none}
    .mid{font-size:${cfg.fonte}pt;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mid .comp{color:#555;font-weight:400}
    .cli{font-size:${(cfg.fonte * 0.82).toFixed(1)}pt;color:#555;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;

  function imprimir() {
    let body = "";
    for (let pg = 0; pg < paginas; pg++) {
      let labels = "";
      for (let k = 0; k < porPagina; k++) {
        const idx = pg * porPagina + k; if (idx >= etqs.length) break;
        const col = k % cfg.colunas, row = Math.floor(k / cfg.colunas);
        const x = cfg.margemEsq + col * (cfg.larguraEt + cfg.gapH);
        const y = cfg.margemTopo + row * (cfg.alturaEt + cfg.gapV);
        labels += `<div class="et" style="left:${x}mm;top:${y}mm;width:${cfg.larguraEt}mm;height:${cfg.alturaEt}mm">${conteudoEt(etqs[idx])}</div>`;
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
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} disabled={etqs.length === 0} onClick={imprimir}>🖨️ Imprimir</button>
        </div>
        {sel.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {sel.map((id) => { const p = pedidos.find((x) => x.id === id); return (
              <span key={id} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{p ? label(p) : id}
                <button className="icon-btn" title="Tirar" style={{ padding: 0, lineHeight: 1 }} onClick={() => setSel((s) => s.filter((x) => x !== id))}>✕</button></span>
            ); })}
          </div>
        )}
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          {carregando ? "Carregando…" : sel.length === 0 ? "Escolha um ou mais pedidos. Pronta entrega fica de fora." : <>Peças de produção: <strong>{etqs.length}</strong> etiqueta(s) · <strong>{paginas}</strong> folha(s) {cfg.pagina === "carta" ? "Carta" : "A4"} ({porPagina} por folha).</>}
        </p>
      </div>

      {/* Configuração da folha de etiquetas (em mm) */}
      <div className="card pad" style={{ marginTop: 14 }}>
        <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <strong>⚙️ Configuração da etiqueta</strong>
          <span className="muted" style={{ fontSize: 12.5 }}>Medidas em mm. Salva automático.</span>
        </div>
        <div className="row-gap" style={{ alignItems: "flex-end", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
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
          <button className="btn btn-soft" onClick={salvarPreset}>💾 Salvar como modelo</button>
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
              <input type="number" min={0} step={c.step ?? 0.5} value={String(cfg[c.k])} onChange={(e) => setC(c.k, e.target.value)} />
            </label>
          ))}
        </div>
      </div>

      {/* Prévia da 1ª folha (proporcional ao tamanho escolhido) */}
      <div style={{ marginTop: 16 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Prévia da folha {cfg.pagina === "carta" ? "Carta" : "A4"} (1ª de {paginas}):</div>
        <div className="a4-folha" style={{ padding: 0, position: "relative", aspectRatio: `${pag.w} / ${pag.h}` }}>
          {(etqs.length ? etqs : Array.from({ length: porPagina }, () => ({ cliente: "Cliente", modelo: "(etiqueta)", tamanho: "", cor: "", composicao: "" } as Etq))).slice(0, porPagina).map((e, k) => {
            const col = k % cfg.colunas, row = Math.floor(k / cfg.colunas);
            const x = cfg.margemEsq + col * (cfg.larguraEt + cfg.gapH);
            const y = cfg.margemTopo + row * (cfg.alturaEt + cfg.gapV);
            return (
              <div key={k} className="a4-et" style={{ position: "absolute", left: pct(x, pag.w) + "%", top: pct(y, pag.h) + "%", width: pct(cfg.larguraEt, pag.w) + "%", height: pct(cfg.alturaEt, pag.h) + "%", overflow: "hidden" }}>
                <div className="a4-top"><span className="a4-mod">{e.modelo}</span><span className="a4-tam">{e.tamanho || "—"}</span></div>
                <div className="a4-lin">Cor: <b>{e.cor || "—"}</b>{e.composicao ? <span style={{ color: "#55555e" }}> · {e.composicao}</span> : ""}</div>
                <div className="a4-cli">{e.cliente}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
