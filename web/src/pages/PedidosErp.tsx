import { useEffect, useState } from "react";
import { api, type ErpPendente, type ErpPendenteDetalhe } from "../api";

const dataBR = (s: string | null) => s ? (s.includes("T") || s.includes(" ") ? s.replace("T", " ").slice(0, 16) : s.split("-").reverse().join("/")) : "—";

// Há quanto tempo foi a última sincronização (verde = fresco, laranja = atrasando, vermelho = parado).
function haQuanto(ult: string | null, agoraIso: string): { txt: string; cor: string } {
  if (!ult) return { txt: "nunca sincronizou", cor: "#b91c1c" };
  const t = new Date(ult.replace(" ", "T") + (ult.includes("Z") ? "" : "Z")).getTime();
  const now = new Date(agoraIso).getTime();
  const min = Math.max(0, Math.round((now - t) / 60000));
  const txt = min < 1 ? "agora mesmo" : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} dia(s)`;
  const cor = min <= 5 ? "#15803d" : min <= 30 ? "#b45309" : "#b91c1c";
  return { txt, cor };
}

export function PedidosErp() {
  const [lista, setLista] = useState<ErpPendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<ErpPendenteDetalhe | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [explodindo, setExplodindo] = useState(false);
  const [preparando, setPreparando] = useState(false);
  // Tela de configuração (junto/separado) antes de Produzir/Explodir.
  type ConfigTela = { modo: "produzir" | "explodir"; pedidos: ErpPendente[]; temBoth: Record<string, boolean>; escolha: Record<string, "junto" | "separado"> };
  const [config, setConfig] = useState<ConfigTela | null>(null);
  const [prodView, setProdView] = useState(true);  // junta capa+almofada (mesma peça na máquina)

  // Para a PRODUÇÃO, capa e almofada do mesmo modelo+cor+tamanho são a MESMA peça
  // tricotada (a almofada é a capa com enchimento). Junta as quantidades. Não muda o
  // pedido — é só a visão de quanto tricotar. Peseira e demais ficam como estão.
  type ItemIn = { produto: string; ref: string | null; cor: string | null; tamanho: string | null; qtd: number; valor_unit?: number };
  type ItemProd = { produto: string; ref: string | null; cor: string | null; tamanho: string | null; qtd: number; valor_unit: number; _junta?: boolean };
  // Código "base" do produto: tira o sufixo de letra (A = almofada, C = capa) que só existe
  // por limitação de cadastro no Syntech. 1091A / 1091C → 1091. KT/ED (pronta entrega) ficam.
  function codigoBase(ref: string | null): string {
    const r = String(ref || "").trim();
    const m = r.match(/^(\d+)[A-Za-z]*$/);
    return m ? m[1] : r;
  }
  // Visão de produção: capa e almofada do MESMO código base + cor + tamanho são a mesma peça
  // tricotada → junta as quantidades e mostra só o código base (sem A/C). Não muda o pedido.
  function juntarCapaAlmofada(itens: ItemIn[]): ItemProd[] {
    const map = new Map<string, ItemProd & { _n: number }>();
    const out: (ItemProd & { _n: number })[] = [];
    for (const it of itens) {
      const base = codigoBase(it.ref);
      const modelo = String(it.produto || "").replace(/^\s*(CAPAS?|ALMOFADAS?)\s+/i, "").trim() || String(it.produto || "");
      const q = Number(it.qtd) || 0;
      const key = `${base}|${String(it.cor || "").toUpperCase()}|${String(it.tamanho || "").toUpperCase()}`;
      let g = map.get(key);
      if (!g) { g = { produto: modelo, ref: base, cor: it.cor, tamanho: it.tamanho, qtd: 0, valor_unit: 0, _n: 0 }; map.set(key, g); out.push(g); }
      g.qtd += q; g._n += 1;
    }
    return out.map(({ _n, ...r }) => ({ ...r, _junta: _n > 1 }));
  }

  function carregar() { setCarregando(true); api.erpPendentes().then(setLista).catch(() => setLista([])).finally(() => { setCarregando(false); setSel(new Set()); }); }
  useEffect(carregar, []);

  // Status da sincronização de estoque (pra saber se o espelho do Syntech está atualizando).
  const [sync, setSync] = useState<{ estoque: { itens: number; atualizado_em: string | null }; diag?: { proc?: string; com_cor?: number; sem_detalhe?: number; itens?: number; produtos?: number; erro?: string; em?: string } | null; agora: string } | null>(null);
  const carregarSync = () => api.erpSyncStatus().then(setSync).catch(() => setSync(null));
  useEffect(() => { carregarSync(); }, []);

  // Busca o estoque espelhado por cor (pra conferir o que a ponte trouxe do Syntech).
  const [estBusca, setEstBusca] = useState("");
  const [estRows, setEstRows] = useState<{ produto: string | null; ref: string | null; cor: string | null; tamanho: string | null; saldo: number; atualizado_em: string }[] | null>(null);
  const [estLoad, setEstLoad] = useState(false);
  function buscarEstoque() {
    const b = estBusca.trim(); if (!b) { setEstRows(null); return; }
    setEstLoad(true);
    api.erpEstoque({ busca: b }).then((r) => setEstRows(r)).catch(() => setEstRows([])).finally(() => setEstLoad(false));
  }

  // Diagnóstico de kit: mostra a receita + saldo por cor/tamanho de cada peça.
  const [diag, setDiag] = useState<Awaited<ReturnType<typeof api.erpDiagProduto>> | null>(null);
  const [diagLoad, setDiagLoad] = useState(false);
  function rodarDiag() {
    const b = estBusca.trim() || "balls";
    setDiagLoad(true);
    api.erpDiagProduto(b).then((r) => setDiag(r)).catch(() => setDiag(null)).finally(() => setDiagLoad(false));
  }

  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const removeSel = (id: string) => setSel((s) => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n; });

  async function abrir(id: string) {
    if (aberto === id) { setAberto(null); setDetalhe(null); return; }
    setAberto(id); setDetalhe(null);
    try { setDetalhe(await api.erpPendenteDetalhe(id)); } catch { /* ignore */ }
  }
  async function aprovar(p: ErpPendente) {
    if (!confirm(`Produzir o pedido ${p.numero_erp} (${p.cliente_nome})? Vai pra produção.`)) return;
    setOcupado(p.id);
    try { await api.erpAprovar(p.id); setLista((xs) => xs.filter((x) => x.id !== p.id)); removeSel(p.id); setMsg(`✓ Pedido ${p.numero_erp} foi pra produção.`); setTimeout(() => setMsg(""), 4000); }
    catch { alert("Não consegui enviar pra produção."); }
    finally { setOcupado(null); }
  }
  async function aceitar(p: ErpPendente) {
    setOcupado(p.id);
    try { await api.erpAceitar(p.id); setLista((xs) => xs.map((x) => x.id === p.id ? { ...x, status: "aguardando_explosao" } : x)); setMsg(`📥 Pedido ${p.numero_erp} aceito — guardado pra explodir depois.`); setTimeout(() => setMsg(""), 4000); }
    catch { alert("Não consegui aceitar."); }
    finally { setOcupado(null); }
  }
  async function recusar(p: ErpPendente) {
    if (!confirm(`Recusar/descartar o pedido ${p.numero_erp} (${p.cliente_nome})? Ele NÃO entra na produção e será removido.`)) return;
    setOcupado(p.id);
    try { await api.erpRecusar(p.id); setLista((xs) => xs.filter((x) => x.id !== p.id)); removeSel(p.id); setMsg(`Pedido ${p.numero_erp} recusado.`); setTimeout(() => setMsg(""), 4000); }
    catch { alert("Não consegui recusar."); }
    finally { setOcupado(null); }
  }
  // Abre o pedido numa página limpa (documento) pra visualizar/imprimir/salvar em PDF.
  function escH(s: unknown) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  async function visualizar(p: ErpPendente) {
    const d = (aberto === p.id && detalhe) ? detalhe : await api.erpPendenteDetalhe(p.id).catch(() => null);
    if (!d) { alert("Não consegui carregar os itens do pedido."); return; }
    const itens: ItemProd[] = prodView ? juntarCapaAlmofada(d.itens) : d.itens.map((it) => ({ produto: it.produto, ref: it.ref, cor: it.cor, tamanho: it.tamanho, qtd: Number(it.qtd) || 0, valor_unit: 0 }));
    const totPec = itens.reduce((s, it) => s + (Number(it.qtd) || 0), 0);
    const rows = itens.map((it) => { const q = Number(it.qtd) || 0; return `<tr><td class="b">${escH(it.produto)}${it._junta ? '<span class="tag">capa+almofada</span>' : ""}</td><td class="m">${escH(it.ref || "—")}</td><td>${escH(it.cor || "—")}</td><td>${escH(it.tamanho || "—")}</td><td class="n">${q}</td></tr>`; }).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pedido ${escH(p.numero_erp)} — Big Tricot</title><style>
      *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2c2721;margin:0;padding:26px;background:#f3f1ec}
      .doc{max-width:820px;margin:0 auto;background:#fff;border-radius:10px;box-shadow:0 2px 16px rgba(0,0,0,.08);padding:28px 30px}
      .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #ae5033;padding-bottom:14px;margin-bottom:16px;gap:16px}
      .logo{font-family:Georgia,serif;font-weight:700;font-size:24px;letter-spacing:.02em}
      .logo small{display:block;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#ae5033;font-weight:600;font-family:-apple-system,Arial,sans-serif}
      .meta{text-align:right;font-size:13px;color:#5f584e;line-height:1.5}
      .meta b{color:#2c2721;font-size:15px}
      table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:6px}
      th{text-align:left;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8a8278;border-bottom:1px solid #e6e1d8;padding:8px 10px}
      td{padding:9px 10px;border-bottom:1px solid #f0ece4}
      td.b{font-weight:600} td.m{color:#8a8278;font-size:12px} td.n{text-align:right;font-weight:700} th.n{text-align:right}
      .tag{display:inline-block;margin-left:7px;font-size:10px;font-weight:600;color:#8a8278;background:#f1ece3;border-radius:5px;padding:1px 6px}
      tfoot td{border-top:2px solid #e6e1d8;font-weight:700;padding-top:10px}
      .acts{max-width:820px;margin:0 auto 14px;display:flex;gap:10px;justify-content:flex-end}
      .acts button{border:0;border-radius:8px;padding:9px 16px;font-size:14px;font-weight:600;cursor:pointer}
      .pr{background:#ae5033;color:#fff}
      @media print{ body{background:#fff;padding:0} .doc{box-shadow:none;border-radius:0;max-width:none} .acts{display:none} }
    </style></head><body>
      <div class="acts"><button class="pr" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div>
      <div class="doc">
        <div class="hd">
          <div class="logo">BIG TRICOT<small>Pedido para produção</small></div>
          <div class="meta"><b>Pedido nº ${escH(p.numero_erp)}</b><br>${escH(p.cliente_nome || "")}<br>Pedido: ${escH(dataBR(p.data_pedido))}${p.data_entrega ? `<br>Entrega: ${escH(dataBR(p.data_entrega))}` : ""}</div>
        </div>
        ${prodView ? '<div style="font-size:12px;color:#8a8278;margin-bottom:6px">🧶 Visão de produção — capa e almofada do mesmo modelo/cor/tamanho estão somadas.</div>' : ""}
        <table><thead><tr><th>Produto</th><th>Código</th><th>Cor</th><th>Tamanho</th><th class="n">Qtd</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4">Total · ${totPec} peça(s)</td><td class="n">${totPec}</td></tr></tfoot></table>
      </div>
    </body></html>`;
    const win = window.open("", "_blank");
    if (!win) { alert("O navegador bloqueou a janela. Permita pop-ups pra visualizar o pedido."); return; }
    win.document.open(); win.document.write(html); win.document.close();
  }
  const pendentes = lista.filter((p) => p.status === "aguardando_aprovacao");
  const aceitos = lista.filter((p) => p.status === "aguardando_explosao");
  // Seleção: pedidos marcados + total de peças (recalcula sozinho ao marcar/desmarcar).
  // Usa a contagem que já vem do backend (p.pecas = soma das qtd), sem duplicar.
  const selecionados = lista.filter((p) => sel.has(p.id));
  const totPecasSel = selecionados.reduce((s, p) => s + (Number(p.pecas) || 0), 0);
  // Identifica, pelos itens, se o pedido tem PRODUÇÃO e/ou PRONTA ENTREGA (código KT/ED).
  function classificaItens(itens: { ref: string | null }[]): { prod: boolean; pe: boolean; both: boolean } {
    let prod = false, pe = false;
    for (const it of itens) {
      const r = String(it.ref || "").toUpperCase().trim();
      if (r.startsWith("KT") || r.startsWith("ED")) pe = true; else prod = true;
    }
    return { prod, pe, both: prod && pe };
  }
  // PRODUZIR (1 pedido): SEMPRE abre a tela de configuração (confirmação explícita).
  // NUNCA aprova direto — a aprovação / criação de OP só acontece quando a pessoa clica no
  // botão "Produzir" DENTRO da tela de config (confirmarConfig). Abrir a config não grava nada:
  // é só estado de tela (setConfig) depois de LER os itens (erpPendenteDetalhe, consulta).
  // O junto/separado só aparece quando o pedido tem produção E pronta entrega (temBoth).
  async function produzirUm() {
    if (selecionados.length !== 1) return;
    const p = selecionados[0];
    setPreparando(true);
    try {
      const det = await api.erpPendenteDetalhe(p.id).catch(() => null);
      const both = classificaItens(det?.itens || []).both;
      setConfig({ modo: "produzir", pedidos: [p], temBoth: { [p.id]: both }, escolha: { [p.id]: "junto" } });
    } finally { setPreparando(false); }
  }
  // EXPLODIR (2+): abre a tela de config (envio junto/separado por pedido que tiver os 2 tipos).
  async function explodirConfig() {
    const peds = lista.filter((p) => sel.has(p.id));
    if (peds.length < 2) return;
    setPreparando(true);
    try {
      const dets = await Promise.all(peds.map((p) => api.erpPendenteDetalhe(p.id).catch(() => null)));
      const temBoth: Record<string, boolean> = {};
      const escolha: Record<string, "junto" | "separado"> = {};
      peds.forEach((p, i) => { if (classificaItens(dets[i]?.itens || []).both) { temBoth[p.id] = true; escolha[p.id] = "junto"; } });
      setConfig({ modo: "explodir", pedidos: peds, temBoth, escolha });
    } finally { setPreparando(false); }
  }
  const setEscolha = (id: string, v: "junto" | "separado") => setConfig((c) => c && { ...c, escolha: { ...c.escolha, [id]: v } });
  // Confirma a tela de config: dispara produzir (1) ou explodir (2+) com as escolhas.
  async function confirmarConfig() {
    if (!config) return;
    const cfg = config;
    setConfig(null);
    if (cfg.modo === "produzir") {
      const p = cfg.pedidos[0];
      setOcupado(p.id);
      try { await api.erpAprovar(p.id, cfg.escolha[p.id]); setLista((xs) => xs.filter((x) => x.id !== p.id)); removeSel(p.id); setMsg(`✓ Pedido ${p.numero_erp} foi pra produção.`); setTimeout(() => setMsg(""), 4000); }
      catch { alert("Não consegui enviar pra produção."); }
      finally { setOcupado(null); }
    } else {
      const ids = cfg.pedidos.map((p) => p.id);
      const entregas: Record<string, string> = {};
      for (const p of cfg.pedidos) if (cfg.temBoth[p.id]) entregas[p.id] = cfg.escolha[p.id];
      setExplodindo(true);
      try { const r = await api.erpAprovarLote(ids, entregas); setLista((xs) => xs.filter((x) => !sel.has(x.id))); setSel(new Set()); setMsg(`✓ ${r.pedidos} pedidos explodidos na Explosão ${r.codigo_pai}.`); setTimeout(() => setMsg(""), 5000); }
      catch { alert("Não consegui explodir juntos."); }
      finally { setExplodindo(false); }
    }
  }
  const totConfig = config ? config.pedidos.reduce((s, p) => s + (Number(p.pecas) || 0), 0) : 0;

  function Card({ p, held }: { p: ErpPendente; held: boolean }) {
    return (
      <div className="card pad">
        <div className="row-gap" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggleSel(p.id)} title="Selecionar pra explodir junto" style={{ width: 18, height: 18, cursor: "pointer" }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{p.numero_erp} <span className="muted" style={{ fontWeight: 400 }}>· {p.cliente_nome}</span></div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              {p.linhas} linha(s) · <b>{p.pecas}</b> peça(s) · pedido {dataBR(p.data_pedido)}{p.data_entrega ? ` · entrega ${dataBR(p.data_entrega)}` : ""}
            </div>
          </div>
          <button className="btn btn-soft" style={{ padding: "7px 12px" }} onClick={() => abrir(p.id)}>{aberto === p.id ? "Ocultar itens" : "👁 Conferir itens"}</button>
          <button className="btn btn-soft" style={{ padding: "7px 12px" }} onClick={() => visualizar(p)}>📄 Visualizar pedido</button>
          <button className="btn btn-ok" style={{ padding: "7px 12px" }} disabled={ocupado === p.id} onClick={() => aprovar(p)}>{ocupado === p.id ? "…" : (held ? "💥 Explodir" : "✓ Aprovar e explodir")}</button>
          {!held && <button className="btn btn-soft" style={{ padding: "7px 12px" }} disabled={ocupado === p.id} onClick={() => aceitar(p)}>📥 Aceitar (segurar)</button>}
          <button className="btn btn-danger" style={{ padding: "7px 12px" }} disabled={ocupado === p.id} onClick={() => recusar(p)}>✗ Recusar</button>
        </div>

        {aberto === p.id && (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            {!detalhe ? <p className="muted">Carregando itens…</p> : (
              <>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={prodView} onChange={(e) => setProdView(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                  🧶 <b>Juntar capa + almofada</b> <span className="muted">(visão de produção — mesma peça na máquina)</span>
                </label>
                <div style={{ overflowX: "auto" }}>
                  <table className="table" style={{ minWidth: 520 }}>
                    <thead><tr><th>Produto</th><th>Código</th><th>Cor</th><th>Tamanho</th><th className="num">Qtd</th></tr></thead>
                    <tbody>
                      {(prodView ? juntarCapaAlmofada(detalhe.itens) : detalhe.itens).map((it, i) => (
                        <tr key={i}>
                          <td className="strong">{it.produto}{(it as ItemProd)._junta ? <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}> · capa+almofada</span> : null}</td>
                          <td className="muted">{it.ref || "—"}</td>
                          <td>{it.cor || "—"}</td><td>{it.tamanho || "—"}</td>
                          <td className="num" style={{ fontWeight: 700 }}>{it.qtd}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="page-head"><div><h1>Pedidos Syntech</h1><div className="breadcrumb">PCP › Pedidos Syntech (conferência)</div></div>
        <button className="btn btn-soft" onClick={carregar}>↻ Atualizar</button>
      </div>

      {sync && (() => { const s = haQuanto(sync.estoque.atualizado_em, sync.agora); return (
        <div className="card pad" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.cor, display: "inline-block", flex: "0 0 auto" }} />
          <span>📦 <b>Estoque do Syntech:</b> {sync.estoque.itens.toLocaleString("pt-BR")} itens no espelho · <b style={{ color: s.cor }}>última atualização {s.txt}</b>{sync.estoque.atualizado_em ? <span className="muted"> ({dataBR(sync.estoque.atualizado_em)})</span> : null}</span>
          <button className="btn btn-soft" style={{ marginLeft: "auto", fontSize: 12 }} onClick={carregarSync}>↻ Checar estoque</button>
          <button className="btn btn-soft" style={{ fontSize: 12, color: "#b91c1c" }} title="Apaga o estoque espelhado; a ponte repõe tudo na próxima rodada"
            onClick={() => { if (confirm("Zerar o estoque espelhado?\n\nA ponte vai repor tudo na próxima rodada (~2 min), já com a correção de cor. Durante esse tempo o catálogo pode mostrar os produtos como indisponíveis.")) api.erpEstoqueReset().then(() => { setTimeout(carregarSync, 500); alert("Estoque zerado. Em ~2 min a ponte repõe tudo."); }).catch(() => alert("Não consegui zerar.")); }}>🧹 Zerar espelho</button>
          {sync.diag ? (
            <div style={{ width: "100%", fontSize: 12, color: "#64748b" }}>
              Sincronização por cor: <b style={{ color: (sync.diag.com_cor || 0) > 0 ? "#15803d" : "#b91c1c" }}>{sync.diag.com_cor || 0}</b> produto(s) com estoque por cor
              {(sync.diag.sem_detalhe || 0) > 0 ? <> · <b style={{ color: "#b45309" }}>{sync.diag.sem_detalhe}</b> sem detalhe</> : null}
              {" · "}{sync.diag.itens || 0} linha(s){sync.diag.produtos ? <> de {sync.diag.produtos} produto(s)</> : null}
              {sync.diag.erro ? <div style={{ color: "#b91c1c", marginTop: 2 }}>último erro: {sync.diag.erro}</div> : null}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 6, alignItems: "center", width: "100%", marginTop: 6 }}>
            <input value={estBusca} placeholder="Conferir estoque por cor: digite o nome ou código do produto…" style={{ flex: 1, padding: "6px 10px", fontSize: 13 }}
              onChange={(e) => setEstBusca(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") buscarEstoque(); }} />
            <button className="btn btn-soft" style={{ fontSize: 12 }} disabled={estLoad} onClick={buscarEstoque}>{estLoad ? "…" : "🔍 Buscar"}</button>
            <button className="btn btn-soft" style={{ fontSize: 12 }} disabled={diagLoad} onClick={rodarDiag} title="Mostra a receita do kit e o saldo por cor/tamanho de cada peça">{diagLoad ? "…" : "🧩 Diagnóstico kit"}</button>
          </div>
          {diag != null && (
            <div style={{ width: "100%", marginTop: 8, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>🧩 Diagnóstico de "{diag.busca}"</div>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>Produtos (erp_produtos):</div>
              <table className="table" style={{ fontSize: 12, marginBottom: 10 }}>
                <thead><tr><th>Ref</th><th>Nome</th><th className="num">Est. geral</th><th className="num">#cores</th><th className="num">#tam</th><th>inativo</th></tr></thead>
                <tbody>{diag.produtos.map((p, i) => {
                  let nc = 0, nt = 0; try { nc = (JSON.parse(p.cores || "[]") as unknown[]).length; } catch { /* */ } try { nt = (JSON.parse(p.tamanhos || "[]") as unknown[]).length; } catch { /* */ }
                  return <tr key={i}><td className="strong">{p.ref}</td><td>{p.nome}</td><td className="num">{p.estoque_geral ?? "—"}</td><td className="num">{nc}</td><td className="num">{nt}</td><td>{p.inativo ? "sim" : "não"}</td></tr>;
                })}</tbody>
              </table>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>Receita do(s) kit(s):</div>
              <table className="table" style={{ fontSize: 12, marginBottom: 10 }}>
                <thead><tr><th>Kit</th><th>Componente</th><th className="num">Qtd</th><th>Tam</th></tr></thead>
                <tbody>{diag.receita.length ? diag.receita.map((r, i) => <tr key={i}><td className="strong">{r.kit_ref}</td><td>{r.componente_ref}</td><td className="num">{r.quantidade}</td><td>{r.tamanho || "—"}</td></tr>) : <tr><td colSpan={4} className="muted">nenhum kit</td></tr>}</tbody>
              </table>
              <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>Saldo por cor e tamanho de cada peça (erp_estoque):</div>
              {Object.keys(diag.estoque_por_peca).length === 0 && <div className="muted" style={{ fontSize: 12 }}>nenhuma peça com saldo no espelho</div>}
              {Object.entries(diag.estoque_por_peca).map(([ref, rows]) => (
                <div key={ref} style={{ marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{ref} <span className="muted" style={{ fontWeight: 400 }}>({rows.length} linha{rows.length === 1 ? "" : "s"})</span></div>
                  <table className="table" style={{ fontSize: 12 }}>
                    <thead><tr><th>Tam.</th><th>Cor</th><th className="num">Saldo</th></tr></thead>
                    <tbody>{rows.map((e, i) => <tr key={i}><td>{e.tamanho || "—"}</td><td>{e.cor || "—"}</td><td className="num" style={{ fontWeight: 700 }}>{(Number(e.saldo) || 0).toLocaleString("pt-BR")}</td></tr>)}</tbody>
                  </table>
                </div>
              ))}
              {diag.pecas_sem_espelho.length > 0 && <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>Peças SEM saldo no espelho (não espelhadas por cor): {diag.pecas_sem_espelho.join(", ")}</div>}
            </div>
          )}
          {estRows != null ? (
            <div style={{ width: "100%", marginTop: 4 }}>
              {estRows.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5 }}>Nada no espelho para "{estBusca}". Se o produto existe no Syntech com estoque, a ponte ainda não trouxe o saldo por cor dele.</div>
              ) : (
                <table className="table" style={{ fontSize: 12.5 }}>
                  <thead><tr><th>Produto</th><th>Cód.</th><th>Cor</th><th>Tam.</th><th className="num">Saldo</th><th>Atualizado</th></tr></thead>
                  <tbody>
                    {estRows.slice(0, 60).map((r, i) => (
                      <tr key={i}><td>{r.produto || "—"}</td><td className="strong">{r.ref || "—"}</td><td>{r.cor || "—"}</td><td>{r.tamanho || "—"}</td><td className="num" style={{ fontWeight: 700 }}>{(Number(r.saldo) || 0).toLocaleString("pt-BR")}</td><td className="muted">{dataBR(r.atualizado_em)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>
      ); })()}

      <div className="card pad" style={{ marginBottom: 14, background: "#f8fafc", borderStyle: "dashed" }}>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Pedidos vindos do ERP (Syntech) chegam aqui <b>antes</b> da produção. Você pode:
          <b style={{ color: "#16a34a" }}> ✓ Aprovar e explodir</b> (vai pra produção agora),
          <b> 📥 Aceitar (segurar)</b> (guarda pra explodir depois — bom pra juntar pedidos pequenos),
          ou <b style={{ color: "#dc2626" }}>✗ Recusar</b> (descarta). Marque vários e use <b>💥 Explodir juntos</b> pra render mais na tecelagem.
        </p>
      </div>

      {msg && <div className="card pad" style={{ marginBottom: 14, background: "#f0fdf4", color: "#15803d", fontWeight: 600 }}>{msg}</div>}

      {sel.size >= 1 && (
        <div className="card pad" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "#eef2ff", borderColor: "#c7d2fe", position: "sticky", top: 8, zIndex: 5 }}>
          <b style={{ color: "#3730a3", fontSize: 15 }}>{sel.size} pedido{sel.size > 1 ? "s" : ""} selecionado{sel.size > 1 ? "s" : ""}</b>
          <b style={{ color: "#3730a3", fontSize: 15 }}>· {totPecasSel} peça{totPecasSel === 1 ? "" : "s"}</b>
          <span className="muted" style={{ fontSize: 12.5, flex: 1, minWidth: 120 }}>
            {sel.size === 1 ? "Enviar este pedido para produção." : "Juntar numa explosão (código pai) — desmembra depois por pedido."}
          </span>
          <button className="btn btn-soft" onClick={() => setSel(new Set())}>Limpar</button>
          {sel.size === 1 ? (
            <button className="btn btn-primary" disabled={!!ocupado || preparando} onClick={produzirUm}>{ocupado || preparando ? "…" : "🧶 Produzir"}</button>
          ) : (
            <button className="btn btn-primary" disabled={explodindo || preparando} onClick={explodirConfig}>{explodindo ? "Explodindo…" : preparando ? "…" : `💥 Explodir (${sel.size})`}</button>
          )}
        </div>
      )}

      {carregando ? <p className="muted pad">Carregando…</p> : lista.length === 0 ? (
        <div className="card pad"><p className="muted" style={{ margin: 0 }}>Nenhum pedido do ERP na fila. 👍</p></div>
      ) : (
        <>
          <h2 style={{ fontSize: 16, margin: "4px 0 10px" }}>📥 Para conferir <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({pendentes.length})</span></h2>
          {pendentes.length === 0 ? <p className="muted" style={{ marginBottom: 16 }}>Nada pra conferir.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>{pendentes.map((p) => <Card key={p.id} p={p} held={false} />)}</div>
          )}

          {aceitos.length > 0 && (
            <>
              <h2 style={{ fontSize: 16, margin: "4px 0 10px" }}>⏸️ Aceitos — aguardando explosão <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({aceitos.length})</span></h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{aceitos.map((p) => <Card key={p.id} p={p} held={true} />)}</div>
            </>
          )}
        </>
      )}

      {config && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,25,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }} onClick={() => setConfig(null)}>
          <div className="card pad" style={{ maxWidth: 560, width: "100%", maxHeight: "86vh", overflow: "auto", background: "#fff" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 4px" }}>{config.modo === "produzir" ? "🧶 Enviar para produção" : `💥 Explodir ${config.pedidos.length} pedidos`}</h3>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              {config.pedidos.length} pedido{config.pedidos.length > 1 ? "s" : ""} · <b>{totConfig}</b> peça{totConfig === 1 ? "" : "s"}
              {config.modo === "explodir" ? " — viram uma explosão (código pai), desmembra depois por pedido." : ""}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {config.pedidos.map((p) => (
                <div key={p.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontWeight: 700 }}>{p.numero_erp} <span className="muted" style={{ fontWeight: 400 }}>· {p.cliente_nome} · {p.pecas} peça(s)</span></div>
                  {config.temBoth[p.id] ? (
                    <div style={{ marginTop: 6 }}>
                      <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>Este pedido tem produção <b>e</b> pronta entrega. Como enviar a pronta entrega?</div>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16, cursor: "pointer" }}>
                        <input type="radio" name={`e-${p.id}`} checked={config.escolha[p.id] === "junto"} onChange={() => setEscolha(p.id, "junto")} /> Enviar tudo junto
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input type="radio" name={`e-${p.id}`} checked={config.escolha[p.id] === "separado"} onChange={() => setEscolha(p.id, "separado")} /> Enviar separado (antecipado)
                      </label>
                    </div>
                  ) : (
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Só um tipo de produto — sem opção de envio.</div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button className="btn btn-soft" onClick={() => setConfig(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={explodindo || !!ocupado} onClick={confirmarConfig}>
                {config.modo === "produzir" ? "🧶 Produzir" : `💥 Explodir (${config.pedidos.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
