import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AtendBoard, type AtendConversa, type AtendConversaDetalhe, type ZapiConfig, type Representante, type FunilCardDetalhe } from "../api";
import { getUser, pode } from "../auth";

// Etapas do funil (venda) mostradas dentro da conversa.
const ETAPAS_FUNIL: { id: string; label: string }[] = [
  { id: "novo-lead", label: "Novo lead" }, { id: "primeiro-contato", label: "Primeiro contato" },
  { id: "negociacao", label: "Negociação" }, { id: "aguardando-retorno", label: "Aguardando retorno" },
  { id: "pos-venda", label: "Pós-venda" }, { id: "ativo", label: "Cliente ativo" },
  { id: "inativo", label: "Inativo" }, { id: "perdido", label: "Perdido" },
];
const etapaLabel = (e?: string | null) => ETAPAS_FUNIL.find((x) => x.id === e)?.label || e || "";

// Gestor do atendimento: admin ou quem tem a permissão de gestor. Só ele vê config/relatórios.
function ehGestorAtend() { const u = getUser(); return !!u && (u.admin || pode(u, "atendimento-gestor")); }

// Renderiza o texto da mensagem como no WhatsApp: URLs viram links clicáveis e
// *texto* vira negrito. As quebras de linha já são preservadas pelo CSS (pre-wrap).
function formatarMsg(texto: string | null | undefined) {
  return String(texto ?? "").split(/(https?:\/\/[^\s]+)/g).map((p, i) => {
    if (/^https?:\/\//.test(p)) {
      return <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>{p}</a>;
    }
    return p.split(/(\*[^*\n]+\*)/g).map((s, j) =>
      /^\*[^*\n]+\*$/.test(s) ? <b key={i + "-" + j}>{s.slice(1, -1)}</b> : <span key={i + "-" + j}>{s}</span>
    );
  });
}

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
  const [novaConv, setNovaConv] = useState(false);
  const [conectado, setConectado] = useState<boolean | null>(null);

  const [alerta, setAlerta] = useState<AtendConversa | null>(null); // banner de backup na tela
  const alertadosRef = useRef<Set<string>>(new Set());
  const primeiraRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);

  function recarregar() { const u = getUser(); api.atendBoard(u?.nome, ehGestorAtend()).then(setBoard).catch(() => {}); }
  function checarConexao() { api.atendConfig().then((c) => setConectado(c.zapi_ativo && !!c.zapi_instance && !!c.zapi_token)).catch(() => setConectado(false)); }
  useEffect(() => { recarregar(); checarConexao(); const t = setInterval(recarregar, 8000); return () => clearInterval(t); }, []);

  // Libera o áudio no primeiro clique (política de autoplay) e pede permissão de notificação.
  useEffect(() => {
    const liberar = () => {
      if (!audioRef.current) { try { audioRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { /* sem áudio */ } }
      audioRef.current?.resume?.();
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      window.removeEventListener("pointerdown", liberar);
    };
    window.addEventListener("pointerdown", liberar);
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    return () => window.removeEventListener("pointerdown", liberar);
  }, []);

  // Som IRRITANTE (bipes agudos alternados) gerado na hora, sem depender de arquivo.
  function tocarAlerta() {
    const ctx = audioRef.current;
    if (!ctx) return;
    try { ctx.resume?.(); } catch { /* ignore */ }
    const t0 = ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square";
      o.frequency.value = i % 2 ? 1320 : 880;
      const ini = t0 + i * 0.17;
      g.gain.setValueAtTime(0.0001, ini);
      g.gain.exponentialRampToValueAtTime(0.3, ini + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ini + 0.15);
      o.connect(g).connect(ctx.destination);
      o.start(ini); o.stop(ini + 0.16);
    }
  }

  function dispararAlerta(c: AtendConversa) {
    const quem = c.nome || c.contato_nome || telBonito(c.telefone);
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        const n = new Notification("🔔 Atendimento humano!", { body: `${quem} precisa de um atendente.`, tag: "atend-" + c.id, requireInteraction: true });
        n.onclick = () => { window.focus(); setAbrir(c.id); setAlerta(null); n.close(); };
      } catch { /* alguns navegadores exigem service worker; o som + banner cobrem */ }
    }
    setAlerta(c);
    tocarAlerta();
  }

  // A cada atualização do quadro, detecta conversas NOVAS que precisam de humano (sem responsável).
  useEffect(() => {
    if (!board) return;
    const pend = board.conversas.filter((c) => c.coluna === "atendimento-humano" && !c.responsavel);
    if (primeiraRef.current) { pend.forEach((c) => alertadosRef.current.add(c.id)); primeiraRef.current = false; return; }
    for (const c of pend) {
      if (!alertadosRef.current.has(c.id)) { alertadosRef.current.add(c.id); dispararAlerta(c); }
    }
    const ids = new Set(pend.map((c) => c.id));
    for (const id of Array.from(alertadosRef.current)) if (!ids.has(id)) alertadosRef.current.delete(id);
  }, [board]);

  return (
    <div className="quadro-page" style={{ maxWidth: "none" }}>
      {alerta && (
        <div onClick={() => { setAbrir(alerta.id); setAlerta(null); }} style={{ position: "fixed", top: 16, right: 16, zIndex: 200, background: "#dc2626", color: "#fff", borderRadius: 12, padding: "12px 16px", boxShadow: "0 10px 30px #0006", cursor: "pointer", maxWidth: 320, animation: "atpulse 1s ease-in-out infinite" }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>🔔 Atendimento humano!</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{alerta.nome || alerta.contato_nome || telBonito(alerta.telefone)} precisa de um atendente.</div>
          <div style={{ fontSize: 11.5, marginTop: 4, opacity: .9 }}>Clique para abrir · <span onClick={(e) => { e.stopPropagation(); setAlerta(null); }} style={{ textDecoration: "underline" }}>dispensar</span></div>
        </div>
      )}
      <div className="page-head">
        <div><h1>Atendimento</h1><div className="breadcrumb">Comercial › Atendimento (robô do WhatsApp)</div></div>
        <div className="row-gap" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="at-status">{conectado == null ? "…" : conectado ? "🟢 WhatsApp conectado (Z-API)" : "🟡 Z-API desligada (simulação)"}</span>
          <button className="btn btn-primary" onClick={() => setNovaConv(true)}>➕ Nova conversa</button>
          {ehGestorAtend() && <button className="btn btn-soft" onClick={() => setCfgOpen(true)}>⚙️ Conexão</button>}
          {ehGestorAtend() && <button className="btn btn-soft" onClick={() => setSim(true)}>💬 Simular cliente</button>}
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
                <div className="fx-col-body">
                  {cs.map((c) => <ConvMini key={c.id} c={c} onAbrir={() => setAbrir(c.id)} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sim && <Simulador onFechar={() => setSim(false)} onMudou={recarregar} />}
      {novaConv && <NovaConversa onFechar={() => setNovaConv(false)} onAbrir={(cid) => { setNovaConv(false); setAbrir(cid); }} onMudou={recarregar} />}
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
  const [iaTeste, setIaTeste] = useState<string>("");
  const [iaTestando, setIaTestando] = useState(false);

  useEffect(() => { api.atendConfig().then(setCfg).catch(() => setMsg("Não consegui carregar a configuração.")); }, []);
  const set = (k: keyof ZapiConfig, v: string | boolean) => setCfg((c) => (c ? { ...c, [k]: v } : c));

  async function salvar() {
    if (!cfg) return;
    setSalvando(true); setMsg("");
    try {
      await api.atendSalvarConfig({ zapi_base: cfg.zapi_base, zapi_instance: cfg.zapi_instance, zapi_token: cfg.zapi_token, zapi_client_token: cfg.zapi_client_token, zapi_ativo: cfg.zapi_ativo, atendimento_ativo: cfg.atendimento_ativo, atendimento_ia: cfg.atendimento_ia, ia_prompt: cfg.ia_prompt, catalogo_url: cfg.catalogo_url, catalogo_senha: cfg.catalogo_senha, catalogo_msg: cfg.catalogo_msg, followup_ativo: cfg.followup_ativo, followup_hora_ini: cfg.followup_hora_ini, followup_hora_fim: cfg.followup_hora_fim, followup_domingo: cfg.followup_domingo, followup_ia: cfg.followup_ia, pos_venda_ativo: cfg.pos_venda_ativo, pos_venda_dias: cfg.pos_venda_dias, recompra_ativo: cfg.recompra_ativo, recompra_dias: cfg.recompra_dias, reativacao_ativo: cfg.reativacao_ativo, reativacao_dias: cfg.reativacao_dias, reativacao_limite: cfg.reativacao_limite, reativacao_intervalo_seg: cfg.reativacao_intervalo_seg, reativacao_msg: cfg.reativacao_msg, catalogo_evento_token: cfg.catalogo_evento_token, catalogo_log_url: cfg.catalogo_log_url });
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

  async function testarIa() {
    setIaTestando(true); setIaTeste("");
    try {
      const r = await api.atendTestarIa();
      const ok = r.tentativas.find((t) => t.ok);
      if (r.erro) setIaTeste(`❌ ${r.erro}`);
      else if (ok) setIaTeste(`✅ IA funcionando! Modelo: ${ok.modelo}\nResposta de teste: "${ok.resposta}"` + (r.ia_ligada ? "" : "\n\n⚠️ Mas a IA está DESLIGADA — ligue e Salve acima."));
      else { const err = r.tentativas.map((t) => `• ${t.modelo}: ${t.erro || "sem resposta"}`).join("\n"); setIaTeste(`❌ Nenhum modelo respondeu:\n${err}`); }
    } catch { setIaTeste("❌ Erro ao chamar o teste (deploy subiu? versão nova?)."); }
    finally { setIaTestando(false); }
  }

  const [sincroCat, setSincroCat] = useState(false);
  async function sincronizarCatalogo() {
    setSincroCat(true); setMsg("");
    try { const r = await api.atendSincronizarCatalogo(); setMsg(r.logErro ? `⚠️ Não li a atividade: ${r.logErro}. URL: ${r.logUrl || "(vazia)"}` : `✓ ${r.novos} novo(s) · ${r.backfill || 0} card(s) no funil · log tem ${r.logTotal} evento(s) · ${r.catalogoConversas ?? "?"} conversa(s) de catálogo (últ. ts ${r.ultimoTs || "0"}).`); }
    catch { setMsg("Não consegui ler a atividade — confira a URL de leitura."); }
    finally { setSincroCat(false); }
  }
  const copiar = (t: string) => navigator.clipboard?.writeText(t).then(() => { setMsg("Copiado!"); setTimeout(() => setMsg(""), 2000); });

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 560, width: "min(560px,96vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>⚙️ Conexão do WhatsApp (Z-API)</h2>
        {!cfg ? <p className="muted">Carregando…</p> : (
          <>
            {/* Interruptor mestre — liga/desliga o robô com clientes reais */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 14, borderRadius: 10, border: "2px solid " + (cfg.atendimento_ativo ? "#22c55e" : "#f59e0b"), background: cfg.atendimento_ativo ? "#f0fdf4" : "#fffbeb", color: "#1e293b" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>{cfg.atendimento_ativo ? "🟢 Atendimento automático LIGADO" : "🟡 Atendimento automático DESLIGADO"}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{cfg.atendimento_ativo ? "O robô responde clientes reais no WhatsApp." : "Modo teste: o robô NÃO responde clientes reais. Use o Simulador."}</div>
              </div>
              <button type="button" className={"btn " + (cfg.atendimento_ativo ? "btn-soft" : "btn-primary")} onClick={() => set("atendimento_ativo", !cfg.atendimento_ativo)}>
                {cfg.atendimento_ativo ? "Desligar" : "Ligar"}
              </button>
            </div>
            {/* IA de triagem — atende conversando antes de pedir o CNPJ */}
            <div style={{ padding: "12px 14px", marginBottom: 14, borderRadius: 10, border: "2px solid " + (cfg.atendimento_ia ? "#8b5cf6" : "#e2e8f0"), background: cfg.atendimento_ia ? "#faf5ff" : "#f8fafc", color: "#1e293b" }}>
             <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>{cfg.atendimento_ia ? "🧠 Atendente com IA LIGADA" : "🧠 Atendente com IA desligada"}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{cfg.atendimento_ia ? "A IA conversa com o lead, entende o que ele quer e só depois pede loja/CNPJ. Consumidor final é direcionado a lojas parceiras." : "Sem IA: o robô usa o menu fixo (1 Vendas, 2 Financeiro…)."}</div>
              </div>
              <button type="button" className={"btn " + (cfg.atendimento_ia ? "btn-soft" : "btn-primary")} onClick={() => set("atendimento_ia", !cfg.atendimento_ia)}>
                {cfg.atendimento_ia ? "Desligar" : "Ligar"}
              </button>
             </div>
             <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
               <button type="button" className="btn btn-soft" disabled={iaTestando} onClick={testarIa}>{iaTestando ? "Testando…" : "🧪 Testar IA agora"}</button>
               <span style={{ fontSize: 12, color: "#64748b" }}>Vê na hora se a IA responde (não precisa do simulador).</span>
             </div>
             {iaTeste && <pre style={{ marginTop: 10, marginBottom: 0, whiteSpace: "pre-wrap", fontSize: 12.5, background: "#0f172a", color: "#e2e8f0", padding: "10px 12px", borderRadius: 8, fontFamily: "inherit", lineHeight: 1.5 }}>{iaTeste}</pre>}
             {cfg.atendimento_ia && (
               <div style={{ marginTop: 12 }}>
                 <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 3 }}>📝 Ajustes na conversa da Big (opcional)</div>
                 <textarea value={cfg.ia_prompt} onChange={(e) => set("ia_prompt", e.target.value)} rows={5}
                   placeholder={"Escreva do seu jeito o que a Big deve (ou não deve) fazer. Ex.:\n• Não fale de modelos/cores com consumidor final, só indique a loja parceira.\n• Seja mais objetiva, no máximo 2 linhas.\n• Sempre pergunte a quantidade que o lojista precisa."}
                   style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 12.5, lineHeight: 1.45 }} />
                 <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 3 }}>
                   Em branco = a Big usa as regras padrão da Big Tricot. O que você escrever aqui é <b>somado</b> às regras (não substitui) — então ela nunca "quebra".
                 </div>
                 <details style={{ marginTop: 6 }}>
                   <summary style={{ cursor: "pointer", fontSize: 11.5, color: "#8b5cf6" }}>ver as regras padrão da Big (referência)</summary>
                   <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, color: "#475569", background: "#f1f5f9", padding: "8px 10px", borderRadius: 6, marginTop: 4, maxHeight: 180, overflow: "auto", fontFamily: "inherit" }}>{cfg.ia_prompt_padrao}</pre>
                 </details>
               </div>
             )}
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

            <div style={{ border: "1px solid var(--line,#e2e8f0)", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 8 }}>⏰ Mensagens automáticas (follow-up)</div>
              <label className="row-gap" style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={cfg.followup_ativo} onChange={(e) => set("followup_ativo", e.target.checked)} style={{ width: 17, height: 17 }} />
                <span>Ligar a cadência <b>24h → 3 dias → 7 dias → parar</b> (retomada de quem não respondeu)</span>
              </label>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
                <span>Horário comercial:</span>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>das
                  <input type="number" min={0} max={23} value={cfg.followup_hora_ini} onChange={(e) => set("followup_hora_ini", e.target.value)} style={{ width: 54 }} />h</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>às
                  <input type="number" min={1} max={24} value={cfg.followup_hora_fim} onChange={(e) => set("followup_hora_fim", e.target.value)} style={{ width: 54 }} />h</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={cfg.followup_domingo} onChange={(e) => set("followup_domingo", e.target.checked)} /> enviar aos domingos</label>
              </div>
              <label className="row-gap" style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={cfg.followup_ia} onChange={(e) => set("followup_ia", e.target.checked)} style={{ width: 17, height: 17 }} />
                <span>🤖 Gerar os textos por <b>IA</b> (mais naturais, variados) — desligado usa modelos prontos</span>
              </label>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 13, marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--line,#e2e8f0)" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={cfg.pos_venda_ativo} onChange={(e) => set("pos_venda_ativo", e.target.checked)} /> 💛 Pós-venda após
                  <input type="number" min={1} max={90} value={cfg.pos_venda_dias} onChange={(e) => set("pos_venda_dias", e.target.value)} style={{ width: 52 }} /> dias do envio</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={cfg.recompra_ativo} onChange={(e) => set("recompra_ativo", e.target.checked)} /> 🔁 Recompra após
                  <input type="number" min={7} max={365} value={cfg.recompra_dias} onChange={(e) => set("recompra_dias", e.target.value)} style={{ width: 56 }} /> dias</label>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 7 }}>Nunca envia 2× no mesmo dia, fora do horário, na madrugada, ou para quem já respondeu.</div>
            </div>

            <div style={{ border: "1px solid #fde68a", background: "#fffbeb", color: "#1e293b", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>🔔 Prospecção automática por catálogo (reativação)</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={cfg.reativacao_ativo} onChange={(e) => set("reativacao_ativo", e.target.checked)} /> Ativar — enviar após
                  <input type="number" min={1} max={365} value={cfg.reativacao_dias} onChange={(e) => set("reativacao_dias", e.target.value)} style={{ width: 52 }} /> dias do faturamento</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>máx.
                  <input type="number" min={1} max={500} value={cfg.reativacao_limite} onChange={(e) => set("reativacao_limite", e.target.value)} style={{ width: 56 }} /> por disparo</label>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>intervalo entre envios
                  <input type="number" min={5} max={300} value={cfg.reativacao_intervalo_seg} onChange={(e) => set("reativacao_intervalo_seg", e.target.value)} style={{ width: 56 }} /> seg</label>
              </div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>🛡️ Anti-banimento: NÃO manda em rajada — espaça cada envio pelo intervalo (aleatório, +0–30s) e para após ~8 min; o resto sai no próximo horário.</div>
              <label className="campo" style={{ margin: "8px 0 0" }}><span className="campo-label">Mensagem (use {"{nome}"} e {"{dias}"})</span>
                <textarea rows={3} value={cfg.reativacao_msg} onChange={(e) => set("reativacao_msg", e.target.value)} placeholder={cfg.reativacao_msg_padrao} /></label>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Manda o catálogo como “desculpa” pra reabrir conversa — só pra cliente com WhatsApp que ainda não falou com a gente. O link do catálogo é anexado sozinho e envia 1× por cliente. Vale pra cliente de representante ou não.</div>
            </div>

            <div style={{ border: "1px solid #ddd6fe", background: "#f5f3ff", color: "#1e293b", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 6 }}>🔗 Catálogo — ler atividade</div>
              <div style={{ fontSize: 12.5, marginBottom: 6 }}>O CRM lê os acessos do catálogo daqui e cria os leads. Cole a <b>URL de leitura</b> (o GET <code>/log</code> com o código):</div>
              <label className="campo" style={{ margin: "0 0 8px" }}><span className="campo-label">URL de leitura da atividade (bt-atividade /log)</span>
                <input value={cfg.catalogo_log_url} onChange={(e) => set("catalogo_log_url", e.target.value)} placeholder="https://…/log?code=bigtricot2026" /></label>
              <button className="btn btn-soft" style={{ fontSize: 12.5 }} disabled={sincroCat} onClick={sincronizarCatalogo}>{sincroCat ? "Sincronizando…" : "🔄 Sincronizar agora"}</button>
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 12, cursor: "pointer", color: "#6d28d9" }}>Alternativa: o catálogo empurrar (POST)</summary>
                <div style={{ fontSize: 12, marginTop: 6 }}>URL do webhook de eventos:</div>
                <div style={{ display: "flex", gap: 8, margin: "4px 0", alignItems: "center" }}>
                  <code style={{ flex: 1, background: "#fff", color: "#334155", padding: "6px 8px", borderRadius: 6, fontSize: 10.5, wordBreak: "break-all" }}>{cfg.catalogo_evento_url}</code>
                  <button className="btn btn-soft" style={{ padding: "5px 9px" }} onClick={() => copiar(cfg.catalogo_evento_url)}>Copiar</button>
                </div>
                <label className="campo" style={{ margin: 0 }}><span className="campo-label">Token (opcional)</span>
                  <input value={cfg.catalogo_evento_token} onChange={(e) => set("catalogo_evento_token", e.target.value)} placeholder="vazio = sem checagem" /></label>
              </details>
            </div>

            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", color: "#1e293b", borderRadius: 8, padding: "10px 12px", fontSize: 12.5, marginBottom: 14 }}>
              <b>📥 Para receber mensagens:</b> no painel Z-API, em <b>Ao receber (webhook)</b>, cole esta URL:
              <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                <code style={{ flex: 1, background: "#fff", color: "#334155", padding: "6px 8px", borderRadius: 6, fontSize: 11.5, wordBreak: "break-all" }}>{cfg.webhook_url}</code>
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
        {c.funil_etapa && <span className="at-badge" style={{ background: "#ecfdf5", color: "#047857" }} title="Etapa no funil de vendas">🎯 {etapaLabel(c.funil_etapa)}</span>}
        {c.interessado === 1 && <span className="at-badge" style={{ background: "#fee2e2", color: "#b91c1c" }} title="Demonstrou interesse comercial">🔥 Interessado</span>}
        {c.representante && <span className="at-badge" style={{ background: "#eef2ff", color: "#4338ca" }} title={c.autorizado === 0 ? "Representante sugerido" : "Representante"}>🧑‍💼 {c.representante}</span>}
        {c.setor && <span className="fx-sub">{SETOR_EMOJI[c.setor] || ""}</span>}
        <span className="fx-sub" style={{ marginLeft: "auto" }}>{hora(c.atualizado_em)}</span>
      </div>
    </div>
  );
}

