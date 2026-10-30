import { useEffect, useMemo, useState } from "react";
import { api, type LojaImagemProduto } from "../api";

// Tela "Imagens da loja": LISTA enxuta de produtos; clica num produto e abre um POPUP
// com a foto do produto e a foto de cada COR (por modelo) pra trocar. As imagens sobem
// pro nosso R2; o catálogo (gerado ao vivo) passa a usar elas. Cai na foto padrão quando
// não há troca.

export default function ImagensLoja() {
  const [prods, setProds] = useState<LojaImagemProduto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true); setErro("");
    try { const r = await api.lojaImagens(); setProds(r.produtos || []); }
    catch (e) { setErro((e as Error).message || "Não consegui carregar os produtos."); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);
  // some com a mensagem depois de uns segundos
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(""), 3500); return () => clearTimeout(t); }, [msg]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? prods.filter((p) => p.nome.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) : prods;
  }, [prods, busca]);

  // Agrupa por CATEGORIA, na mesma ordem do catálogo da loja.
  const grupos = useMemo(() => {
    const ORDER = ["Pronta Entrega", "Linha Polisoft", "Linha Soft", "Natal", "Edição Limitada", "Outros"];
    const by = new Map<string, LojaImagemProduto[]>();
    for (const p of filtrados) { const k = p.categoria || "Outros"; const a = by.get(k); if (a) a.push(p); else by.set(k, [p]); }
    return [...by.keys()]
      .sort((a, b) => { const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b); })
      .map((cat) => ({ cat, itens: by.get(cat)! }));
  }, [filtrados]);

  const prodAberto = aberto ? prods.find((p) => p.id === aberto) || null : null;

  function setFotoProduto(id: string, foto: string) { setProds((ps) => ps.map((p) => p.id === id ? { ...p, foto } : p)); }
  function setFotoCor(id: string, corId: string, foto: string) {
    setProds((ps) => ps.map((p) => p.id === id ? { ...p, cores: p.cores.map((c) => c.id_cor === corId ? { ...c, foto } : c) } : p));
  }
  async function subir(file: File): Promise<string | null> {
    const up = await api.lojaImagemUpload(file);
    if (!up.ok || !up.url) { setMsg(up.error || "Não consegui enviar a imagem."); return null; }
    return up.url;
  }
  async function trocarProduto(p: LojaImagemProduto, file: File) {
    setMsg(""); try { const url = await subir(file); if (!url) return; await api.lojaImagemSalvar("produto", p.id, "", url); setFotoProduto(p.id, url); setMsg("✓ Foto do produto atualizada."); }
    catch { setMsg("Não consegui enviar a imagem."); }
  }
  async function trocarCor(p: LojaImagemProduto, corId: string, file: File) {
    setMsg(""); try { const url = await subir(file); if (!url) return; await api.lojaImagemSalvar("cor", p.id, corId, url); setFotoCor(p.id, corId, url); setMsg("✓ Foto da cor atualizada."); }
    catch { setMsg("Não consegui enviar a imagem."); }
  }
  async function removerProduto(p: LojaImagemProduto) {
    if (!confirm("Remover a foto personalizada do produto? Volta pra foto padrão.")) return;
    setMsg(""); try { await api.lojaImagemSalvar("produto", p.id, "", ""); await carregar(); setMsg("✓ Removido — voltou pra foto padrão."); } catch { setMsg("Não consegui remover."); }
  }
  async function removerCor(p: LojaImagemProduto, corId: string) {
    if (!confirm("Remover a foto personalizada dessa cor? Volta pra foto padrão.")) return;
    setMsg(""); try { await api.lojaImagemSalvar("cor", p.id, corId, ""); await carregar(); setMsg("✓ Removido — voltou pra foto padrão."); } catch { setMsg("Não consegui remover."); }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "18px 16px 80px" }}>
      <h1 style={{ fontSize: 24, margin: "4px 0 2px" }}>Imagens da loja</h1>
      <div style={{ color: "#8a8073", fontSize: 14, marginBottom: 14 }}>
        Clique num produto pra trocar a <b>foto do produto</b> e a <b>foto de cada cor</b> (por modelo — resolve cores erradas, ex.: Stanza/Chess).
        A loja é ao vivo: depois de trocar, é só dar <b>Ctrl+F5</b> na loja.
      </div>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto pelo nome ou código…" style={inp} />

      {msg && <div style={toast}>{msg}</div>}
      {erro && <div style={{ margin: "12px 0", padding: "9px 12px", borderRadius: 10, background: "#fbeeee", border: "1px solid #e3c0c0", color: "#8a2b2b", fontSize: 13.5 }}>{erro}</div>}

      {carregando ? <div style={{ padding: 30, textAlign: "center", color: "#a99e8c" }}>Carregando produtos…</div>
        : filtrados.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: "#a99e8c" }}>Nenhum produto encontrado.</div>
        : <div style={{ marginTop: 14 }}>
            {grupos.map((g) => (
              <div key={g.cat} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8a6d4f", textTransform: "uppercase", letterSpacing: 0.4, margin: "4px 2px 8px" }}>{g.cat} <span style={{ color: "#c3b7a3", fontWeight: 600 }}>· {g.itens.length}</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {g.itens.map((p) => (
                    <button key={p.id} onClick={() => setAberto(p.id)} style={linha}>
                      <div style={{ width: 46, height: 46, borderRadius: 8, flexShrink: 0, border: "1px solid #e8dfce", background: p.foto ? `#181615 center/cover url(${JSON.stringify(p.foto)})` : "#efe7d8" }} />
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nome || p.id}</div>
                        <div style={{ fontSize: 12, color: "#a99e8c" }}>{p.id} · {p.cores.length} cor(es)</div>
                      </div>
                      <div style={{ color: "#c3b7a3", fontSize: 22, flexShrink: 0 }}>›</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>}

      {prodAberto && (
        <div onClick={() => setAberto(null)} style={overlay}>
          <div onClick={(e) => e.stopPropagation()} style={modal}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{prodAberto.nome || prodAberto.id}</div>
                <div style={{ fontSize: 12, color: "#a99e8c" }}>{prodAberto.id} · {prodAberto.categoria} · {prodAberto.cores.length} cor(es)</div>
              </div>
              <button onClick={() => setAberto(null)} style={{ border: 0, background: "#efe7d8", borderRadius: 999, width: 34, height: 34, fontSize: 18, cursor: "pointer", color: "#6b645a", flexShrink: 0 }}>✕</button>
            </div>
            {msg && <div style={{ ...toast, position: "static", margin: "0 0 12px" }}>{msg}</div>}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <PickImg foto={prodAberto.foto} titulo="Foto do produto" dica="capa do card" ratio="1 / 1" w={130} onPick={(f) => trocarProduto(prodAberto, f)} onRemove={prodAberto.foto ? () => removerProduto(prodAberto) : undefined} />
              <div style={{ flex: "1 1 100%", borderTop: "1px solid #ece4d5", margin: "4px 0 2px" }} />
              {prodAberto.cores.length === 0 ? <div style={{ fontSize: 13, color: "#a99e8c" }}>Sem cores cadastradas.</div>
                : prodAberto.cores.map((c) => (
                    <PickImg key={c.id_cor} foto={c.foto} titulo={c.nome || c.id_cor} dica="foto da cor" hex={c.hex} ratio="1 / 1" w={90} onPick={(f) => trocarCor(prodAberto, c.id_cor, f)} onRemove={c.foto ? () => removerCor(prodAberto, c.id_cor) : undefined} />
                  ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #ddd5c7", borderRadius: 10, fontSize: 14 };
const linha: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1px solid #ece4d5", borderRadius: 12, background: "#fff", cursor: "pointer" };
const toast: React.CSSProperties = { position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 60, padding: "9px 16px", borderRadius: 10, background: "#f3f8ef", border: "1px solid #cfe3c0", color: "#3d5a2b", fontSize: 13.5, boxShadow: "0 4px 18px rgba(0,0,0,.12)" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(24,22,21,.5)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 16, overflow: "auto" };
const modal: React.CSSProperties = { background: "#fff", borderRadius: 16, maxWidth: 760, width: "100%", margin: "auto", padding: 18, boxShadow: "0 12px 40px rgba(0,0,0,.25)" };

// Miniatura com upload. Mostra a foto (ou o tom/hex da cor, ou "sem foto"), com botão
// "Trocar/Escolher" e, quando há foto personalizada, "Remover" (empilhado, pra caber).
function PickImg({ foto, titulo, dica, hex, ratio, w, onPick, onRemove }: {
  foto: string; titulo: string; dica: string; hex?: string; ratio: string; w: number;
  onPick: (f: File) => Promise<void> | void; onRemove?: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const tem = !!foto;
  async function pick(f: File) { setEnviando(true); try { await onPick(f); } finally { setEnviando(false); } }
  const bg = tem ? `#181615 center/cover url(${JSON.stringify(foto)})` : (hex ? hex : "#efe7d8");
  return (
    <div style={{ width: w, flexShrink: 0, boxSizing: "border-box" }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "#6b645a", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={titulo}>{titulo}</div>
      <div style={{ width: "100%", aspectRatio: ratio, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, overflow: "hidden", border: "1px solid #e8dfce" }}>
        {!tem && (enviando ? <span style={{ color: "#8a8073" }}>enviando…</span> : <span style={{ color: hex ? "#fff" : "#a99" }}>{hex ? "" : "sem foto"}</span>)}
      </div>
      <div style={{ marginTop: 6 }}>
        <label style={{ display: "block", textAlign: "center", boxSizing: "border-box", fontSize: 11.5, padding: "5px 0", borderRadius: 8, background: "#4a443c", color: "#fff", fontWeight: 600, cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.6 : 1 }}>
          {enviando ? "enviando…" : tem ? "Trocar" : "Escolher"}
          <input type="file" accept="image/*" style={{ display: "none" }} disabled={enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.currentTarget.value = ""; }} />
        </label>
        {onRemove && !enviando && <button onClick={onRemove} style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, fontSize: 11, padding: "4px 0", borderRadius: 8, border: "1px solid #e3c7c0", background: "#fff", color: "#9a4a33", cursor: "pointer" }}>Remover</button>}
      </div>
      <div style={{ fontSize: 10.5, color: "#a99e8c", marginTop: 3 }}>{dica}</div>
    </div>
  );
}
