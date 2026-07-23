import { useEffect, useMemo, useState } from "react";
import { api, type RelatorioVendas as RV } from "../api";

const pc = (n: number | undefined) => (Number(n) || 0).toLocaleString("pt-BR");
const rs = (n: number | undefined) => "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iso = (d: Date) => d.toISOString().slice(0, 10);
// Nome limpo do modelo (kit vem "KIT KORA +2-55X35..." → "Kit Kora").
const nomeModelo = (produto: string, kit?: number) => {
  if (!kit) return produto;
  const w = produto.replace(/^\s*KIT\s+/i, "").trim().split(/[\s+]/)[0] || produto;
  return "Kit " + (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
};
const SeloKit = () => <span className="chip" style={{ fontSize: 10, padding: "1px 6px", marginLeft: 6, background: "var(--accent-soft, #eef)" }}>KIT</span>;

// Lista de barras horizontais (sem lib de gráfico).
function Barras({ itens, metrica }: { itens: { label: string; pecas: number; valor: number; extra?: string }[]; metrica: "pecas" | "valor" }) {
  const max = Math.max(1, ...itens.map((i) => (metrica === "valor" ? i.valor : i.pecas)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {itens.map((i, k) => {
        const v = metrica === "valor" ? i.valor : i.pecas;
        return (
          <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(90px,1.4fr) 3fr auto", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={i.label}>{i.label}{i.extra ? <span className="muted" style={{ fontWeight: 400 }}> · {i.extra}</span> : ""}</span>
            <div style={{ background: "var(--line)", borderRadius: 6, height: 16, overflow: "hidden" }}><div style={{ width: (v / max * 100).toFixed(1) + "%", height: "100%", background: "var(--accent)", borderRadius: 6, minWidth: v > 0 ? 3 : 0 }} /></div>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 13, textAlign: "right", minWidth: 64 }}>{metrica === "valor" ? rs(v) : pc(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function RelatorioVendas() {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [dados, setDados] = useState<RV | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [metrica, setMetrica] = useState<"pecas" | "valor">("pecas");
  const [kits, setKits] = useState<"todos" | "so" | "sem">("todos");
  const [modelo, setModelo] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  function carregar() { setCarregando(true); api.relatorioVendas(de || undefined, ate || undefined, kits).then(setDados).catch(() => setDados(null)).finally(() => setCarregando(false)); }
  useEffect(carregar, [de, ate, kits]);

  function presetDias(dias: number) { const a = new Date(); const d = new Date(); d.setDate(d.getDate() - dias); setDe(iso(d)); setAte(iso(a)); }
  function presetAno() { const a = new Date(); setDe(`${a.getFullYear()}-01-01`); setAte(iso(a)); }
  function tudo() { setDe(""); setAte(""); }

  const modelos = dados?.modelos || [];
  const modeloSel = modelo || modelos[0]?.produto || null;
  const cardMod = useMemo(() => (dados?.modelos.filter((m) => m.produto === modeloSel) || []), [dados, modeloSel]);
  const coresDoModelo = useMemo(() => (dados?.porModeloCor.filter((x) => x.produto === modeloSel).slice(0, 8) || []), [dados, modeloSel]);
  const tamsDoModelo = useMemo(() => (dados?.porModeloTam.filter((x) => x.produto === modeloSel).slice(0, 8) || []), [dados, modeloSel]);

  const champModelo = modelos[0];
  const champCor = dados?.cores[0];
  const champTam = dados?.tamanhos[0];
  const champCombo = dados?.combos[0];

  return (
    <>
      <div className="page-head"><div><h1>Relatório de vendas</h1><div className="breadcrumb">Relatórios › O que vende mais (modelo · cor · tamanho)</div></div></div>

      {/* Filtro de período */}
      <div className="card pad" style={{ marginBottom: 14 }}>
        <div className="row-gap" style={{ alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn btn-soft" onClick={() => presetDias(30)}>30 dias</button>
            <button className="btn btn-soft" onClick={() => presetDias(90)}>90 dias</button>
            <button className="btn btn-soft" onClick={presetAno}>Este ano</button>
            <button className="btn btn-soft" onClick={tudo}>Tudo</button>
          </div>
          <label className="campo" style={{ margin: 0 }}><span className="campo-label">De</span><input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></label>
          <label className="campo" style={{ margin: 0 }}><span className="campo-label">Até</span><input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></label>
          <label className="campo" style={{ margin: 0, minWidth: 130 }}><span className="campo-label">Kits</span>
            <select value={kits} onChange={(e) => setKits(e.target.value as "todos" | "so" | "sem")}>
              <option value="todos">Todos (peça + kit)</option>
              <option value="so">Só kits</option>
              <option value="sem">Sem kits</option>
            </select>
          </label>
          <div style={{ marginLeft: "auto", display: "inline-flex", background: "var(--line)", borderRadius: 8, padding: 3 }}>
            <button className={"btn " + (metrica === "pecas" ? "btn-primary" : "btn-soft")} style={{ padding: "6px 12px" }} onClick={() => setMetrica("pecas")}>Peças</button>
            <button className={"btn " + (metrica === "valor" ? "btn-primary" : "btn-soft")} style={{ padding: "6px 12px" }} onClick={() => setMetrica("valor")}>R$</button>
          </div>
        </div>
      </div>

      {carregando ? <p className="muted pad">Carregando…</p> : !dados?.resumo?.pecas ? (
        <div className="card pad"><p className="muted" style={{ margin: 0 }}>Nenhuma venda no período. Ajuste o filtro ou escolha "Tudo".</p></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="row-gap" style={{ gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div className="card pad" style={{ minWidth: 150 }}><div className="muted" style={{ fontSize: 12 }}>Peças vendidas</div><div style={{ fontSize: 26, fontWeight: 800 }}>{pc(dados.resumo.pecas)}</div></div>
            <div className="card pad" style={{ minWidth: 170 }}><div className="muted" style={{ fontSize: 12 }}>Faturamento</div><div style={{ fontSize: 26, fontWeight: 800 }}>{rs(dados.resumo.valor)}</div></div>
            <div className="card pad" style={{ minWidth: 120 }}><div className="muted" style={{ fontSize: 12 }}>Pedidos</div><div style={{ fontSize: 26, fontWeight: 800 }}>{pc(dados.resumo.pedidos)}</div></div>
            <div className="card pad" style={{ minWidth: 120 }}><div className="muted" style={{ fontSize: 12 }}>Modelos</div><div style={{ fontSize: 26, fontWeight: 800 }}>{pc(dados.resumo.modelos)}</div></div>
          </div>

          {/* Campeões */}
          <div className="card pad" style={{ marginBottom: 14, background: "var(--accent-soft, #eef)" }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>🏆 Vale a pena trabalhar</div>
            <div className="row-gap" style={{ gap: 18, flexWrap: "wrap", fontSize: 14 }}>
              {champModelo && <div><div className="muted" style={{ fontSize: 11.5 }}>Modelo mais vendido</div><strong>{nomeModelo(champModelo.produto, champModelo.kit)}</strong>{champModelo.kit ? <SeloKit /> : ""} · {pc(champModelo.pecas)} pç</div>}
              {champCor && <div><div className="muted" style={{ fontSize: 11.5 }}>Cor mais vendida</div><strong>{champCor.cor}</strong> · {pc(champCor.pecas)} pç</div>}
              {champTam && <div><div className="muted" style={{ fontSize: 11.5 }}>Tamanho mais vendido</div><strong>{champTam.tamanho}</strong> · {pc(champTam.pecas)} pç</div>}
              {champCombo && <div><div className="muted" style={{ fontSize: 11.5 }}>Combinação campeã</div><strong>{nomeModelo(champCombo.produto, champCombo.kit)}</strong> · {champCombo.cor} · {champCombo.tamanho} · {pc(champCombo.pecas)} pç</div>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
            {/* Ranking de modelos */}
            <div className="card pad">
              <div className="row-gap" style={{ alignItems: "center", marginBottom: 10 }}><strong>Modelos mais vendidos</strong><span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>clique pra ver cor/tamanho</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {(verTodos ? modelos : modelos.slice(0, 12)).map((m) => {
                  const max = Math.max(1, ...modelos.map((x) => (metrica === "valor" ? x.valor : x.pecas)));
                  const v = metrica === "valor" ? m.valor : m.pecas;
                  const sel = m.produto === modeloSel;
                  return (
                    <div key={m.produto} onClick={() => setModelo(m.produto)} style={{ display: "grid", gridTemplateColumns: "minmax(90px,1.4fr) 3fr auto", alignItems: "center", gap: 10, cursor: "pointer", padding: "2px 4px", borderRadius: 6, background: sel ? "var(--accent-soft, #eef)" : undefined }}>
                      <span style={{ fontWeight: sel ? 800 : 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.produto}>{nomeModelo(m.produto, m.kit)}{m.kit ? <SeloKit /> : ""}</span>
                      <div style={{ background: "var(--line)", borderRadius: 6, height: 16, overflow: "hidden" }}><div style={{ width: (v / max * 100).toFixed(1) + "%", height: "100%", background: "var(--accent)", borderRadius: 6, minWidth: v > 0 ? 3 : 0 }} /></div>
                      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", fontSize: 13, textAlign: "right", minWidth: 64 }}>{metrica === "valor" ? rs(v) : pc(v)}</span>
                    </div>
                  );
                })}
              </div>
              {modelos.length > 12 && <button className="btn btn-soft" style={{ marginTop: 10 }} onClick={() => setVerTodos((v) => !v)}>{verTodos ? "Ver menos" : `Ver todos (${modelos.length})`}</button>}
            </div>

            {/* Detalhe do modelo selecionado */}
            <div className="card pad">
              <div style={{ marginBottom: 8 }}><strong>{cardMod[0] ? nomeModelo(modeloSel || "", cardMod[0].kit) : (modeloSel || "—")}</strong>{cardMod[0]?.kit ? <SeloKit /> : ""} {cardMod[0] && <span className="muted" style={{ fontSize: 13 }}>· {pc(cardMod[0].pecas)} pç · {rs(cardMod[0].valor)} · {cardMod[0].cores} cores · {cardMod[0].tamanhos} tamanhos</span>}</div>
              <div className="muted" style={{ fontSize: 12, margin: "10px 0 6px", fontWeight: 700 }}>Melhores cores</div>
              <Barras itens={coresDoModelo.map((x) => ({ label: x.cor, pecas: x.pecas, valor: 0 }))} metrica="pecas" />
              <div className="muted" style={{ fontSize: 12, margin: "14px 0 6px", fontWeight: 700 }}>Melhores tamanhos</div>
              <Barras itens={tamsDoModelo.map((x) => ({ label: x.tamanho, pecas: x.pecas, valor: 0 }))} metrica="pecas" />
            </div>

            {/* Cores geral */}
            <div className="card pad">
              <strong>Cores mais vendidas</strong>
              <div style={{ marginTop: 10 }}><Barras itens={dados.cores.slice(0, 12).map((x) => ({ label: x.cor, pecas: x.pecas, valor: x.valor }))} metrica={metrica} /></div>
            </div>

            {/* Tamanhos geral */}
            <div className="card pad">
              <strong>Tamanhos mais vendidos</strong>
              <div style={{ marginTop: 10 }}><Barras itens={dados.tamanhos.slice(0, 12).map((x) => ({ label: x.tamanho, pecas: x.pecas, valor: x.valor }))} metrica={metrica} /></div>
            </div>
          </div>

          {/* Top combinações */}
          <div className="card pad" style={{ marginTop: 14 }}>
            <strong>Top combinações (modelo · cor · tamanho)</strong>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table className="table" style={{ minWidth: 520 }}>
                <thead><tr><th style={{ width: 34 }}>#</th><th>Modelo</th><th>Cor</th><th>Tamanho</th><th className="num">Peças</th><th className="num">R$</th></tr></thead>
                <tbody>
                  {dados.combos.slice(0, 20).map((c, i) => (
                    <tr key={i}><td className="muted">{i + 1}</td><td className="strong">{nomeModelo(c.produto, c.kit)}{c.kit ? <SeloKit /> : ""}</td><td>{c.cor}</td><td>{c.tamanho}</td><td className="num" style={{ fontWeight: 700 }}>{pc(c.pecas)}</td><td className="num">{rs(c.valor)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