// ── Conversa (thread estilo WhatsApp + contexto + ações do atendente) ──────────────
export function ConversaModal({ id, onFechar, onMudou }: { id: string; onFechar: () => void; onMudou: () => void }) {
  const [d, setD] = useState<AtendConversaDetalhe | null>(null);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [reps, setReps] = useState<Representante[]>([]);
  const [repSel, setRepSel] = useState("");
  const [usuarios, setUsuarios] = useState<{ nome: string; usuario: string }[]>([]);
  const fim = useRef<HTMLDivElement>(null);

  function carregar() { api.atendConversa(id).then((c) => { setD(c); setRepSel((s) => s || c.representante || ""); }); }
  useEffect(() => { carregar(); const t = setInterval(carregar, 5000); return () => clearInterval(t); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { api.listarRepresentantes().then((r) => setReps(r.filter((x) => x.ativo))).catch(() => {}); }, []);
  useEffect(() => { api.listarUsuarios().then((u) => setUsuarios(Array.isArray(u) ? u : [])).catch(() => {}); }, []);
  useEffect(() => { fim.current?.scrollIntoView(); }, [d?.mensagens.length]);

  // Funil (venda) trazido pra dentro da conversa.
  const [funil, setFunil] = useState<FunilCardDetalhe | null>(null);
  useEffect(() => { if (d?.card_id) api.funilCard(d.card_id).then(setFunil).catch(() => setFunil(null)); else setFunil(null); }, [d?.card_id]);
  async function moverEtapa(etapa: string) {
    if (!d?.card_id || !etapa) return;
    setBusy(true);
    try { await api.atualizarCard(d.card_id, { etapa }); setFunil(await api.funilCard(d.card_id)); onMudou(); } finally { setBusy(false); }
  }

  async function assumir() {
    const u = getUser();
    setBusy(true);
    try { await api.atendAssumir(id, u?.nome || "Atendente"); carregar(); onMudou(); } finally { setBusy(false); }
  }
  async function transferir(nome: string) {
    if (!nome) return;
    setBusy(true);
    try { await api.atendAssumir(id, nome); carregar(); onMudou(); } finally { setBusy(false); }
  }
  const [sugerindo, setSugerindo] = useState(false);
  async function sugerir() {
    setSugerindo(true);
    try { const r = await api.atendSugerir(id); setTexto(r.sugestao); }
    catch { alert("Não consegui sugerir uma resposta agora."); }
    finally { setSugerindo(false); }
  }
  async function toggleNaoPerturbe() {
    if (!d) return;
    setBusy(true);
    try { await api.atendNaoPerturbe(id, !d.nao_perturbe); carregar(); onMudou(); } finally { setBusy(false); }
  }
  async function enviarCatalogo() {
    if (!confirm("Enviar o link do catálogo para este cliente?")) return;
    setBusy(true);
    try { await api.atendEnviarCatalogo(id); carregar(); onMudou(); }
    catch { alert("Não consegui enviar o catálogo agora."); }
    finally { setBusy(false); }
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
          <div className="at-av">{iniciais(d?.nome || d?.contato_nome || d?.telefone)}</div>
          <div className="info">
            <div className="nm">{d?.nome || d?.contato_nome || (d ? telBonito(d.telefone) : "…")}</div>
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
                    {m.tipo === "arquivo" ? <span className="at-file">📒 {m.texto}</span> : formatarMsg(m.texto)}
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
            {d && d.interesses && d.interesses.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="at-row" style={{ borderBottom: 0, paddingBottom: 2 }}><span>🔥 Interesse</span><b></b></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {d.interesses.map((t) => <span key={t} className="at-chip" style={{ background: "#fee2e2", color: "#b91c1c", fontSize: 11.5 }}>{t}</span>)}
                </div>
              </div>
            )}

            {d?.autorizado === 0 && (
              <div style={{ marginTop: 10, padding: "10px 11px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e" }}>
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

            {d?.pedidos_resumo && d.pedidos_resumo.qtd > 0 && (
              <div style={{ marginTop: 10, padding: "9px 11px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", fontSize: 12.5, color: "#166534" }}>
                <div style={{ fontWeight: 800, color: "#15803d", marginBottom: 3 }}>🛍️ Cliente da base</div>
                <div><b>{d.pedidos_resumo.qtd}</b> pedido(s) · <b>{d.pedidos_resumo.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></div>
                {d.pedidos_resumo.ultima && <div className="muted">última compra: {new Date(d.pedidos_resumo.ultima + "T00:00:00").toLocaleDateString("pt-BR")}</div>}
              </div>
            )}
            {d?.card_id && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid #a7f3d0", background: "#ecfdf5", color: "#065f46" }}>
                <div style={{ fontWeight: 800, fontSize: 12.5, marginBottom: 6 }}>🎯 Venda (Funil)</div>
                <select value={funil?.etapa || ""} onChange={(e) => moverEtapa(e.target.value)} disabled={busy} style={{ width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid #6ee7b7", background: "#fff", color: "#065f46", fontWeight: 700 }}>
                  {ETAPAS_FUNIL.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                {funil?.valor_estimado ? <div style={{ fontSize: 12.5, marginTop: 6 }}>💰 Valor estimado: <b>R$ {Number(funil.valor_estimado).toLocaleString("pt-BR")}</b></div> : null}
                {(() => { const t = funil?.tarefas?.find((x) => !x.feita); return t ? <div style={{ fontSize: 12, marginTop: 4 }}>📌 {t.titulo}{t.vence_em ? ` · vence ${t.vence_em.slice(8, 10)}/${t.vence_em.slice(5, 7)}` : ""}</div> : null; })()}
                <Link to="/funil" className="btn btn-soft" style={{ marginTop: 8, display: "block", textAlign: "center", fontSize: 12 }}>Abrir no funil completo →</Link>
              </div>
            )}
            {!humano && <button className="kbtn go" style={{ marginTop: 10, width: "100%" }} disabled={busy} onClick={assumir}>🙋 Assumir atendimento</button>}
            {humano && <div style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 4px" }}>Em atendimento com <b>{d?.responsavel || "—"}</b></div>}
            {/* Transferir SEMPRE disponível — dá pra encaminhar direto pra um atendente, sem precisar assumir antes. */}
            <div style={{ marginTop: humano ? 0 : 8 }}>
              <select value="" onChange={(e) => { if (e.target.value) transferir(e.target.value); }} disabled={busy} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-soft)", color: "var(--ink)" }}>
                <option value="">{humano ? "↔️ Transferir para outro atendente…" : "↔️ Transferir direto para um atendente…"}</option>
                {usuarios.filter((u) => u.nome !== d?.responsavel).map((u) => <option key={u.usuario} value={u.nome}>{u.nome}</option>)}
              </select>
            </div>
            <button className="btn btn-soft" style={{ marginTop: 8, width: "100%", fontSize: 12.5 }} disabled={busy} onClick={toggleNaoPerturbe} title="Para/retoma as mensagens automáticas para este cliente">
              {d?.nao_perturbe ? "🔕 Automáticas pausadas — retomar" : "🔔 Pausar mensagens automáticas"}
            </button>
          </div>
        </div>

        <div className="at-compose">
          {humano
            ? <>
                <button className="at-send" style={{ background: "transparent", color: "var(--accent,#7c3aed)" }} disabled={busy || sugerindo} onClick={sugerir} title="Sugerir resposta com IA (você pode editar)">{sugerindo ? "…" : "✨"}</button>
                <button className="at-send" style={{ background: "transparent" }} disabled={busy} onClick={enviarCatalogo} title="Enviar o link do catálogo">📖</button>
                <input placeholder="Escreva uma mensagem…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar()} />
                <button className="at-send" disabled={busy} onClick={enviar}>➤</button>
              </>
            : <div className="muted2" style={{ padding: "6px 4px" }}>🤖 O robô está conduzindo. Clique em <b>Assumir</b> para responder.</div>}
        </div>
      </div>
    </div>
  );
}

// ── Nova conversa: escolhe um contato do WhatsApp (ou digita o número) e manda a 1ª msg ──
function NovaConversa({ onFechar, onAbrir, onMudou }: { onFechar: () => void; onAbrir: (id: string) => void; onMudou: () => void }) {
  const [contatos, setContatos] = useState<{ nome: string; telefone: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<{ nome: string; telefone: string } | null>(null);
  const [telManual, setTelManual] = useState("");
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    api.atendContatosWhatsapp()
      .then((r) => { setContatos(r.contatos || []); if (r.erro) setErro("Conecte o WhatsApp (Z-API) pra carregar seus contatos. Você ainda pode digitar o número abaixo."); })
      .catch(() => setErro("Não consegui carregar os contatos agora. Digite o número abaixo."))
      .finally(() => setCarregando(false));
  }, []);

  const filtrados = contatos.filter((c) => {
    const q = busca.trim().toLowerCase();
    return !q || c.nome.toLowerCase().includes(q) || c.telefone.includes(q.replace(/\D/g, ""));
  }).slice(0, 200);

  async function enviar() {
    const tel = (sel?.telefone || telManual).replace(/\D/g, "");
    if (tel.length < 10) { alert("Escolha um contato ou digite um número válido (com DDD)."); return; }
    if (!texto.trim()) { alert("Escreva a primeira mensagem."); return; }
    setBusy(true);
    try {
      const u = getUser();
      const r = await api.atendNovaConversa({ telefone: tel, texto: texto.trim(), nome: sel?.nome, responsavel: u?.nome || "Atendente" });
      onMudou();
      onAbrir(r.conversa_id);
    } catch (e) { alert((e as Error).message || "Não consegui enviar."); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 520, width: "96vw" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>➕ Nova conversa</h2>
          <button className="modal-x" onClick={onFechar}>✕</button>
        </div>
        {erro && <div style={{ fontSize: 12.5, marginBottom: 8, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "7px 10px" }}>{erro}</div>}
        <input placeholder="🔎 Buscar contato pelo nome ou número…" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
        <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 10 }}>
          {carregando ? <div className="muted" style={{ padding: 12 }}>Carregando contatos…</div>
            : filtrados.length === 0 ? <div className="muted" style={{ padding: 12 }}>Nenhum contato encontrado. Digite o número abaixo. 👇</div>
            : filtrados.map((c) => (
              <button key={c.telefone} type="button" onClick={() => { setSel(c); setTelManual(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", border: "none", borderBottom: "1px solid var(--line)", background: sel?.telefone === c.telefone ? "#eef2ff" : "transparent", cursor: "pointer", color: "var(--ink)" }}>
                <b>{c.nome}</b> <span className="muted" style={{ fontSize: 12 }}>{telBonito(c.telefone)}</span>
              </button>
            ))}
        </div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>ou digite o número (com DDD):</div>
        <input placeholder="Ex.: 35 9 9999-9999" value={telManual} onChange={(e) => { setTelManual(e.target.value); setSel(null); }} style={{ width: "100%", marginBottom: 10 }} />
        <textarea placeholder="Escreva a primeira mensagem…" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} style={{ width: "100%", resize: "vertical", fontFamily: "inherit", marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-soft" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy} onClick={enviar}>{busy ? "Enviando…" : "📤 Enviar e abrir"}</button>
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
  const [estado, setEstado] = useState("novo");
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView(); }, [msgs.length, busy]);

  async function mandar(t?: string) {
    const msg = (t ?? texto).trim();
    if (!msg) return;
    setMsgs((m) => [...m, { de: "cliente", texto: msg }]);
    setTexto(""); setBusy(true);
    try {
      const r = await api.atendEntrada({ telefone: tel, texto: msg });
      if (r.respostas.length === 0) {
        // O robô ficou calado de propósito: um humano assumiu ou a conversa já
        // passou da triagem. Explica e oferece o reinício em vez de tela vazia.
        setMsgs((m) => [...m, { de: "bot", texto: "🤖 (o robô não respondeu — essa conversa já está em atendimento humano ou numa etapa final. Clique em 🔄 Reiniciar pra testar do zero.)" }]);
      } else {
        setMsgs((m) => [...m, ...r.respostas.map((s) => ({ de: "bot" as const, texto: s.texto, arquivo: s.tipo === "arquivo" }))]);
      }
      setEstado(r.estado);
      onMudou();
    } catch (e) { setMsgs((m) => [...m, { de: "bot", texto: "⚠️ " + (e as Error).message }]); }
    finally { setBusy(false); }
  }
  async function reiniciar() {
    setBusy(true);
    try { await api.atendReset(tel); setMsgs([]); setEstado("novo"); onMudou(); }
    catch (e) { setMsgs((m) => [...m, { de: "bot", texto: "⚠️ " + (e as Error).message }]); }
    finally { setBusy(false); }
  }
  // Botões que acompanham a pergunta do robô — o usuário clica em vez de digitar.
  const atalhos: { label: string; val: string }[] = (() => {
    switch (estado) {
      case "novo": return [{ label: "👋 oi", val: "oi" }];
      case "ia-triagem": return [
        { label: "🏪 sou lojista", val: "sou lojista, quero revender" },
        { label: "🧶 quero ver mantas", val: "quero comprar mantas pra minha loja" },
        { label: "🙋 é pra uso pessoal", val: "é pra mim mesmo, uso pessoal" }];
      case "aguardando-setor": return [
        { label: "1️⃣ Vendas", val: "1" }, { label: "2️⃣ Financeiro", val: "2" },
        { label: "3️⃣ Pós-venda", val: "3" }, { label: "4️⃣ Outros", val: "4" }];
      case "triagem-nome": return [{ label: "🏬 Loja Encanto Decor", val: "Loja Encanto Decor" }];
      case "aguardando-cnpj": return [
        { label: "✅ CNPJ válido", val: "11.222.333/0001-81" },
        { label: "🙅 não tenho CNPJ", val: "não tenho, uso pessoal" },
        { label: "🙋 falar com atendente", val: "atendente" }];
      case "aguardando-cidade-parceiro": return [{ label: "📍 Contagem, MG", val: "Contagem, MG" }];
      default: return [];
    }
  })();

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card at-sim" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: "linear-gradient(130deg,#25d366,#075e54)" }}>
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">💬 Simulador — cliente</span></span><span style={{ display: "flex", gap: 8 }}><button className="modal-x" title="Apaga esta conversa de teste e começa do zero" disabled={busy} onClick={reiniciar} style={{ width: "auto", padding: "0 10px", fontSize: 13 }}>🔄 Reiniciar</button><button className="modal-x" onClick={onFechar}>✕</button></span></div>
          <div className="modal-hd-sub">Digite como se fosse o cliente no WhatsApp. Nº: <input className="at-siminput" value={tel} onChange={(e) => setTel(e.target.value)} /></div>
        </div>
        <div className="at-simscr">
          {msgs.length === 0 && <div className="muted2" style={{ textAlign: "center", padding: 20 }}>Mande "oi" pra começar o atendimento 👇</div>}
          {msgs.map((m, i) => (
            <div key={i} className={"at-b " + (m.de === "cliente" ? "out" : "in")}>
              {m.de === "bot" && <div className="at-aut">🤖 robô</div>}
              {m.arquivo ? <span className="at-file">📒 {m.texto}</span> : formatarMsg(m.texto)}
            </div>
          ))}
          {busy && (
            <div className="at-b in at-typing">
              <div className="at-aut">🤖 robô</div>
              <span className="at-dot" /><span className="at-dot" /><span className="at-dot" />
            </div>
          )}
          <div ref={fim} />
        </div>
        {atalhos.length > 0 && (
          <div className="at-simatalhos">
            <span className="muted2" style={{ fontSize: 11, alignSelf: "center", marginRight: 2 }}>clique 👉</span>
            {atalhos.map((a) => <span key={a.val} className="fx-pill" onClick={() => !busy && mandar(a.val)}>{a.label}</span>)}
          </div>
        )}
        <div className="at-compose">
          <input placeholder="Mensagem do cliente…" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && mandar()} autoFocus />
          <button className="at-send" disabled={busy} onClick={() => mandar()}>➤</button>
        </div>
      </div>
    </div>
  );
}
