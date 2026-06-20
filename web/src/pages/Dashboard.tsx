import { useEffect, useMemo, useRef, useState } from "react";
import { api, type DashboardData } from "../api";
import "../dashboard.css";

const ETAPA: Record<string, string> = {
  tecelagem: "Tecelagem",
  passadoria: "Passadoria",
  corte: "Corte",
  costura: "Costura",
  revisao: "Revisão",
  expedicao: "Expedição",
};
const brD = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : d;
};

interface Cfg {
  intervalo: number;
  som: boolean;
  novoPedido: boolean;
  mostrarValores: boolean;
  telas: Record<string, boolean>;
}
const CFG_PADRAO: Cfg = {
  intervalo: 10,
  som: false,
  novoPedido: true,
  mostrarValores: false,
  telas: { resumo: true, producao: true, urgentes: true, ranking: true, expedicao: true, avisos: true },
};
function carregarCfg(): Cfg {
  try {
    return { ...CFG_PADRAO, ...JSON.parse(localStorage.getItem("dashCfg") || "{}") };
  } catch {
    return CFG_PADRAO;
  }
}

function beep() {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    o.start();
    o.stop(ctx.currentTime + 0.7);
  } catch {
    /* sem áudio */
  }
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [cfg, setCfg] = useState<Cfg>(carregarCfg);
  const [idx, setIdx] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [showCfg, setShowCfg] = useState(false);
  const [novo, setNovo] = useState<DashboardData["ultimoPedido"]>(null);
  const [hora, setHora] = useState("");
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    localStorage.setItem("dashCfg", JSON.stringify(cfg));
  }, [cfg]);

  // relógio
  useEffect(() => {
    const t = setInterval(() => setHora(new Date().toLocaleTimeString("pt-BR")), 1000);
    return () => clearInterval(t);
  }, []);

  // dados (polling)
  useEffect(() => {
    let vivo = true;
    async function puxar() {
      try {
        const d = await api.dashboard();
        if (!vivo) return;
        setData(d);
        const up = d.ultimoPedido;
        if (up) {
          if (lastId.current && up.id !== lastId.current && cfg.novoPedido) {
            setNovo(up);
            if (cfg.som) beep();
            setTimeout(() => setNovo(null), 8000);
          }
          lastId.current = up.id;
        }
      } catch {
        /* ignora */
      }
    }
    puxar();
    const t = setInterval(puxar, 5000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [cfg.novoPedido, cfg.som]);

  const telas = useMemo(() => {
    const all = [
      { key: "resumo", el: <ResumoScreen d={data} /> },
      { key: "producao", el: <ProducaoScreen d={data} /> },
      { key: "urgentes", el: <UrgentesScreen d={data} /> },
      { key: "ranking", el: <RankingScreen d={data} /> },
      { key: "expedicao", el: <ExpedicaoScreen d={data} /> },
      { key: "avisos", el: <AvisosScreen d={data} /> },
    ];
    return all.filter((t) => cfg.telas[t.key]);
  }, [data, cfg.telas]);

  // rotação
  useEffect(() => {
    if (pausado || novo || telas.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % telas.length), cfg.intervalo * 1000);
    return () => clearInterval(t);
  }, [pausado, novo, telas.length, cfg.intervalo]);

  useEffect(() => {
    if (idx >= telas.length) setIdx(0);
  }, [telas.length, idx]);

  // teclado
  useEffect(() => {
    function k(e: KeyboardEvent) {
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % Math.max(1, telas.length));
      else if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + telas.length) % Math.max(1, telas.length));
      else if (e.key === " ") {
        e.preventDefault();
        setPausado((p) => !p);
      }
    }
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [telas.length]);

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }

  // Dispara a animação de "novo pedido" sem tocar no banco (apenas demonstração).
  function simular() {
    const exemplos = ["Loja Aurora", "Casa Bella", "Tricô & Cia", "Boutique Lumiar", "Atelier Sul"];
    const fake: NonNullable<DashboardData["ultimoPedido"]> = {
      id: "sim-" + Date.now(),
      numero: String(2000 + Math.floor(Math.random() * 900)),
      cliente: exemplos[Math.floor(Math.random() * exemplos.length)],
      vendedor: "Demonstração",
      data_entrega: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
      pecas: 40 + Math.floor(Math.random() * 160),
    };
    setShowCfg(false);
    setNovo(fake);
    if (cfg.som) beep();
    setTimeout(() => setNovo(null), 8000);
  }

  return (
    <div className="dash">
      <div className="dash-top">
        <div className="dash-brand">
          <b>BIG TRICOT</b>
          <span>Painel de Produção · ao vivo</span>
        </div>
        <div className="dash-clock">🕒 {hora}</div>
      </div>

      <div className="dash-stage">
        {telas.length === 0 ? (
          <div className="dash-empty">Nenhuma tela ativa — abra as configurações ⚙</div>
        ) : (
          <div className="dash-screen" key={telas[Math.min(idx, telas.length - 1)]?.key}>
            {telas[Math.min(idx, telas.length - 1)]?.el}
          </div>
        )}
      </div>

      <div className="dash-ctrl">
        <button className="dash-btn" onClick={() => setIdx((i) => (i - 1 + telas.length) % Math.max(1, telas.length))}>◀</button>
        <button className="dash-btn" onClick={() => setPausado((p) => !p)}>{pausado ? "▶ Play" : "⏸ Pausar"}</button>
        <button className="dash-btn" onClick={() => setIdx((i) => (i + 1) % Math.max(1, telas.length))}>▶</button>
        <div className="dash-dots">
          {telas.map((t, i) => (
            <span key={t.key} className={"dash-dot" + (i === Math.min(idx, telas.length - 1) ? " on" : "")} onClick={() => setIdx(i)} />
          ))}
        </div>
        <button className="dash-btn" onClick={fullscreen}>⛶ Tela cheia</button>
        <button className="dash-btn" onClick={() => setShowCfg(true)}>⚙</button>
      </div>

      {novo && <NovoPedidoOverlay p={novo} mostrarValores={cfg.mostrarValores} />}
      {showCfg && <ConfigPanel cfg={cfg} setCfg={setCfg} avisos={data?.avisos || []} onFechar={() => setShowCfg(false)} onMudouAvisos={() => api.dashboard().then(setData)} onSimular={simular} />}
    </div>
  );
}

