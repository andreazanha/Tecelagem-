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

// O código do ERP diz o TIPO pela letra final: 8019A=Almofada, 8019C=Capa, 8019P=Peseira/Manta.
// O número base (8019) é o MODELO — agrupa almofada/capa/peseira do mesmo modelo.
const TIPOS: Record<string, string> = { A: "Almofada", C: "Capa", P: "Peseira / Manta", K: "Kit", M: "Manta" };
const baseCode = (ref: string) => (ref || "").replace(/[A-Za-z]+$/, "") || ref || "";
function tipoRef(ref: string): string {
  const m = (ref || "").match(/([A-Za-z])$/);
  return m ? (TIPOS[m[1].toUpperCase()] || m[1].toUpperCase()) : "";
}
// Nome do modelo: tira a palavra do tipo do começo ("ALMOFADA BALI" → "BALI").
function modeloNome(nome: string): string {
  return (nome || "").replace(/^\s*(ALMOFADAS?|CAPAS?|PESEIRAS?|MANTAS?|KITS?|PESEIRA E MANTA)\s+/i, "").trim() || nome || "";
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
  const [vista, setVista] = useState<"modelo" | "grade">("modelo");
  // agrupa por MODELO (código base: 8019 de 8019A/8019C/8019P), com as variações (A/C/P) dentro
  const modelos = useMemo(() => {
    const map = new Map<string, { base: string; nome: string; variacoes: CatalogoProduto[] }>();
    for (const p of itens) {
      const b = baseCode(p.ref);
      let g = map.get(b);
      if (!g) { g = { base: b, nome: modeloNome(p.nome || p.ref), variacoes: [] }; map.set(b, g); }
      g.variacoes.push(p);
      const mn = modeloNome(p.nome || "");
      if (mn && (!g.nome || mn.length < g.nome.length)) g.nome = mn;
    }
    for (const g of map.values()) g.variacoes.sort((a, b) => (a.ref || "").localeCompare(b.ref || ""));
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  }, [itens]);

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
        <button className="btn btn-soft" title="Baixar o catálogo gerado do ERP no formato do site (prévia, não grava no site)" onClick={async () => {
          try {
            const r = await api.catalogoSitePreview();
            const blob = new Blob([JSON.stringify(r, null, 1)], { type: "application/json" });
            const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "catalogo-site-previa.json"; a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            alert(`Prévia gerada: ${r._resumo.produtos} produto(s), ${r._resumo.cores} cor(es), ${r._resumo.tamanhos} tamanho(s). Arquivo baixado — me envie pra eu validar.`);
          } catch (e) { alert((e as Error).message); }
        }}>⬇️ Prévia p/ site</button>
        <button className="btn btn-soft" title="Testa se a chave do Firebase (FIREBASE_SA) está configurada e consegue ler o site" onClick={async () => {
          try {
            const r = await api.firebaseCheck();
            if (!r.ok) { alert("❌ Firebase não conectou:\n\n" + (r.erro || "erro desconhecido") + "\n\nConfira se o segredo FIREBASE_SA está salvo no Cloudflare."); return; }
            alert("✅ Firebase conectado!\n\n" + (r.existe_main ? `O catálogo do site (catalogo/main) existe — ${r.produtos_no_main || 0} produto(s) hoje.` : "O catálogo do site ainda não existe (catalogo/main vazio)."));
          } catch (e) { alert((e as Error).message); }
        }}>🔌 Testar Firebase</button>
        <button className="btn btn-soft" title="Escreve os produtos do ERP na ÁREA DE TESTE do site (catalogo/teste). O cliente NÃO vê." onClick={async () => {
          if (!confirm("Enviar os produtos do ERP pra ÁREA DE TESTE do site?\n\nIsso grava em catalogo/teste — o que o cliente vê (catalogo/main) NÃO muda.")) return;
          try {
            const r = await api.publicarSite("teste");
            if (!r.ok) { alert("❌ Não enviou:\n\n" + (r.erro || "erro") + "\n\n(Se falar de FIREBASE_SA, confira o segredo no Cloudflare.)"); return; }
            alert(`✅ Enviado pra área de teste!\n\n${r.resumo?.produtos || 0} produto(s), ${r.resumo?.cores || 0} cor(es), ${r.resumo?.tamanhos || 0} tamanho(s).\n\nAgora me avisa aqui que eu ligo o modo prévia no site pra você ver.`);
          } catch (e) { alert((e as Error).message); }
        }}>📤 Enviar p/ teste do site</button>
        <span className="seg-group" style={{ marginLeft: "auto" }}>
          <button type="button" className={"seg" + (vista === "modelo" ? " seg-on" : "")} onClick={() => setVista("modelo")}>Por modelo</button>
          <button type="button" className={"seg" + (vista === "grade" ? " seg-on" : "")} onClick={() => setVista("grade")}>Grade</button>
        </span>
        <span className="muted" style={{ fontSize: 12 }}>
          {vista === "modelo" ? `${modelos.length} modelo(s)` : `${itens.length} produto(s)`} · saldo {totalSaldo.toLocaleString("pt-BR")}
        </span>
      </div>

      {!carregou ? (
        <div className="card pad muted">Carregando catálogo…</div>
      ) : itens.length === 0 ? (
        <div className="card pad empty">
          Nenhum produto no catálogo ainda. {busca || grupo ? "Tente outro filtro." : "Assim que o ERP sincronizar (pela ponte), os produtos aparecem aqui."}
        </div>
      ) : vista === "grade" ? (
        <div className="cat-grid">
          {itens.map((p) => <CardProduto key={p.ref} p={p} base={base} />)}
        </div>
      ) : (
        <div className="cat-modelos">
          {modelos.map((m) => (
            <div className="cat-modelo" key={m.base}>
              <div className="cat-modelo-hd">
                <span className="cat-modelo-nome">{m.nome}</span>
                <span className="cat-modelo-cod">#{m.base}</span>
                <span className="cat-modelo-tipos">{m.variacoes.map((v) => tipoRef(v.ref)).filter(Boolean).join(" · ")}</span>
              </div>
              <div className="cat-grid">
                {m.variacoes.map((p) => <CardProduto key={p.ref} p={p} base={base} tipo={tipoRef(p.ref)} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CardProduto({ p, base, tipo }: { p: CatalogoProduto; base: string; tipo?: string }) {
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
        {tipo ? <span className="cat-badge-tipo">{tipo}</span> : null}
      </div>
      <div className="cat-body">
        <div className="cat-nome" title={p.nome || ""}>{tipo || p.nome || "—"}</div>
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
