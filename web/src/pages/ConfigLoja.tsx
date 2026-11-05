import { useEffect, useState } from "react";
import { api, type LojaBanner, type CatalogoProdutoExtra, type ZapiConfig } from "../api";

// Tela "Configurar catálogo": banners da loja + vídeos/textos dos produtos.
// Só aparência/conteúdo do catálogo — não mexe em preço, estoque nem pedidos.

const LOJA_URL = "/api/integracao/loja";

function uid() { return Math.random().toString(36).slice(2, 9); }

export default function ConfigLoja() {
  const [aba, setAba] = useState<"banner" | "textos" | "loja">("banner");
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "18px 16px 80px" }}>
      <h1 style={{ fontSize: 24, margin: "4px 0 2px" }}>Configurar catálogo</h1>
      <div style={{ color: "#8a8073", fontSize: 14, marginBottom: 16 }}>
        Aparência e conteúdo da loja. <a href={LOJA_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#ad5033" }}>Abrir a loja ↗</a>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button onClick={() => setAba("banner")} style={tab(aba === "banner")}>🖼️ Banner</button>
        <button onClick={() => setAba("textos")} style={tab(aba === "textos")}>🎬 Vídeos e textos</button>
        <button onClick={() => setAba("loja")} style={tab(aba === "loja")}>🛒 Loja B2B / Reserva</button>
      </div>
      {aba === "banner" ? <Banners /> : aba === "textos" ? <Textos /> : <LojaB2B />}
    </div>
  );
}

function tab(on: boolean): React.CSSProperties {
  return { padding: "9px 18px", borderRadius: 999, border: "1px solid " + (on ? "#ad5033" : "#e0d8c9"), background: on ? "#ad5033" : "#fff", color: on ? "#fff" : "#4a443c", fontWeight: 600, cursor: "pointer", fontSize: 14 };
}
const inp: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #ddd5c7", borderRadius: 10, fontSize: 14 };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#6b645a", margin: "10px 0 4px" };
const btnPri: React.CSSProperties = { padding: "11px 20px", border: 0, borderRadius: 10, background: "#ad5033", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14 };