function Card({ ic, n, l, tom }: { ic: string; n: number | string; l: string; tom?: string }) {
  return (
    <div className={"dash-card " + (tom || "")}>
      <div className="ic">{ic}</div>
      <div className="kpi">{n}</div>
      <div className="lbl">{l}</div>
    </div>
  );
}

function ResumoScreen({ d }: { d: DashboardData | null }) {
  const h = d?.hoje;
  return (
    <>
      <h2 className="dash-h2"><span className="ic">📊</span> Resumo do dia</h2>
      <div className="dash-grid g5">
        <Card ic="🧾" n={h?.pedidos ?? 0} l="Pedidos hoje" tom="blue" />
        <Card ic="🧶" n={h?.pecas ?? 0} l="Peças hoje" tom="purple" />
        <Card ic="⏰" n={h?.atrasados ?? 0} l="Em atraso" tom="red" />
        <Card ic="📅" n={h?.entregaProxima ?? 0} l="Entrega próxima" tom="yellow" />
        <Card ic="✅" n={h?.finalizados ?? 0} l="Partes prontas" tom="green" />
      </div>
    </>
  );
}

function ProducaoScreen({ d }: { d: DashboardData | null }) {
  const p = d?.producao;
  const cards: [string, string, number, string][] = [
    ["⌛", "Aguardando tecelagem", p?.aguardando_tecelagem ?? 0, "yellow"],
    ["🧶", "Em tecelagem", p?.em_tecelagem ?? 0, "blue"],
    ["⌛", "Aguardando passadoria", p?.aguardando_passadoria ?? 0, "yellow"],
    ["🔥", "Em passadoria", p?.em_passadoria ?? 0, "blue"],
    ["⌛", "Aguardando corte", p?.aguardando_corte ?? 0, "yellow"],
    ["✂️", "Em corte", p?.em_corte ?? 0, "blue"],
    ["🪡", "Costura", p?.costura ?? 0, "purple"],
    ["🔍", "Revisão", p?.revisao ?? 0, "purple"],
    ["📦", "Expedição", p?.expedicao ?? 0, "green"],
  ];
  return (
    <>
      <h2 className="dash-h2"><span className="ic">🏭</span> Produção em tempo real</h2>
      <div className="dash-grid g3r2">
        {cards.map(([ic, l, n, tom]) => (
          <Card key={l} ic={ic} n={n} l={l} tom={tom} />
        ))}
      </div>
    </>
  );
}

