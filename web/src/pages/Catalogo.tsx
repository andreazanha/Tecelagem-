import { useEffect, useMemo, useState } from "react";
import { api, type CatalogoProduto, type CatalogoCor } from "../api";

const money = (v: number | null | undefined) =>
  v == null ? "—" : "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

// Monta a URL da foto principal do produto: <base>/<CLASSE>/<REF>.jpg
function fotoUrl(base: string, p: CatalogoProduto): string | null {
  if (!base || !p.classe || !p.ref) return null;
  return `${base.replace(/\/+$/, "")}/${encodeURIComponent(p.classe)}/${encodeURIComponent(p.ref)}.jpg`;
}

// Catálogo de produtos espelhado do ERP (Syntech). Só leitura: foto, cores, tamanhos,
// preços e saldo disponível. Serve o atendimento/CRM/PCP sem abrir outra página.
export function Catalogo() {
  const [resp, setResp] = useState<{ fotos_base: string; grupos: string[]; itens: CatalogoProduto[] } | null>(null);
  const [carregou, setCarregou] = useState(false);
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState("");

  function carregar() {
    setCarregou(false);
    api.catalogoProdutos({ busca: busca.trim() || undefined, grupo: grupo || undefined })
      .then((r) => { setResp(r); setCarregou(true); })
      .catch(() => setCarregou(true));
  }
  // carrega ao abrir e quando muda o grupo; busca é com debounce
  useEffect(() => { carregar(); /* eslint-disable-line */ }, [grupo]);
  useEffect(() => {
    const t = setTimeout(carregar, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [busca]);

  const itens = resp?.itens || [];
  const base = resp?.fotos_base || "";
  const grupos = resp?.grupos || [];
  // saldo "efetivo": usa o detalhado (por cor/tamanho) e, se não houver, o estoque geral do produto
  const saldoEfetivo = (p: CatalogoProduto) => { const s = Number(p.saldo) || 0; return s > 0 ? s : (Number(p.estoque_geral) || 0); };
  const totalSaldo = useMemo(() => itens.reduce((s, p) => s + saldoEfetivo(p), 0), [itens]);

  return (
    <div className="page">
      <div className="page-hd">
        <div>
          <h1>Catálogo</h1>
          <div className="breadcrumb">Produtos do ERP · foto, cores, tamanhos, preço e saldo</div>
        </div>
      </div>

      <div className="row-gap" style={{ alignItems: "center", gap: 10, margin: "8px 0 16px", flexWrap: "wrap" }}>
        <input className="busca-ped" placeholder="🔎 Buscar produto ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ minWidth: 240 }} />
        <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
          <option value="">Todos os grupos</option>
          {grupos.map((gp) => <option key={gp} value={gp}>{gp}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>
          {itens.length} produto(s) · saldo total {totalSaldo.toLocaleString("pt-BR")}
        </span>
      </div>

      {!carregou ? (
        <div className="card pad muted">Carregando catálogo…</div>
      ) : itens.length === 0 ? (
        <div className="card pad empty">
          Nenhum produto no catálogo ainda. {busca || grupo ? "Tente outro filtro." : "Assim que o ERP sincronizar (pela ponte), os produtos aparecem aqui."}
        </div>
      ) : (
        <div className="cat-grid">
          {itens.map((p) => <CardProduto key={p.ref} p={p} base={base} />)}
        </div>
      )}
    </div>
  );
}

function CardProduto({ p, base }: { p: CatalogoProduto; base: string }) {
  const [semFoto, setSemFoto] = useState(false);
  const cores = parseJson<CatalogoCor[]>(p.cores, []);
  const tamanhos = parseJson<string[]>(p.tamanhos, []);
  const url = fotoUrl(base, p);
  const temPromo = p.preco_varejo_promo != null && p.preco_varejo != null && p.preco_varejo_promo < p.preco_varejo;
  const saldo = (Number(p.saldo) || 0) > 0 ? Number(p.saldo) : (Number(p.estoque_geral) || 0);

  return (
    <div className={"cat-card" + (p.inativo ? " cat-inativo" : "")}>
      <div className="cat-foto">
        {url && !semFoto
          ? <img src={url} alt={p.nome || p.ref} loading="lazy" onError={() => setSemFoto(true)} />
          : <div className="cat-foto-vazia">sem foto</div>}
        {p.inativo ? <span className="cat-badge-inativo">inativo</span> : null}
      </div>
      <div className="cat-body">
        <div className="cat-nome" title={p.nome || ""}>{p.nome || "—"}</div>
        <div className="cat-ref">{p.ref}{p.grupo ? ` · ${p.grupo}` : ""}</div>

        <div className="cat-precos">
          {temPromo ? (
            <>
              <span className="cat-preco-de">{money(p.preco_varejo)}</span>
              <span className="cat-preco">{money(p.preco_varejo_promo)}</span>
            </>
          ) : (
            <span className="cat-preco">{money(p.preco_varejo)}</span>
          )}
          {p.preco_atacado != null && <span className="cat-atacado">atacado {money(p.preco_atacado)}</span>}
        </div>

        {cores.length > 0 && (
          <div className="cat-cores" title={cores.map((c) => c.nome).filter(Boolean).join(", ")}>
            {cores.slice(0, 10).map((c, i) => (
              <span key={i} className="cat-dot" style={{ background: c.hex || "#d1d5db" }} title={c.nome || ""} />
            ))}
            {cores.length > 10 && <span className="muted" style={{ fontSize: 11 }}>+{cores.length - 10}</span>}
          </div>
        )}

        {tamanhos.length > 0 && (
          <div className="cat-tams">
            {tamanhos.slice(0, 8).map((t, i) => <span key={i} className="cat-tam">{t}</span>)}
            {tamanhos.length > 8 && <span className="muted" style={{ fontSize: 11 }}>+{tamanhos.length - 8}</span>}
          </div>
        )}

        <div className={"cat-saldo" + (saldo > 0 ? " ok" : " zero")}>
          {saldo > 0 ? `✅ ${saldo.toLocaleString("pt-BR")} em estoque` : "sem saldo"}
        </div>
      </div>
    </div>
  );
}
