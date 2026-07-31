import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AtendBoard, type AtendConversa, type AtendConversaDetalhe, type ZapiConfig, type Representante } from "../api";

function iniciais(s?: string | null) {
  return (s || "?").replace(/\D/g, "").slice(-2) || (s || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function telBonito(t: string) {
  const d = (t || "").replace(/\D/g, "");
  const n = d.startsWith("55") ? d.slice(2) : d;
  return n.length >= 10 ? `(${n.slice(0, 2)}) ${n.slice(2, 3)} ${n.slice(3, 7)}-${n.slice(7, 11)}` : t;
}
function hora(iso?: string | null) {
  if (!iso) return "";
  const m = iso.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}
const SETOR_EMOJI: Record<string, string> = { vendas: "🛒", financeiro: "💰", "pos-venda": "📦", outros: "💬" };

// ── Página do robô de atendimento ────────────────────────────────────────────────
export function Atendimento() {
  const [board, setBoard] = useState<AtendBoard | null>(null);
  const [abrir, setAbrir] = useState<string | null>(null);
  const [sim, setSim] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [conectado, setConectado] = useState<boolean | null>(null);

  function recarregar() { api.atendBoard().then(setBoard).catch(() => {}); }
  function checarConexao() { api.atendConfig().then((c) => setConectado(c.zapi_ativo && !!c.zapi_instance && !!c.zapi_token)).catch(() => setConectado(false)); }
  useEffect(() => { recarregar(); checarConexao(); const t = setInterval(recarregar, 8000); return () => clearInterval(t); }, []);

  return (
    <div className="quadro-page" style={{ maxWidth: "none" }}>
      <div className="page-head">
        <div><h1>Atendimento</h1><div className="breadcrumb">Comercial › Atendimento (robô do WhatsApp)</div></div>
        <div className="row-gap" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="at-status">{conectado == null ? "…" : conectado ? "🟢 WhatsApp conectado (Z-API)" : "🟡 Z-API desligada (simulação)"}</span>
          <button className="btn btn-soft" onClick={() => setCfgOpen(true)}>⚙️ Conexão</button>
          <button className="btn btn-primary" onClick={() => setSim(true)}>💬 Simular cliente</button>
        </div>
      </div>

      {!board ? (
        <div className="card pad muted">Carregando…</div>
      ) : (
        <div className="fx-board">
          {board.colunas.map((col) => {
            const cs = board.conversas.filter((c) => c.coluna === col.id);
            return (
              <div className="fx-col" key={col.id}>
                <div className="fx-hd"><span className="fx-dot" style={{ background: col.cor }} />{col.label}<span className="ct">{cs.length}</span></div>
                {cs.map((c) => <ConvMini key={c.id} c={c} onAbrir={() => setAbrir(c.id)} />)}
              </div>
            );
          })}
        </div>
      )}

      {sim && <Simulador onFechar={() => setSim(false)} onMudou={recarregar} />}
      {abrir && <ConversaModal id={abrir} onFechar={() => setAbrir(null)} onMudou={recarregar} />}
      {cfgOpen && <ConfigZapi onFechar={() => setCfgOpen(false)} onMudou={checarConexao} />}
    </div>
  );
}

// ── Configuração da conexão Z-API (WhatsApp não-oficial) ─────────────────────────
function ConfigZapi({ onFechar, onMudou }: { onFechar: () => void; onMudou: () => void }) {
  const [cfg, setCfg] = useState<ZapiConfig | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [telTeste, setTelTeste] = useState("");

  useEffect(() => { api.atendConfig().then(setCfg).catch(() => setMsg("Não consegui carregar a configuração.")); }, []);
  const set = (k: keyof ZapiConfig, v: string | boolean) => setCfg((c) => (c ? { ...c, [k]: v } : c));

  async function salvar() {
    if (!cfg) return;
    setSalvando(true); setMsg("");
    try {
      await api.atendSalvarConfig({ zapi_base: cfg.zapi_base, zapi_instance: cfg.zapi_instance, zapi_token: cfg.zapi_token, zapi_client_token: cfg.zapi_client_token, zapi_ativo: cfg.zapi_ativo, atendimento_ativo: cfg.atendimento_ativo, catalogo_url: cfg.catalogo_url, catalogo_senha: cfg.catalogo_senha, catalogo_msg: cfg.catalogo_msg });
      setMsg("✓ Salvo!"); onMudou(); setTimeout(() => setMsg(""), 2500);
    } catch { setMsg("Erro ao salvar."); } finally { setSalvando(false); }
  }
  async function testar() {
    const tel = telTeste.replace(/\D/g, "");
    if (!tel) { setMsg("Digite um número (com DDD) pra testar."); return; }
    setMsg("Enviando teste…");
    try {
      const r = await api.atendTestarZapi(tel);
      setMsg(r.enviado ? "✓ Enviado! Veja o WhatsApp do número de teste." : `Falhou: ${r.motivo || "erro"}. Salvou as credenciais e ligou a conexão?`);
    } catch { setMsg("Erro ao testar."); }
  }

  const copiar = (t: string) => navigator.clipboard?.writeText(t).then(() => { setMsg("Webhook copiado!"); setTimeout(() => setMsg(""), 2000); });

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 560, width: "min(560px,96vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>⚙️ Conexão do WhatsApp (Z-API)</h2>
        {!cfg ? <p className="muted">Carregando…</p> : (
          <>
            {/* Interruptor mestre — liga/desliga o robô com clientes reais */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 14, borderRadius: 10, border: "2px solid " + (cfg.atendimento_ativo ? "#22c55e" : "#f59e0b"), background: cfg.atendimento_ativo ? "#f0fdf4" : "#fffbeb" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>{cfg.atendimento_ativo ? "🟢 Atendimento automático LIGADO" : "🟡 Atendimento automático DESLIGADO"}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{cfg.atendimento_ativo ? "O robô responde clientes reais no WhatsApp." : "Modo teste: o robô NÃO responde clientes reais. Use o Simulador."}</div>
              </div>
              <button type="button" className={"btn " + (cfg.atendimento_ativo ? "btn-soft" : "btn-primary")} onClick={() => set("atendimento_ativo", !cfg.atendimento_ativo)}>
                {cfg.atendimento_ativo ? "Desligar" : "Ligar"}
              </button>
            </div>
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginBottom: 14, color: "#92400e" }}>
              API não-oficial: use um <b>chip dedicado</b> (não seu número pessoal). Há risco de bloqueio pelo WhatsApp se disparar em massa.
            </div>

            <label className="campo"><span className="campo-label">Instância (Instance ID)</span>
              <input value={cfg.zapi_instance} onChange={(e) => set("zapi_instance", e.target.value)} placeholder="cole aqui o ID da instância Z-API" /></label>
            <label className="campo"><span className="campo-label">Token da instância</span>
              <input value={cfg.zapi_token} onChange={(e) => set("zapi_token", e.target.value)} placeholder="cole o token da instância" /></label>
            <label className="campo"><span className="campo-label">Client-Token (segurança da conta)</span>
              <input value={cfg.zapi_client_token} onChange={(e) => set("zapi_client_token", e.target.value)} placeholder="Account Security Token (menu Segurança do painel)" /></label>
            <label className="campo"><span className="campo-label">URL base (deixe o padrão)</span>
              <input value={cfg.zapi_base} onChange={(e) => set("zapi_base", e.target.value)} placeholder="https://api.z-api.io" /></label>
            <label className="campo"><span className="campo-label">📒 Link do catálogo (enviado ao lojista)</span>
              <input value={cfg.catalogo_url} onChange={(e) => set("catalogo_url", e.target.value)} placeholder="cole o link público do catálogo" /></label>
            <label className="campo"><span className="campo-label">🔑 Senha do catálogo (única p/ lojistas)</span>
              <input value={cfg.catalogo_senha} onChange={(e) => set("catalogo_senha", e.target.value)} placeholder="deixe em branco se o catálogo não tem senha" /></label>
            <label className="campo"><span className="campo-label">💬 Mensagem do catálogo (cola a sua — opcional)</span>
              <textarea value={cfg.catalogo_msg} onChange={(e) => set("catalogo_msg", e.target.value)} rows={7} placeholder="Cole aqui a mensagem completa que você já manda (com o link e a senha). Se preencher, o robô envia ela igualzinha. Se deixar em branco, ele monta com o link + senha acima." style={{ resize: "vertical", fontFamily: "inherit" }} /></label>

            <label className="row-gap" style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 14px", cursor: "pointer" }}>
              <input type="checkbox" checked={cfg.zapi_ativo} onChange={(e) => set("zapi_ativo", e.target.checked)} style={{ width: 18, height: 18 }} />
              <span><b>Ligar envio real</b> pelo WhatsApp (desligado = só simulador)</span>
            </label>

            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginBottom: 14 }}>
              <b>📥 Para receber mensagens:</b> no painel Z-API, em <b>Ao receber (webhook)</b>, cole esta URL:
              <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                <code style={{ flex: 1, background: "#fff", padding: "6px 8px", borderRadius: 6, fontSize: 11.5, wordBreak: "break-all" }}>{cfg.webhook_url}</code>
                <button className="btn btn-soft" style={{ padding: "6px 10px" }} onClick={() => copiar(cfg.webhook_url)}>Copiar</button>
              </div>
            </div>

            <div className="row-gap" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <input value={telTeste} onChange={(e) => setTelTeste(e.target.value)} placeholder="55DDDnúmero pra teste" style={{ flex: 1 }} />
              <button className="btn btn-soft" onClick={testar}>📨 Enviar teste</button>
            </div>

            <div className="row-gap" style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end" }}>
              {msg && <span style={{ fontWeight: 700, fontSize: 13, color: msg.startsWith("✓") ? "#15803d" : msg.startsWith("Falhou") || msg.startsWith("Erro") ? "#b91c1c" : "#334155" }}>{msg}</span>}
              <button className="btn btn-soft" onClick={onFechar}>Fechar</button>
              <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "💾 Salvar"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConvMini({ c, onAbrir }: { c: AtendConversa; onAbrir: () => void }) {
  const humano = c.coluna === "atendimento-humano";
  return (
    <div className="fx-card" onClick={onAbrir}>
      <div className="fx-nm">{c.nome || c.contato_nome || telBonito(c.telefone)}</div>
      <div className="fx-sub">{(c.nome || c.contato_nome) ? telBonito(c.telefone) : [c.cidade, c.uf].filter(Boolean).join("/") || "—"}</div>
      {c.ultima_msg && <div className="at-prev">{c.ultima_msg}</div>}
      <div className="fx-foot">
        {c.autorizado === 0
          ? <span className="at-badge" style={{ background: "#fef3c7", color: "#92400e" }} title="Aguardando autorização da equipe">⏳ Autorizar</span>
          : <span className="at-badge">{humano ? `👤 ${c.responsavel || "humano"}` : `🤖 robô`}</span>}
        {c.representante && <span className="at-badge" style={{ background: "#eef2ff", color: "#4338ca" }} title={c.autorizado === 0 ? "Representante sugerido" : "Representante"}>🧑‍💼 {c.representante}</span>}
        {c.setor && <span className="fx-sub">{SETOR_EMOJI[c.setor] || ""}</span>}
        <span className="fx-sub" style={{ marginLeft: "auto" }}>{hora(c.atualizado_em)}</span>
      </div>
    </div>
  );
}

// ── Conversa (thread estilo WhatsApp + contexto + ações do atendente) ──────────────
function ConversaModal({ id, onFechar, onMudou }: { id: string; onFechar: () => void; onMudou: () => void }) {
  const [d, setD] = useState<AtendConversaDetalhe | null>(null);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [reps, setReps] = useState<Representante[]>([]);
  const [repSel, setRepSel] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  function carregar() { api.atendConversa(id).then((c) => { setD(c); setRepSel((s) => s || c.representante || ""); }); }
  useEffect(() => { carregar(); const t = setInterval(carregar, 5000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { api.listarRepresentantes().then((r) => setReps(r.filter((x) => x.ativo))).catch(() => {}); }, []);
  useEffect(() => { fim.current?.scrollIntoView(); }, [d?.mensagens.length]);

  async function assumir() {
    const nome = prompt("Seu nome (atendente):", d?.responsavel || "");
    if (nome == null) return;
    setBusy(true);
    try { await api.atendAssumir(id, nome || "Atendente"); carregar(); onMudou(); } finally { setBusy(false); }
  }
  async function autorizar() {
    const rep = repSel.trim();
    if (!rep) { alert("Escolha o representante."); return; }
    if (!confirm(`Autorizar o encaminhamento para ${rep}? O cliente será avisado.`)) return;
    setBusy(true);
    try { await api.atendAutorizar(id, rep); carregar(); onMudou(); } finally { setBusy(false); }
  }
  async function enviar() {
    if (!texto.trim()) return;
    setBusy(true);
    try { await api.atendEnviar(id, { texto: texto.trim(), autor: d?.responsavel || "Atendente" }); setTexto(""); carregar(); onMudou(); }
    finally { setBusy(false); }
  }

  const humano = d?.coluna === "atendimento-humano";
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card at-modal" onClick={(e) => e.stopPropagation()}>
        <div className="at-thd">
          <div className="at-av">{iniciais(d?.nome || d?.telefone)}</div>
          <div className="info">
            <div className="nm">{d?.nome || (d ? telBonito(d.telefone) : "…")}</div>
            <div className="sub">{d ? telBonito(d.telefone) : ""}{d?.cidade ? ` · ${d.cidade}/${d.uf || ""}` : ""}</div>
          </div>
          {d && <span className="at-chip" style={{ background: "#eef2ff", color: "#4338ca" }}>{d.coluna.replace(/-/g, " ")}</span>}
          <button className="modal-x" onClick={onFechar}>✕</button>
        </div>

        <div className="at-body">
          <div className="at-msgs">
            {d?.mensagens.map((m) => (
              m.tipo === "sistema"
                ? <div className="at-sys" key={m.id}>⚙️ {m.texto}</div>
                : <div key={m.id} className={"at-b " + (m.direcao === "in" ? "in" : "out")}>
                    {m.autor && m.direcao === "out" && <div className="at-aut">{m.autor === "bot" ? "🤖 robô" : m.autor}</div>}
                    {m.tipo === "arquivo" ? <span className="at-file">📒 {m.texto}</span> : m.texto}
                    <span className="at-tm">{hora(m.criado_em)}</span>
                  </div>
            ))}
            <div ref={fim} />
          </div>

          <div className="at-ctx">
            <div className="at-block-h">Dados coletados</div>
            <div className="at-row"><span>Setor</span><b>{d?.setor ? (SETOR_EMOJI[d.setor] || "") + " " + d.setor : "—"}</b></div>
            <div className="at-row"><span>Loja</span><b>{d?.nome || "—"}</b></div>
            <div className="at-row"><span>CNPJ</span><b>{d?.cnpj || "—"}</b></div>
            <div className="at-row"><span>Lojista</span><b>{d?.lojista == null ? "—" : d.lojista ? "✅ sim" : "🙅 não"}</b></div>
            <div className="at-row"><span>Cidade</span><b>{[d?.cidade, d?.uf].filter(Boolean).join("/") || "—"}</b></div>
            {d?.representante && d?.autorizado !== 0 && <div className="at-row"><span>Representante</span><b>🧑‍💼 {d.representante}</b></div>}

            {d?.autorizado === 0 && (
              <div style={{ marginTop: 10, padding: "10px 11px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a" }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#92400e", marginBottom: 6 }}>⏳ Aguardando autorização</div>
                <div style={{ fontSize: 12, color: "#78350f", marginBottom: 8 }}>Confira o representante e autorize pra conectar o cliente. Nada foi enviado a ninguém ainda.</div>
                <select value={repSel} onChange={(e) => setRepSel(e.target.value)} style={{ width: "100%", marginBottom: 8 }}>
                  <option value="">— escolher representante —</option>
                  {reps.map((r) => <option key={r.id} value={r.nome}>{r.nome}</option>)}
                  {d.representante && !reps.some((r) => r.nome === d.representante) && <option value={d.representante}>{d.representante} (sugerido)</option>}
                </select>
                <button className="kbtn go" style={{ width: "100%" }} disabled={busy || !repSel} onClick={autorizar}>✅ Autorizar e conectar</button>
              </div>
            )}

            {d?.card_id && <Link to="/funil" className="btn" style={{ marginTop: 10, display: "block", textAlign: "center" }}>🎯 Ver no funil</Link>}
            {!humano && <button className="kbtn go" style={{ marginTop: 10, width: "100%" }} disabled={busy} onClick={assumir}>🙋 Assumir atendimento</button>}
          </div>
        </div>

        <div className="at-compose">
          {humano
            ? <><input placeholder="Escreva uma mensagem…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar()} /><button className="at-send" disabled={busy} onClick={enviar}>➤</button></>
            : <div className="muted2" style={{ padding: "6px 4px" }}>🤖 O robô está conduzindo. Clique em <b>Assumir</b> para responder.</div>}
        </div>
      </div>
    </div>
  );
}

// ── Simulador: você digita como se fosse o cliente no WhatsApp ─────────────────────
function Simulador({ onFechar, onMudou }: { onFechar: () => void; onMudou: () => void }) {
  const [tel, setTel] = useState("5531988887777");
  const [texto, setTexto] = useState("");
  const [msgs, setMsgs] = useState<{ de: "cliente" | "bot"; texto: string; arquivo?: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView(); }, [msgs.length]);

  async function mandar(t?: string) {
    const msg = (t ?? texto).trim();
    if (!msg) return;
    setMsgs((m) => [...m, { de: "cliente", texto: msg }]);
    setTexto(""); setBusy(true);
    try {
      const r = await api.atendEntrada({ telefone: tel, texto: msg });
      setMsgs((m) => [...m, ...r.respostas.map((s) => ({ de: "bot" as const, texto: s.texto, arquivo: s.tipo === "arquivo" }))]);
      onMudou();
    } catch (e) { setMsgs((m) => [...m, { de: "bot", texto: "⚠️ " + (e as Error).message }]); }
    finally { setBusy(false); }
  }
  const atalhos = ["oi", "1", "Loja Encanto Decor", "12.345.678/0001-90", "não tenho, uso pessoal", "Contagem, MG"];

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card at-sim" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: "linear-gradient(130deg,#25d366,#075e54)" }}>
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">💬 Simulador — cliente</span></span><button className="modal-x" onClick={onFechar}>✕</button></div>
          <div className="modal-hd-sub">Digite como se fosse o cliente no WhatsApp. Nº: <input className="at-siminput" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
        </div>
        <div className="at-simscr">
          {msgs.length === 0 && <div className="muted2" style={{ textAlign: "center", padding: 20 }}>Mande "oi" pra começar o atendimento 👇</div>}
          {msgs.map((m, i) => (
            <div key={i} className={"at-b " + (m.de === "cliente" ? "out" : "in")}>
              {m.de === "bot" && <div className="at-aut">🤖 robô</div>}
              {m.arquivo ? <span className="at-file">📒 {m.texto}</span> : m.texto}
            </div>
          ))}
          <div ref={fim} />
        </div>
        <div className="at-simatalhos">
          {atalhos.map((a) => <span key={a} className="fx-pill" onClick={() => mandar(a)}>{a}</span>)}
        </div>
        <div className="at-compose">
          <input placeholder="Mensagem do cliente…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && mandar()} autoFocus />
          <button className="at-send" disabled={busy} onClick={() => mandar()}>➤</button>
        </div>
      </div>
    </div>
  );
}
