import { useEffect, useMemo, useState } from "react";
import { api, type LojaImagemProduto } from "../api";

// Tela "Imagens da loja": a dona troca a FOTO de cada produto e a FOTO de cada COR
// (por modelo). As imagens sobem pro nosso R2; o catálogo passa a usar elas (cai na
// foto padrão quando não há troca). Depois de trocar, é só publicar o catálogo.

export default function ImagensLoja() {
  const [prods, setProds] = useState<LojaImagemProduto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState("");

  async function carregar() {
    setCarregando(true); setErro("");
    try { const r = await api.lojaImagens(); setProds(r.produtos || []); }
    catch (e) { setErro((e as Error).message || "Não consegui carregar os produtos."); }
    finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? prods.filter((p) => p.nome.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)) : prods;
  }, [prods, busca]);

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
    setMsg("");
    try { const url = await subir(file); if (!url) return; await api.lojaImagemSalvar("produto", p.id, "", url); setFotoProduto(p.id, url); setMsg("✓ Foto do produto atualizada — publique o catálogo pra ir pro ar."); }
    catch { setMsg("Não consegui enviar a imagem."); }
  }
  async function trocarCor(p: LojaImagemProduto, corId: string, file: File) {
    setMsg("");
    try { const url = await subir(file); if (!url) return; await api.lojaImagemSalvar("cor", p.id, corId, url); setFotoCor(p.id, corId, url); setMsg("✓ Foto da cor atualizada — publique o catálogo pra ir pro ar."); }
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
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "18px 16px 80px" }}>
      <h1 style={{ fontSize: 24, margin: "4px 0 2px" }}>Imagens da loja</h1>
      <div style={{ color: "#8a8073", fontSize: 14, marginBottom: 14 }}>
        Troque a <b>foto do produto</b> e a <b>foto de cada cor</b> (por modelo — resolve cores que ficaram erradas, ex.: Stanza/Chess).
        As imagens ficam no nosso servidor. Depois de trocar, <a href="/config-loja" style={{ color: "#ad5033" }}>publique o catálogo</a> pra ir pro ar.
      </div>
      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto pelo nome ou código…" style={inp} />
      {msg && <div style={{ margin: "12px 0", padding: "9px 12px", borderRadius: 10, background: "#f3f8ef", border: "1px solid #cfe3c0", color: "#3d5a2b", fontSize: 13.5 }}>{msg}</div>}
      {erro && <div style={{ margin: "12px 0", padding: "9px 12px", borderRadius: 10, background: "#fbeeee", border: "1px solid #e3c0c0", color: "#8a2b2b", fontSize: 13.5 }}>{erro}</div>}

      {carregando ? <div style={{ padding: 30, textAlign: "center", color: "#a99e8c" }}>Carregando produtos…</div>
        : filtrados.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: "#a99e8c" }}>Nenhum produto encontrado.</div>
        : <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            {filtrados.map((p) => (
              <div key={p.id} style={{ border: "1px solid #ece4d5", borderRadius: 14, padding: 14, background: "#fff", display: "flex", gap: 16, flexWrap: "wrap" }}>
                <PickImg foto={p.foto} titulo="Foto do produto" dica="capa do card" ratio="1 / 1" w={120} onPick={(f) => trocarProduto(p, f)} onRemove={p.foto ? () => removerProduto(p) : undefined} />
                <div style={{ flex: "1 1 260px", minWidth: 240 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{p.nome || p.id}</div>
                  <div style={{ fontSize: 12, color: "#a99e8c", marginBottom: 8 }}>{p.id} · {p.secao === "edicao" ? "Edição Limitada" : "Catálogo"} · {p.cores.length} cor(es)</div>
                  {p.cores.length === 0 ? <div style={{ fontSize: 13, color: "#a99e8c" }}>Sem cores cadastradas.</div>
                    : <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {p.cores.map((c) => (
                          <PickImg key={c.id_cor} foto={c.foto} titulo={c.nome || c.id_cor} dica="foto da cor" hex={c.hex} ratio="1 / 1" w={84} onPick={(f) => trocarCor(p, c.id_cor, f)} onRemove={c.foto ? () => removerCor(p, c.id_cor) : undefined} />
                        ))}
                      </div>}
                </div>
              </div>
            ))}
          </div>}
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #ddd5c7", borderRadius: 10, fontSize: 14 };

// Miniatura com upload. Mostra a foto (ou o tom/hex da cor, ou "sem imagem"), com
// botão "Trocar/Escolher" e, quando há foto personalizada, "Remover".
function PickImg({ foto, titulo, dica, hex, ratio, w, onPick, onRemove }: {
  foto: string; titulo: string; dica: string; hex?: string; ratio: string; w: number;
  onPick: (f: File) => Promise<void> | void; onRemove?: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const tem = !!foto;
  async function pick(f: File) { setEnviando(true); try { await onPick(f); } finally { setEnviando(false); } }
  const bg = tem ? `#181615 center/cover url(${JSON.stringify(foto)})` : (hex ? hex : "#efe7d8");
  return (
    <div style={{ width: w }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "#6b645a", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={titulo}>{titulo}</div>
      <div style={{ width: "100%", aspectRatio: ratio, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, overflow: "hidden", border: "1px solid #e8dfce" }}>
        {!tem && (enviando ? <span style={{ color: "#8a8073" }}>enviando…</span> : <span style={{ color: hex ? "#fff" : "#a99" }}>{hex ? "" : "sem foto"}</span>)}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
        <label style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 8, background: "#4a443c", color: "#fff", fontWeight: 600, cursor: enviando ? "default" : "pointer", opacity: enviando ? 0.6 : 1 }}>
          {enviando ? "…" : tem ? "Trocar" : "Escolher"}
          <input type="file" accept="image/*" style={{ display: "none" }} disabled={enviando} onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.currentTarget.value = ""; }} />
        </label>
        {onRemove && !enviando && <button onClick={onRemove} style={{ fontSize: 11.5, padding: "5px 8px", borderRadius: 8, border: "1px solid #e3c7c0", background: "#fff", color: "#9a4a33", cursor: "pointer" }}>Remover</button>}
      </div>
      <div style={{ fontSize: 10.5, color: "#a99e8c", marginTop: 2 }}>{dica}</div>
    </div>
  );
}