// ─────────────────────────── BANNERS ───────────────────────────
function Banners() {
  const [lista, setLista] = useState<LojaBanner[]>([]);
  const [intervalo, setIntervalo] = useState(5);
  const [prods, setProds] = useState<{ id: string; nome: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { api.lojaBanners().then((r) => { setLista(r.banners || []); setIntervalo(r.intervalo || 5); }).catch(() => setLista([])).finally(() => setCarregando(false)); }, []);
  useEffect(() => { api.catalogoProdutosExtra().then((l) => setProds(l.map((p) => ({ id: p.id, nome: p.nome })))).catch(() => setProds([])); }, []);

  function up<K extends keyof LojaBanner>(i: number, k: K, v: LojaBanner[K]) {
    setLista((l) => l.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  }
  function add() { setLista((l) => [...l, { id: uid(), ativo: true, ordem: l.length }]); }
  function rm(i: number) { setLista((l) => l.filter((_, j) => j !== i)); }
  function mover(i: number, d: number) {
    setLista((l) => { const n = [...l]; const j = i + d; if (j < 0 || j >= n.length) return l; [n[i], n[j]] = [n[j], n[i]]; return n.map((b, k) => ({ ...b, ordem: k })); });
  }
  async function enviarImg(i: number, f: File, campo: "img" | "img_mobile") {
    up(i, campo, "…enviando");
    try { const r = await api.bannerUpload(f); if (r.ok && r.url) up(i, campo, r.url); else { up(i, campo, ""); setMsg(r.error || "Não consegui enviar a imagem."); } }
    catch { up(i, campo, ""); setMsg("Não consegui enviar a imagem."); }
  }
  async function salvar() {
    setSalvando(true); setMsg("");
    try { await api.lojaBannersSalvar(lista.map((b, k) => ({ ...b, ordem: k })), intervalo); setMsg("✓ Salvo! Atualize a loja (Ctrl+F5) pra ver."); }
    catch { setMsg("Não consegui salvar. Tente de novo."); }
    finally { setSalvando(false); }
  }

  if (carregando) return <div style={{ color: "#8a8073" }}>Carregando…</div>;
  return (
    <div>
      <div style={{ color: "#8a8073", fontSize: 13.5, marginBottom: 12 }}>
        O banner aparece no topo da loja (abaixo do cabeçalho). Você pode ter mais de um — eles se alternam.
      </div>
      <div style={{ background: "#fbf6ee", border: "1px solid #ecdfc9", borderRadius: 12, padding: "12px 14px", marginBottom: 16, fontSize: 13, color: "#6b5f49", lineHeight: 1.55 }}>
        <b>📐 Tamanho das imagens</b><br />
        • <b>Computador</b>: imagem deitada, <b>1920 × 600 px</b> (JPG/PNG/WEBP, até 1 MB).<br />
        • <b>Celular</b>: imagem mais quadrada, <b>1080 × 1080 px</b>.<br />
        • O <b>texto e o botão</b> ficam à <b>esquerda</b> — deixe esse lado mais limpo e ponha o assunto (almofadas, ambiente) mais ao centro/direita.
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13.5, fontWeight: 600, color: "#4a443c" }}>⏱️ Tempo de cada banner:</label>
        <input type="number" min={2} max={30} value={intervalo} onChange={(e) => setIntervalo(Math.max(2, Math.min(30, Number(e.target.value) || 5)))}
          style={{ width: 70, padding: "8px 10px", border: "1px solid #ddd5c7", borderRadius: 10, fontSize: 14 }} />
        <span style={{ fontSize: 13, color: "#8a8073" }}>segundos (padrão 5). Vale quando há 2 ou mais banners ativos.</span>
      </div>
      {lista.length === 0 && <div style={{ color: "#8a8073", padding: "20px 0" }}>Nenhum banner ainda. Clique em "➕ Novo banner".</div>}
      {lista.map((b, i) => (
        <div key={b.id || i} style={{ background: "#fff", border: "1px solid #ece5d8", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 1px 2px rgba(60,48,32,.05)" }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ width: 260, flexShrink: 0 }}>
              <ImgUpload titulo="Imagem do computador" dica="1920 × 600 px (deitada)" ratio="16/7" valor={b.img} onPick={(f) => enviarImg(i, f, "img")} />
              <div style={{ height: 12 }} />
              <ImgUpload titulo="Imagem do celular" dica="1080 × 1080 px (quadrada)" ratio="1/1" valor={b.img_mobile} onPick={(f) => enviarImg(i, f, "img_mobile")} />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={lbl}>Título (frase grande)</label>
              <input style={inp} value={b.titulo || ""} placeholder="Ex.: Tricô que transforma ambientes" onChange={(e) => up(i, "titulo", e.target.value)} />
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}><label style={lbl}>Texto de cima (pequeno)</label><input style={inp} value={b.kicker || ""} placeholder="Ex.: Pronta entrega" onChange={(e) => up(i, "kicker", e.target.value)} /></div>
                <div style={{ flex: 1 }}><label style={lbl}>Texto de baixo (pequeno)</label><input style={inp} value={b.sub || ""} placeholder="Ex.: Qualidade · Design" onChange={(e) => up(i, "sub", e.target.value)} /></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}><label style={lbl}>Botão (texto)</label><input style={inp} value={b.botao_texto || ""} placeholder="Ex.: Ver produtos" onChange={(e) => up(i, "botao_texto", e.target.value)} /></div>
                <div style={{ flex: 1.4 }}><label style={lbl}>Botão (link externo)</label><input style={inp} value={b.botao_link || ""} placeholder="https://..." onChange={(e) => up(i, "botao_link", e.target.value)} /></div>
              </div>
              <label style={lbl}>Abrir um PRODUTO ao clicar no banner (opcional)</label>
              <select style={inp} value={b.produto_id || ""} onChange={(e) => up(i, "produto_id", e.target.value)}>
                <option value="">— nenhum (usa o link externo acima, se houver) —</option>
                {prods.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <div style={{ fontSize: 11.5, color: "#9a8f7a", marginTop: 3 }}>Escolhendo um produto, o banner inteiro abre a janela daquele produto na loja (tem prioridade sobre o link externo).</div>
              <div style={{ marginTop: 10, padding: "10px 12px", background: "#f8f5ef", border: "1px solid #ece3d2", borderRadius: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6b5f49", marginBottom: 6 }}>🗓️ Agendamento (opcional) <span style={{ fontWeight: 400, color: "#9a8f7a" }}>· horário de Brasília</span></div>
                <label style={lbl}>Nome da campanha (interno)</label>
                <input style={inp} value={b.nome || ""} placeholder="Ex.: Promoção de Natal" onChange={(e) => up(i, "nome", e.target.value)} />
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={lbl}>Começa em</label>
                    <input type="datetime-local" style={inp} value={b.inicio || ""} onChange={(e) => up(i, "inicio", e.target.value)} />
                    <div style={{ fontSize: 11, color: "#9a8f7a", marginTop: 3 }}>Vazio = exibir imediatamente.</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <label style={lbl}>Termina em</label>
                    <input type="datetime-local" style={inp} value={b.fim || ""} onChange={(e) => up(i, "fim", e.target.value)} />
                    <div style={{ fontSize: 11, color: "#9a8f7a", marginTop: 3 }}>Vazio = sem data de término.</div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, cursor: "pointer" }}>
                  <input type="checkbox" checked={b.ativo !== false} onChange={(e) => up(i, "ativo", e.target.checked)} /> Mostrar na loja
                </label>
                {(() => { const s = statusBanner(b); return <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: s.bg, color: s.cor }}>{s.txt}</span>; })()}
                <span style={{ flex: 1 }} />
                <button onClick={() => mover(i, -1)} disabled={i === 0} style={btnMini(i === 0)}>↑</button>
                <button onClick={() => mover(i, 1)} disabled={i === lista.length - 1} style={btnMini(i === lista.length - 1)}>↓</button>
                <button onClick={() => rm(i)} style={{ ...btnMini(false), color: "#b3402a", borderColor: "#e7c3ba" }}>Remover</button>
              </div>
            </div>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
        <button onClick={add} style={{ ...btnPri, background: "#fff", color: "#ad5033", border: "1px solid #ad5033" }}>➕ Novo banner</button>
        <button onClick={salvar} disabled={salvando} style={btnPri}>{salvando ? "Salvando…" : "Salvar banners"}</button>
        {msg && <span style={{ fontSize: 13.5, color: msg.startsWith("✓") ? "#4f7a44" : "#b3402a" }}>{msg}</span>}
      </div>
    </div>
  );
}
function btnMini(dis: boolean): React.CSSProperties {
  return { padding: "7px 12px", borderRadius: 8, border: "1px solid #ddd5c7", background: "#fff", color: "#4a443c", fontWeight: 600, cursor: dis ? "default" : "pointer", opacity: dis ? 0.4 : 1, fontSize: 13 };
}
// Status do banner AGORA (hora local do navegador ≈ Brasília) — só uma dica visual.
function statusBanner(b: LojaBanner): { txt: string; bg: string; cor: string } {
  if (b.ativo === false) return { txt: "Oculto", bg: "#eee8dd", cor: "#8a8073" };
  const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  const agora = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  if ((b.inicio || "").trim() && agora < (b.inicio as string)) return { txt: "Agendado", bg: "#fef3c7", cor: "#92600a" };
  if ((b.fim || "").trim() && agora > (b.fim as string)) return { txt: "Encerrado", bg: "#fde2e1", cor: "#b3402a" };
  return { txt: "No ar", bg: "#dcfce7", cor: "#166534" };
}
function ImgUpload({ titulo, dica, ratio, valor, onPick }: { titulo: string; dica: string; ratio: string; valor?: string; onPick: (f: File) => void }) {
  const tem = !!valor && valor !== "…enviando";
  const enviando = valor === "…enviando";
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "#6b645a", marginBottom: 4 }}>{titulo} <span style={{ color: "#a99e8c", fontWeight: 400 }}>· {dica}</span></div>
      <div style={{ width: "100%", aspectRatio: ratio, borderRadius: 10, background: tem ? `#181615 center/cover url(${JSON.stringify(valor)})` : "#efe7d8", display: "flex", alignItems: "center", justifyContent: "center", color: "#a99", fontSize: 12.5, overflow: "hidden", border: "1px solid #e8dfce" }}>
        {!tem && (enviando ? "enviando…" : "sem imagem")}
      </div>
      <label style={{ display: "inline-block", marginTop: 6, fontSize: 12.5, padding: "7px 13px", borderRadius: 8, background: "#4a443c", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
        {tem ? "Trocar" : "Escolher imagem"}
        <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = ""; }} />
      </label>
    </div>
  );
}