function UrgentesScreen({ d }: { d: DashboardData | null }) {
  const u = d?.urgentes || [];
  return (
    <>
      <h2 className="dash-h2"><span className="ic">🚨</span> Pedidos urgentes</h2>
      <div className="dash-list">
        {u.length === 0 && <div className="dash-empty">Sem pedidos com prazo definido.</div>}
        {u.slice(0, 8).map((p, i) => (
          <div key={i} className={"dash-row" + (p.atrasado ? " atraso" : "")}>
            <span className="op">{p.numero || "—"}</span>
            <span className="cli">{p.cliente}</span>
            <span className={"ent" + (p.atrasado ? " atraso" : "")}>{p.atrasado ? "⚠ " : "📅 "}{brD(p.data_entrega)}</span>
            <span className="et">{ETAPA[p.etapa || ""] || "—"}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function RankingScreen({ d }: { d: DashboardData | null }) {
  const r = (d?.ranking || []).map((x) => ({ ...x, label: ETAPA[x.etapa] || x.etapa }));
  const max = Math.max(1, ...r.map((x) => x.qtd));
  return (
    <>
      <h2 className="dash-h2"><span className="ic">📈</span> Pedidos por etapa</h2>
      <div className="dash-bars">
        {r.length === 0 && <div className="dash-empty">Nada em produção ainda.</div>}
        {r.map((x) => (
          <div className="dash-bar" key={x.etapa}>
            <span>{x.label}</span>
            <div className="track">
              <div className="fill" style={{ width: `${(x.qtd / max) * 100}%` }} />
            </div>
            <span className="v">{x.qtd}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ExpedicaoScreen({ d }: { d: DashboardData | null }) {
  const e = d?.expedicao;
  return (
    <>
      <h2 className="dash-h2"><span className="ic">📦</span> Expedição</h2>
      <div className="dash-grid g3">
        <Card ic="✅" n={e?.prontos ?? 0} l="Prontos p/ envio" tom="green" />
        <Card ic="🧾" n={e?.aguardando_nf ?? 0} l="Aguardando NF" tom="yellow" />
        <Card ic="🚚" n={e?.enviados_hoje ?? 0} l="Enviados hoje" tom="blue" />
      </div>
    </>
  );
}

function AvisosScreen({ d }: { d: DashboardData | null }) {
  const a = d?.avisos || [];
  return (
    <>
      <h2 className="dash-h2"><span className="ic">📌</span> Avisos internos</h2>
      <div className="dash-avisos">
        {a.length === 0 && <div className="dash-empty">Nenhum aviso. Cadastre em ⚙ Configurações.</div>}
        {a.slice(0, 4).map((x) => (
          <div className="dash-aviso" key={x.id}>
            <span>📣</span> {x.texto}
          </div>
        ))}
      </div>
    </>
  );
}

function NovoPedidoOverlay({ p, mostrarValores }: { p: NonNullable<DashboardData["ultimoPedido"]>; mostrarValores: boolean }) {
  return (
    <div className="dash-novo">
      <div className="dash-novo-card">
        <div className="tag">✨ Novo pedido lançado!</div>
        <div className="titulo">{p.cliente}</div>
        <div className="meta">
          <div className="m"><div className="l">Pedido</div><div className="v">{p.numero || "—"}</div></div>
          <div className="m"><div className="l">Peças</div><div className="v">{p.pecas}</div></div>
          <div className="m"><div className="l">Representante</div><div className="v">{p.vendedor || "—"}</div></div>
          <div className="m"><div className="l">Entrega</div><div className="v">{brD(p.data_entrega)}</div></div>
          {mostrarValores && <div className="m"><div className="l">Valor</div><div className="v">—</div></div>}
        </div>
      </div>
    </div>
  );
}

function ConfigPanel({
  cfg,
  setCfg,
  avisos,
  onFechar,
  onMudouAvisos,
  onSimular,
}: {
  cfg: Cfg;
  setCfg: (c: Cfg) => void;
  avisos: { id: string; texto: string }[];
  onFechar: () => void;
  onMudouAvisos: () => void;
  onSimular: () => void;
}) {
  const [novoAviso, setNovoAviso] = useState("");
  const telasLabels: [string, string][] = [
    ["resumo", "Resumo do dia"],
    ["producao", "Produção"],
    ["urgentes", "Pedidos urgentes"],
    ["ranking", "Ranking de etapas"],
    ["expedicao", "Expedição"],
    ["avisos", "Avisos"],
  ];
  async function addAviso() {
    const t = novoAviso.trim();
    if (!t) return;
    await api.addAviso(t);
    setNovoAviso("");
    onMudouAvisos();
  }
  return (
    <div className="dash-cfg">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>⚙ Configurações</h3>
        <button className="dash-btn" onClick={onFechar}>✕</button>
      </div>

      <div className="grp">
        <label>
          Tempo entre telas (s)
          <input type="number" min={3} max={120} value={cfg.intervalo} onChange={(e) => setCfg({ ...cfg, intervalo: Math.max(3, Number(e.target.value) || 10) })} style={{ width: 80 }} />
        </label>
        <label>Som de novo pedido <input type="checkbox" checked={cfg.som} onChange={(e) => setCfg({ ...cfg, som: e.target.checked })} /></label>
        <label>Tela de novo pedido <input type="checkbox" checked={cfg.novoPedido} onChange={(e) => setCfg({ ...cfg, novoPedido: e.target.checked })} /></label>
        <label>Mostrar valores <input type="checkbox" checked={cfg.mostrarValores} onChange={(e) => setCfg({ ...cfg, mostrarValores: e.target.checked })} /></label>
        <button className="dash-btn" style={{ width: "100%", marginTop: 8, background: "linear-gradient(90deg,#6366f1,#a855f7)", color: "#fff" }} onClick={onSimular}>
          🎬 Simular novo pedido
        </button>
      </div>

      <div className="grp">
        <h3 style={{ fontSize: 16 }}>Telas no loop</h3>
        {telasLabels.map(([k, l]) => (
          <label key={k}>
            {l}
            <input type="checkbox" checked={!!cfg.telas[k]} onChange={(e) => setCfg({ ...cfg, telas: { ...cfg.telas, [k]: e.target.checked } })} />
          </label>
        ))}
      </div>

      <div className="grp">
        <h3 style={{ fontSize: 16 }}>Avisos</h3>
        <div className="aviso-row">
          <input type="text" placeholder="Novo aviso…" value={novoAviso} onChange={(e) => setNovoAviso(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAviso()} />
          <button className="dash-btn" onClick={addAviso}>＋</button>
        </div>
        {avisos.map((a) => (
          <div className="aviso-row" key={a.id}>
            <span style={{ flex: 1, fontSize: 14, color: "#cdd8f3" }}>{a.texto}</span>
            <button className="dash-btn" onClick={async () => { await api.removerAviso(a.id); onMudouAvisos(); }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
