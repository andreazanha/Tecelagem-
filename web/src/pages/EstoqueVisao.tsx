// Visão Geral do Estoque — dashboard: quantas peças, valor do estoque (a preço de atacado),
// nº de produtos/SKUs, quebra por categoria e os produtos de maior valor. Só leitura.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

type Visao = {
  totais: { pecas: number; valor: number; skus: number; produtos: number; zerados: number };
  categorias: { categoria: string; pecas: number; valor: number; produtos: number }[];
  top_produtos: { ref: string; nome: string; pecas: number; valor: number }[];
  sync_em: string | null; base_preco: string;
};
const brl = (n: number) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nf = (n: number) => (Number(n) || 0).toLocaleString("pt-BR");

export function EstoqueVisao() {
  const [v, setV] = useState<Visao | null>(null);
  const [erro, setErro] = useState("");

  function carregar() { setV(null); setErro(""); api.estoqueVisao().then((r) => setV(r as Visao)).catch((e) => setErro((e as Error).message)); }
  useEffect(() => { carregar(); }, []);

  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>📊 Visão do Estoque</h2>
        <span className="muted" style={{ fontSize: 12 }}>Estoque real do Syntech. Valor estimado a <b>preço de atacado</b>.</span>
        <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={carregar}>↻ Atualizar</button>
      </div>

      {/* Atalhos pras ferramentas do estoque */}
      <div className="row-gap" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Link className="btn btn-soft" to="/precisa-produzir">🏭 Precisa Produzir</Link>
        <Link className="btn btn-soft" to="/estoque-syntech">🔎 Estoque por cor/tamanho</Link>
        <Link className="btn btn-soft" to="/estoque-inventario">🔢 Inventário</Link>
      </div>

      {erro && <div className="card pad" style={{ color: "#b91c1c" }}>{erro}</div>}
      {v == null && !erro && <div className="card pad muted">Carregando…</div>}

      {v && (
        <>
          <div className="row-gap" style={{ gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div className="card pad" style={{ flex: "1 1 180px", minWidth: 160 }}>
              <div className="muted" style={{ fontSize: 12 }}>💰 Valor do estoque</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#166534" }}>{brl(v.totais.valor)}</div>
              <div className="muted" style={{ fontSize: 11 }}>a preço de atacado</div>
            </div>
            <div className="card pad" style={{ flex: "1 1 160px", minWidth: 150 }}>
              <div className="muted" style={{ fontSize: 12 }}>📦 Peças em estoque</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{nf(v.totais.pecas)}</div>
            </div>
            <div className="card pad" style={{ flex: "1 1 160px", minWidth: 150 }}>
              <div className="muted" style={{ fontSize: 12 }}>🏷️ Produtos · SKUs</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{nf(v.totais.produtos)} <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>· {nf(v.totais.skus)}</span></div>
            </div>
            <div className="card pad" style={{ flex: "1 1 160px", minWidth: 150 }}>
              <div className="muted" style={{ fontSize: 12 }}>⚠️ SKUs zerados</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: v.totais.zerados > 0 ? "#b45309" : "#166534" }}>{nf(v.totais.zerados)}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="pad" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700 }}>Por categoria</div>
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>Categoria</th><th className="num">Produtos</th><th className="num">Peças</th><th className="num">Valor (atacado)</th></tr></thead>
              <tbody>
                {v.categorias.map((c) => (
                  <tr key={c.categoria}>
                    <td className="strong">{c.categoria === "Edição Limitada" ? "✨ " : "📦 "}{c.categoria}</td>
                    <td className="num">{nf(c.produtos)}</td>
                    <td className="num">{nf(c.pecas)}</td>
                    <td className="num" style={{ fontWeight: 700, color: "#166534" }}>{brl(c.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="pad" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700 }}>🏆 Produtos de maior valor em estoque</div>
            {v.top_produtos.length === 0 ? <div className="pad muted">Sem dados.</div> : (
              <table className="table" style={{ fontSize: 13 }}>
                <thead><tr><th style={{ width: 30 }}>#</th><th>Produto</th><th className="num">Peças</th><th className="num">Valor (atacado)</th></tr></thead>
                <tbody>
                  {v.top_produtos.map((p, i) => (
                    <tr key={p.ref}>
                      <td className="muted" style={{ textAlign: "center" }}>{i + 1}</td>
                      <td className="strong">{p.nome} <span className="muted" style={{ fontSize: 11 }}>{p.ref}</span></td>
                      <td className="num">{nf(p.pecas)}</td>
                      <td className="num" style={{ fontWeight: 700, color: "#166534" }}>{brl(p.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            💡 O <b>valor</b> é estimado a <b>preço de atacado</b> (saldo × preço). Dá pra trocar pro preço de custo depois (preciso trazer do Syntech).
            {v.sync_em ? <> · Estoque sincronizado em {v.sync_em}.</> : null}
          </p>
        </>
      )}
    </>
  );
}