// ─────────────────────────── VÍDEOS E TEXTOS ───────────────────────────
function Textos() {
  const [prods, setProds] = useState<CatalogoProdutoExtra[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [edit, setEdit] = useState<CatalogoProdutoExtra | null>(null);

  useEffect(() => { api.catalogoProdutosExtra().then(setProds).catch(() => setProds([])).finally(() => setCarregando(false)); }, []);
  const q = busca.trim().toLowerCase();
  const lista = prods.filter((p) => !q || p.nome.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));

  function salvo(id: string, video: string, texto: string) {
    setProds((l) => l.map((p) => (p.id === id ? { ...p, extra_video: video, extra_texto: texto, tem_video: p.tem_video || !!video.trim() } : p)));
    setEdit(null);
  }

  if (carregando) return <div style={{ color: "#8a8073" }}>Carregando produtos…</div>;
  return (
    <div>
      <div style={{ color: "#8a8073", fontSize: 13.5, marginBottom: 12 }}>
        Coloque um <b>vídeo</b> e/ou <b>texto</b> em qualquer produto. O que você salvar aqui aparece na loja (vence o catálogo antigo).
      </div>
      <input style={{ ...inp, maxWidth: 420, marginBottom: 14 }} placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div style={{ border: "1px solid #ece5d8", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        {lista.slice(0, 300).map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: "1px solid #f1ebe0" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nome} {p.kit && <span style={{ fontSize: 11, color: "#ad5033" }}>• kit</span>}</div>
              <div style={{ fontSize: 12, color: "#9a9185" }}>
                {p.extra_video ? "🎬 vídeo próprio" : p.tem_video ? "vídeo do catálogo" : "sem vídeo"}
                {p.extra_texto ? " · 📝 texto próprio" : ""}
              </div>
            </div>
            <button onClick={() => setEdit(p)} style={{ ...btnMini(false), borderColor: "#ad5033", color: "#ad5033" }}>Editar</button>
          </div>
        ))}
        {!lista.length && <div style={{ padding: 20, color: "#8a8073" }}>Nenhum produto encontrado.</div>}
      </div>
      {edit && <EditarExtra p={edit} onClose={() => setEdit(null)} onSalvo={salvo} />}
    </div>
  );
}

