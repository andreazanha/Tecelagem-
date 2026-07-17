import { Fragment, useEffect, useMemo, useState } from "react";
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
  return `<div class="mod">${e.modelo || ""}</div>
    <div class="lin">Cor: <b>${e.cor || "—"}</b></div>
    <div class="lin">Tamanho: <b>${e.tamanho || "—"}</b><span class="comp">${comp}</span></div>
    <div class="cli">${e.cliente || ""}</div>`;
}

export function ImpressaoEtiquetas() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  type Row = { pedido: string | null; pedido_id: string; cliente: string; modelo: string; tamanho: string | null; cor: string | null; qtd: number; composicao: string | null };
  const [rowsDb, setRowsDb] = useState<Row[]>([]);   // vindos de pedidos salvos
  const [rowsPdf, setRowsPdf] = useState<Row[]>([]); // vindos de PDF aberto (teste)
  const [pdfsAbertos, setPdfsAbertos] = useState<{ id: string; nome: string }[]>([]);
  const [importando, setImportando] = useState(false);
  const [compMap, setCompMap] = useState<Record<string, string>>({}); // composição por modelo (minúsculo)
  const rows = useMemo<Row[]>(() => [...rowsDb, ...rowsPdf], [rowsDb, rowsPdf]);
  // Edição por linha: quantidade a imprimir e se entra na impressão (reimpressão).
  const [linhas, setLinhas] = useState<{ qtd: number; incluir: boolean }[]>([]);
  const [cfg, setCfg] = useState<EtqCfg>(carregarCfg);
  const [presets, setPresets] = useState<{ nome: string; cfg: EtqCfg }[]>(carregarPresets);
  const [carregando, setCarregando] = useState(false);
  // Para reaproveitar folha meio usada: pular as primeiras (inicio-1) etiquetas.
  const [inicio, setInicio] = useState(1);

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
  // Mapa de composição por modelo (para preencher etiquetas de PDF aberto).
  useEffect(() => {
    api.listarModelos().then((ms) => {
      const m: Record<string, string> = {};
      for (const x of ms) if (x.nome && x.composicao) m[x.nome.trim().toLowerCase()] = x.composicao;
      setCompMap(m);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!sel.length) { setRowsDb([]); return; }
    setCarregando(true);
    api.etiquetasPedidos(sel).then(setRowsDb).catch(() => setRowsDb([])).finally(() => setCarregando(false));
  }, [sel]);

  // Abre um PDF de pedido (sem salvar) e adiciona as etiquetas para teste.
  async function abrirPdf(file: File) {
    setImportando(true);
    try {
      const sug = await api.importarPedidoPdf(file);
      const pid = "pdf:" + file.name + ":" + (sug.numero_erp || "") + ":" + pdfsAbertos.length;
      const cliente = sug.cliente_nome || file.name.replace(/\.pdf$/i, "");
      const compDe = (produto: string) => {
        const base = produto.trim().toLowerCase();
        return compMap[base] || Object.entries(compMap).find(([k]) => base.startsWith(k) || k.startsWith(base))?.[1] || null;
      };
      const novas: Row[] = (sug.itens || [])
        .filter((it) => it.parte !== "kit" && Math.trunc(it.qtd) > 0) // pronta entrega/kit fica de fora
        .map((it) => ({ pedido: sug.numero_erp || file.name, pedido_id: pid, cliente, modelo: it.produto, tamanho: it.tamanho || null, cor: it.cor_grade || null, qtd: Math.trunc(it.qtd), composicao: compDe(it.produto) }));
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

  // Células da folha: mesmo modelo junto (já vem ordenado do backend). Entre
  // pedidos diferentes, completa a carreira e pula 1 carreira em branco (null).
  const cells = useMemo<(Etq | null)[]>(() => {
    const out: (Etq | null)[] = [];
    let primeiro = true;
    for (const pid of ordemPedidos) {
      const doPedido: Etq[] = [];
      rows.forEach((r, i) => {
        if (r.pedido_id !== pid) return;
        const ln = linhas[i] ?? { qtd: Math.trunc(r.qtd), incluir: true };
        if (!ln.incluir) return;
        for (let n = 0; n < Math.max(0, Math.trunc(ln.qtd)); n++)
          doPedido.push({ cliente: r.cliente, modelo: r.modelo, tamanho: r.tamanho, cor: r.cor, composicao: r.composicao });
      });
      if (!doPedido.length) continue;
      if (!primeiro) {
        while (out.length % cfg.colunas !== 0) out.push(null); // completa a carreira atual
        for (let c = 0; c < cfg.colunas; c++) out.push(null);  // 1 carreira em branco (separador)
      }
      out.push(...doPedido);
      primeiro = false;
    }
    return out;
  }, [rows, linhas, ordemPedidos, cfg.colunas]);

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

  // CSS comum da etiqueta (prévia e impressão), com a fonte configurável.
  // Disposição horizontal: linha de topo com modelo (esq.) e tamanho (dir.).
  const cssEt = `.et{position:absolute;overflow:hidden;box-sizing:border-box;padding:1.4mm 2.2mm;display:flex;flex-direction:column;justify-content:center;gap:0.5mm;font-family:Arial,Helvetica,sans-serif;border:0.2mm solid #000;border-radius:1mm}
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
          {carregando || importando ? "Carregando…" : (sel.length === 0 && pdfsAbertos.length === 0) ? "Escolha um pedido salvo, ou abra um PDF de pedido para testar. Pronta entrega fica de fora." : <>Peças de produção: <strong>{etqs.length}</strong> etiqueta(s) · <strong>{paginas}</strong> folha(s) {cfg.pagina === "carta" ? "Carta" : "A4"} ({porPagina} por folha){offset > 0 && <> · pulando {offset} espaço(s) na 1ª folha</>}{ordemPedidos.length > 1 && <> · pedidos separados por 1 carreira em branco</>}. {sobra > 0 ? <>Sobram <strong>{sobra}</strong> espaço(s) na última folha — adicione outro pedido pra completar e não desperdiçar.</> : <>Folha(s) cheia(s), sem sobra. 👍</>}</>}
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
                        return (
                          <tr key={i} style={{ opacity: ln.incluir ? 1 : 0.45 }}>
                            <td><input type="checkbox" checked={ln.incluir} onChange={(e) => setLinha(i, { incluir: e.target.checked })} /></td>
                            <td>{r.modelo}</td>
                            <td>{r.tamanho || "—"}</td>
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
          {Array.from({ length: porPagina }, (_, k) => {
            const col = k % cfg.colunas, row = Math.floor(k / cfg.colunas);
            const x = cfg.margemEsq + col * (cfg.larguraEt + cfg.gapH);
            const y = cfg.margemTopo + row * (cfg.alturaEt + cfg.gapV);
            const style = { position: "absolute" as const, left: pct(x, pag.w) + "%", top: pct(y, pag.h) + "%", width: pct(cfg.larguraEt, pag.w) + "%", height: pct(cfg.alturaEt, pag.h) + "%", overflow: "hidden" };
            if (etqs.length && k < offset) return <div key={k} className="a4-et a4-et-skip" style={style}>usada</div>;
            const e = etqs.length ? finalCells[k] : ({ cliente: "Cliente", modelo: "(etiqueta)", tamanho: "", cor: "", composicao: "" } as Etq);
            if (!e) return <div key={k} className="a4-et a4-et-empty" style={style}></div>;
            return (
              <div key={k} className="a4-et" style={{ ...style, gap: 0, justifyContent: "center" }}>
                <div className="a4-mod" style={{ fontSize: fpt(1.3), lineHeight: 1.05 }}>{e.modelo}</div>
                <div className="a4-lin" style={{ fontSize: fpt(1), lineHeight: 1.15 }}>Cor: <b>{e.cor || "—"}</b></div>
                <div className="a4-lin" style={{ fontSize: fpt(1), lineHeight: 1.15 }}>Tamanho: <b>{e.tamanho || "—"}</b>{e.composicao ? <span style={{ color: "#55555e" }}> · {e.composicao}</span> : ""}</div>
                <div className="a4-cli" style={{ fontSize: fpt(0.82), lineHeight: 1.15 }}>{e.cliente}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