function EditarExtra({ p, onClose, onSalvo }: { p: CatalogoProdutoExtra; onClose: () => void; onSalvo: (id: string, video: string, texto: string) => void }) {
  const [video, setVideo] = useState(p.extra_video || "");
  const [texto, setTexto] = useState(p.extra_texto || "");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  async function salvar() {
    setSalvando(true); setMsg("");
    try { await api.produtoExtraSalvar(p.id, video.trim(), texto.trim()); onSalvo(p.id, video.trim(), texto.trim()); }
    catch { setMsg("Não consegui salvar."); setSalvando(false); }
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(44,39,33,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 520, width: "100%", padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{p.nome}</div>
        <div style={{ fontSize: 12, color: "#9a9185", marginBottom: 12 }}>código {p.id}</div>
        <label style={lbl}>Link do vídeo (mp4)</label>
        <input style={inp} value={video} placeholder="https://.../video.mp4" onChange={(e) => setVideo(e.target.value)} />
        <label style={lbl}>Texto / descrição (uma linha por item)</label>
        <textarea style={{ ...inp, minHeight: 110, resize: "vertical", fontFamily: "inherit" }} value={texto} placeholder={"Ex.:\nComposição 100% poliéster\nCapa com zíper invisível\nEnviamos em até 7 dias"} onChange={(e) => setTexto(e.target.value)} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
          <button onClick={salvar} disabled={salvando} style={btnPri}>{salvando ? "Salvando…" : "Salvar"}</button>
          <button onClick={onClose} style={{ ...btnMini(false) }}>Cancelar</button>
          {msg && <span style={{ fontSize: 13, color: "#b3402a" }}>{msg}</span>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── LOJA B2B / RESERVA ───────────────────────────
// Interruptores e preços da loja/reserva (antes ficavam na Conexão do WhatsApp).
// Carrega/salva pela mesma config do servidor (atendConfig / atendSalvarConfig).
function LojaB2B() {
  const [cfg, setCfg] = useState<ZapiConfig | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [diag, setDiag] = useState<{ desc_el_pct: string; linhas: { modelo: string; peca: string; sul0: number | null; sul: number; pct: number; risca: boolean }[] } | null>(null);
  const [diagLoad, setDiagLoad] = useState(false);
  function verDiag() {
    setDiagLoad(true);
    api.elDiag().then(setDiag).catch(() => setMsg("Não consegui carregar o diagnóstico.")).finally(() => setDiagLoad(false));
  }
  useEffect(() => { api.atendConfig().then(setCfg).catch(() => setMsg("Não consegui carregar a configuração.")); }, []);
  const set = (k: keyof ZapiConfig, v: string | boolean) => setCfg((c) => (c ? { ...c, [k]: v } : c));
  async function salvar() {
    if (!cfg) return;
    setSalvando(true); setMsg("");
    try {
      await api.atendSalvarConfig({
        reservas_ativo: cfg.reservas_ativo, pcp_popup_ativo: cfg.pcp_popup_ativo, crm_popup_ativo: cfg.crm_popup_ativo,
        aviso_carrinho_ativo: cfg.aviso_carrinho_ativo, aviso_carrinho_minutos: cfg.aviso_carrinho_minutos,
        reserva_janela_minutos: cfg.reserva_janela_minutos, envio_hora_ini: cfg.envio_hora_ini, envio_hora_fim: cfg.envio_hora_fim,
        desc_el_pct: cfg.desc_el_pct,
      });
      setMsg("✓ Salvo! Atualize a loja (Ctrl+F5) pra ver."); setTimeout(() => setMsg(""), 3000);
    } catch { setMsg("Não consegui salvar."); } finally { setSalvando(false); }
  }
  if (!cfg) return <div style={{ color: "#8a8073" }}>Carregando…{msg && " · " + msg}</div>;
  const on = (k: keyof ZapiConfig) => cfg[k] === true;
  const linha = (k: keyof ZapiConfig, titulo: string, desc: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 10, borderRadius: 10, border: "2px solid " + (on(k) ? "#22c55e" : "#e2e8f0"), background: on(k) ? "#f0fdf4" : "#fbfaf7" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>{on(k) ? "🟢 " + titulo + " LIGADO" : "⚪ " + titulo + " desligado"}</div>
        <div style={{ fontSize: 12, color: "#6b645a" }}>{desc}</div>
      </div>
      <button type="button" onClick={() => set(k, !on(k))} style={{ ...btnMini(false), borderColor: on(k) ? "#94a3b8" : "#ad5033", color: on(k) ? "#475569" : "#ad5033", fontWeight: 700 }}>{on(k) ? "Desligar" : "Ligar"}</button>
    </div>
  );
  return (
    <div>
      <div style={{ color: "#8a8073", fontSize: 13.5, marginBottom: 14 }}>Reserva de estoque, avisos e preços da loja B2B. O que você salvar aqui vale na hora (atualize a loja com Ctrl+F5).</div>
      {/* Desconto da Edição Limitada */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 14, borderRadius: 10, border: "2px solid " + (Number(cfg.desc_el_pct) > 0 ? "#ad5033" : "#e2e8f0"), background: Number(cfg.desc_el_pct) > 0 ? "#fff7ed" : "#fbfaf7" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>🏷️ Desconto da Edição Limitada</div>
          <div style={{ fontSize: 12, color: "#6b645a" }}>Aplica esse % de desconto em <b>todos</b> os produtos de Edição Limitada. O preço com desconto é o que vai no pedido e é enviado ao Syntech. 0 = sem desconto.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="number" min={0} max={90} value={cfg.desc_el_pct} onChange={(e) => set("desc_el_pct", e.target.value)} style={{ ...inp, width: 80, textAlign: "right" }} placeholder="0" />
          <span style={{ fontWeight: 800, color: "#ad5033" }}>%</span>
          <button type="button" onClick={verDiag} disabled={diagLoad} style={{ marginLeft: 10, fontSize: 12, color: "#ad5033", fontWeight: 700, whiteSpace: "nowrap", background: "#fff", border: "1px solid #ad5033", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }} title="Ver preço cheio × com desconto de cada peça EL">{diagLoad ? "…" : "🔍 Diagnóstico"}</button>
        </div>
      </div>
      {diag ? (
        <div style={{ marginBottom: 14, border: "1px solid #f0d9c4", background: "#fff7ed", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 12.5, color: "#6b645a", marginBottom: 10, lineHeight: 1.5 }}>
            Desconto configurado (desc_el_pct): <b>{diag.desc_el_pct}%</b>. Pra aparecer o <b>riscado</b>, o <b>preço cheio</b> tem que ser maior que o <b>com desconto</b> (coluna Risca = ✅).
            Se o % é 0 e os preços são iguais, não há desconto: ponha o preço <b>cheio</b> no Syntech e o <b>%</b> aqui em cima.
          </div>
          {diag.linhas.length === 0 ? <div style={{ color: "#8a8073" }}>Nenhum produto de Edição Limitada com estoque.</div> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead><tr>{["Modelo", "Peça", "Preço cheio", "Com desconto", "% desc", "Risca?"].map((h, i) => (
                  <th key={i} style={{ border: "1px solid #e2ddd3", padding: "6px 9px", background: "#f3efe8", textAlign: i >= 2 && i <= 4 ? "right" : "left" }}>{h}</th>
                ))}</tr></thead>
                <tbody>
                  {diag.linhas.map((l, i) => (
                    <tr key={i}>
                      <td style={{ border: "1px solid #e2ddd3", padding: "6px 9px" }}>{l.modelo}</td>
                      <td style={{ border: "1px solid #e2ddd3", padding: "6px 9px" }}>{l.peca}</td>
                      <td style={{ border: "1px solid #e2ddd3", padding: "6px 9px", textAlign: "right" }}>{l.sul0 == null ? "—" : "R$ " + l.sul0.toFixed(2).replace(".", ",")}</td>
                      <td style={{ border: "1px solid #e2ddd3", padding: "6px 9px", textAlign: "right" }}>{"R$ " + l.sul.toFixed(2).replace(".", ",")}</td>
                      <td style={{ border: "1px solid #e2ddd3", padding: "6px 9px", textAlign: "right" }}>{l.pct}%</td>
                      <td style={{ border: "1px solid #e2ddd3", padding: "6px 9px", textAlign: "center", color: l.risca ? "#166534" : "#b45309", fontWeight: 700 }}>{l.risca ? "✅" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
      {linha("reservas_ativo", "Reserva de estoque (ED/KT)", "O carrinho segura o estoque das peças ED e KT e envia os avisos de reserva no WhatsApp.")}
      {linha("pcp_popup_ativo", "Pop-up “conferir no Syntech”", "Quando um pedido da loja entra no Syntech, aparece um aviso no sistema para a equipe ir aprovar lá.")}
      {linha("crm_popup_ativo", "Aviso ao vendedor (CRM)", "O vendedor interno dono da carteira recebe um aviso quando o cliente dele faz um pedido.")}
      {linha("aviso_carrinho_ativo", "Lembrete de carrinho abandonado", "Se o cliente monta o pedido e não envia, cerca de 1h depois recebe um lembrete no WhatsApp (só no horário de envio).")}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "10px 14px", marginBottom: 10, borderRadius: 10, border: "1px solid #ece5d8", background: "#fbfaf7" }}>
        <label style={{ flex: "1 1 180px" }}><span style={lbl}>Lembrete de carrinho: enviar após (min)</span>
          <input type="number" min={1} value={cfg.aviso_carrinho_minutos} onChange={(e) => set("aviso_carrinho_minutos", e.target.value)} style={inp} placeholder="60" /></label>
        <label style={{ flex: "1 1 180px" }}><span style={lbl}>Validade do carrinho/reserva (min)</span>
          <input type="number" min={5} value={cfg.reserva_janela_minutos} onChange={(e) => set("reserva_janela_minutos", e.target.value)} style={inp} placeholder="720" /></label>
        <label style={{ flex: "1 1 120px" }}><span style={lbl}>Enviar msgs a partir das (h)</span>
          <input type="number" min={0} max={23} value={cfg.envio_hora_ini} onChange={(e) => set("envio_hora_ini", e.target.value)} style={inp} placeholder="8" /></label>
        <label style={{ flex: "1 1 120px" }}><span style={lbl}>…até as (h)</span>
          <input type="number" min={1} max={24} value={cfg.envio_hora_fim} onChange={(e) => set("envio_hora_fim", e.target.value)} style={inp} placeholder="20" /></label>
        <div style={{ flexBasis: "100%", fontSize: 11, color: "#9a9185" }}>Padrão: 60 min (lembrete), 720 min = 12h (validade), envio 8h–20h. Para testar fora do horário, use 0 e 24; depois volte para 8 e 20.</div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
        <button onClick={salvar} disabled={salvando} style={btnPri}>{salvando ? "Salvando…" : "Salvar"}</button>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith("✓") ? "#15803d" : "#b3402a" }}>{msg}</span>}
      </div>
    </div>
  );
}
