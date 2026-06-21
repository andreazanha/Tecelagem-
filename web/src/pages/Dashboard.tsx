import { useEffect, useMemo, useRef, useState } from "react";
import { api, type DashboardData } from "../api";
import { Logo } from "../components/Logo";
import { Donut, DonutLegend, BarsH, LineArea, Columns, Gauge, type Slice } from "../components/charts";
import "../dashboard.css";

// ── Setores (cor + ícone próprios) ──────────────────────────────────────────
const SETOR: Record<string, { nome: string; ic: string; cor: string }> = {
  tecelagem: { nome: "Tecelagem", ic: "🧶", cor: "#6366f1" },
  passadoria: { nome: "Passadoria", ic: "🔥", cor: "#f97316" },
  corte: { nome: "Corte", ic: "✂️", cor: "#06b6d4" },
  costura: { nome: "Costura", ic: "🪡", cor: "#ec4899" },
  revisao: { nome: "Revisão", ic: "🔍", cor: "#eab308" },
  expedicao: { nome: "Expedição", ic: "📦", cor: "#22c55e" },
};
const ORDEM = ["tecelagem", "passadoria", "corte", "costura", "revisao", "expedicao"];

const brD = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : d;
};
const diaCurto = (iso: string) => {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : iso;
};

// Preenche os últimos N dias (sem buracos) a partir de uma série esparsa.
function ultimosDias(serie: { dia: string; value: number }[], n: number) {
  const mapa = new Map(serie.map((s) => [s.dia, s.value]));
  const out: { label: string; value: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ label: diaCurto(iso), value: mapa.get(iso) || 0 });
  }
  return out;
}

interface Cfg {
  intervalo: number;
  som: boolean;
  novoPedido: boolean;
  mostrarValores: boolean;
  metaPedidos: number;
  fixarComando: boolean;
  telas: Record<string, boolean>;
}
const CFG_PADRAO: Cfg = {
  intervalo: 12,
  som: false,
  novoPedido: true,
  mostrarValores: false,
  metaPedidos: 80,
  fixarComando: true,
  telas: { comando: true, capa: true, resumo: true, producao: true, urgentes: true, etapas: true, prazo: true, evolucao: true, ranking: true, avisos: true },
};
function carregarCfg(): Cfg {
  try {
    const v = JSON.parse(localStorage.getItem("dashCfg") || "{}");
    return { ...CFG_PADRAO, ...v, telas: { ...CFG_PADRAO.telas, ...(v.telas || {}) } };
  } catch {
    return CFG_PADRAO;
  }
}

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const tocar = (freq: number, t0: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.001, ctx.currentTime + t0);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t0 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t0 + 0.5);
      o.start(ctx.currentTime + t0);
      o.stop(ctx.currentTime + t0 + 0.5);
    };
    tocar(660, 0);
    tocar(880, 0.18);
    tocar(1180, 0.36);
  } catch {
    /* sem áudio */
  }
}

// ── Componente principal ─────────────────────────────────────────────────────
export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [cfg, setCfg] = useState<Cfg>(carregarCfg);
  const [idx, setIdx] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [showCfg, setShowCfg] = useState(false);
  const [novo, setNovo] = useState<DashboardData["ultimoPedido"]>(null);
  const [hora, setHora] = useState(new Date());
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    localStorage.setItem("dashCfg", JSON.stringify(cfg));
  }, [cfg]);

  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
            setTimeout(() => setNovo(null), 9000);
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
      { key: "comando", el: <ComandoScreen d={data} hora={hora} /> },
      { key: "capa", el: <CapaScreen hora={hora} /> },
      { key: "resumo", el: <ResumoScreen d={data} /> },
      { key: "producao", el: <ProducaoScreen d={data} /> },
      { key: "urgentes", el: <UrgentesScreen d={data} /> },
      { key: "etapas", el: <EtapasScreen d={data} /> },
      { key: "prazo", el: <PrazoScreen d={data} cfg={cfg} /> },
      { key: "evolucao", el: <EvolucaoScreen d={data} /> },
      { key: "ranking", el: <RankingScreen d={data} cfg={cfg} /> },
      { key: "avisos", el: <AvisosScreen d={data} /> },
    ];
    if (cfg.fixarComando) return all.filter((t) => t.key === "comando");
    return all.filter((t) => cfg.telas[t.key]);
  }, [data, cfg, hora]);

  useEffect(() => {
    if (pausado || novo || telas.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % telas.length), cfg.intervalo * 1000);
    return () => clearInterval(t);
  }, [pausado, novo, telas.length, cfg.intervalo, idx]);

  useEffect(() => {
    if (idx >= telas.length) setIdx(0);
  }, [telas.length, idx]);

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
    setTimeout(() => setNovo(null), 9000);
  }

  const at = Math.min(idx, Math.max(0, telas.length - 1));

  return (
    <div className="dash">
      <div className="dash-bg" aria-hidden>
        <span className="orb o1" />
        <span className="orb o2" />
        <span className="orb o3" />
        <span className="grid" />
      </div>

      <header className="dash-top">
        <div className="dash-brand">
          <span className="dash-mark">BT</span>
          <div>
            <b>BIG TRICOT</b>
            <span>Central de Produção · ao vivo</span>
          </div>
        </div>
        <div className="dash-top-right">
          <span className={"dash-live" + (pausado ? " off" : "")}>
            <span className="ping" /> {pausado ? "pausado" : "ao vivo"}
          </span>
          <div className="dash-clock">
            {hora.toLocaleTimeString("pt-BR")}
            <small>{hora.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" })}</small>
          </div>
        </div>
      </header>

      <main className="dash-stage">
        {telas.length === 0 ? (
          <div className="dash-empty">Nenhuma tela ativa — abra as configurações ⚙</div>
        ) : (
          <div className="dash-screen" key={telas[at]?.key}>
            {telas[at]?.el}
          </div>
        )}
      </main>

      <footer className="dash-ctrl">
        <button className="dash-btn" onClick={() => setIdx((i) => (i - 1 + telas.length) % Math.max(1, telas.length))}>◀</button>
        <button className="dash-btn" onClick={() => setPausado((p) => !p)}>{pausado ? "▶" : "⏸"}</button>
        <button className="dash-btn" onClick={() => setIdx((i) => (i + 1) % Math.max(1, telas.length))}>▶</button>
        <div className="dash-dots">
          {telas.map((t, i) => (
            <span key={t.key} className={"dash-dot" + (i === at ? " on" : "")} onClick={() => setIdx(i)} />
          ))}
        </div>
        <button className="dash-btn" onClick={fullscreen}>⛶</button>
        <button className="dash-btn" onClick={() => setShowCfg(true)}>⚙</button>
      </footer>

      {novo && <NovoPedidoOverlay p={novo} mostrarValores={cfg.mostrarValores} />}
      {showCfg && (
        <ConfigPanel
          cfg={cfg}
          setCfg={setCfg}
          avisos={data?.avisos || []}
          onFechar={() => setShowCfg(false)}
          onMudouAvisos={() => api.dashboard().then(setData)}
          onSimular={simular}
        />
      )}
    </div>
  );
}

// ── Tela: Central de Comando (visão única e densa) ──────────────────────────────
function ComandoScreen({ d, hora }: { d: DashboardData | null; hora: Date }) {
  const h = d?.hoje;

  // Produção por etapa (barras)
  const ped = d?.graficos?.pedidosPorEtapa || [];
  const demoEtapa = !ped.length || ped.every((x) => !x.qtd);
  const etapaDados = demoEtapa ? ORDEM.map((s, i) => ({ etapa: s, qtd: [12, 8, 6, 9, 4, 7][i] })) : ped;
  const barEtapa = etapaDados.map((x) => ({ label: SETOR[x.etapa]?.nome || x.etapa, value: x.qtd, color: SETOR[x.etapa]?.cor }));

  // Pedidos por dia (linha)
  const serie = (d?.graficos?.pedidosPorDia || []).map((x) => ({ dia: x.dia, value: x.qtd }));
  const realDia = serie.some((x) => x.value > 0);
  let linha = ultimosDias(serie, 10);
  if (!realDia) linha = linha.map((p, i) => ({ ...p, value: [3, 2, 4, 5, 3, 6, 4, 7, 5, 8][i] ?? 3 }));

  // Peças produzidas (colunas, semana)
  const sem = (d?.graficos?.pecasSemana || []).map((x) => ({ dia: x.dia, value: x.pecas }));
  const realSem = sem.some((x) => x.value > 0);
  let cols = ultimosDias(sem, 7);
  if (!realSem) cols = cols.map((p, i) => ({ ...p, value: [120, 180, 90, 220, 160, 240, 140][i] ?? 120 }));

  // Laterais
  const rep = d?.graficos?.topRepresentantes || [];
  const cli = d?.graficos?.topClientes || [];
  const repD = rep.length && rep.some((x) => x.qtd)
    ? rep
    : [{ nome: "Ana Paula", qtd: 18 }, { nome: "Carlos", qtd: 14 }, { nome: "Marina", qtd: 11 }, { nome: "João", qtd: 9 }, { nome: "Paula", qtd: 6 }];
  const cliD = cli.length && cli.some((x) => x.pecas)
    ? cli
    : [{ nome: "Loja Aurora", pecas: 420 }, { nome: "Casa Bella", pecas: 360 }, { nome: "Tricô & Cia", pecas: 280 }, { nome: "Boutique Lumiar", pecas: 210 }, { nome: "Atelier Sul", pecas: 160 }];

  const alertas = [
    ...(d?.avisos || []).map((a) => ({ ic: "📣", txt: a.texto, tom: "amber" })),
    ...(h?.atrasados ? [{ ic: "⚠️", txt: `${h.atrasados} pedido(s) em atraso`, tom: "red" }] : []),
    ...(h?.entregaProxima ? [{ ic: "📅", txt: `${h.entregaProxima} entrega(s) nos próximos dias`, tom: "blue" }] : []),
  ];

  return (
    <div className="cmd">
      <div className="cmd-top">
        <div className="cmd-clock">
          <div className="t">{hora.toLocaleTimeString("pt-BR")}</div>
          <div className="d">{hora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</div>
        </div>
        <CmdKpi ic="🧾" n={h?.pedidos ?? 0} l="Pedidos hoje" tom="blue" />
        <CmdKpi ic="🧶" n={h?.pecas ?? 0} l="Peças hoje" tom="violet" />
        <CmdKpi ic="⏰" n={h?.atrasados ?? 0} l="Atrasados" tom="red" />
        <CmdKpi ic="⚡" n={`${h?.eficiencia ?? 0}%`} l="Eficiência" tom="green" />
      </div>

      <div className="cmd-mid">
        <div className="panel sm cmd-etapa">
          <div className="panel-t">Produção por etapa</div>
          <BarsH data={barEtapa} />
        </div>

        <div className="cmd-col2">
          <div className="panel sm">
            <div className="panel-t">Pedidos por dia</div>
            <LineArea data={linha} color="#38bdf8" height={170} />
          </div>
          <div className="panel sm">
            <div className="panel-t">Peças produzidas</div>
            <Columns data={cols} color="#a855f7" height={150} />
          </div>
        </div>

        <div className="cmd-side">
          <div className="panel sm">
            <div className="panel-t">🏆 Top 5 representantes</div>
            <CmdRank data={repD.map((x) => ({ nome: x.nome, v: x.qtd }))} suf="ped" />
          </div>
          <div className="panel sm">
            <div className="panel-t">👑 Top 5 clientes</div>
            <CmdRank data={cliD.map((x) => ({ nome: x.nome, v: x.pecas }))} suf="pç" />
          </div>
          <div className="panel sm">
            <div className="panel-t">🔔 Alertas</div>
            <div className="cmd-alertas">
              {alertas.length === 0 && <div className="urg-empty">Tudo sob controle ✅</div>}
              {alertas.slice(0, 4).map((a, i) => (
                <div className={"cmd-alerta " + a.tom} key={i}>
                  <span>{a.ic}</span> {a.txt}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Ticker eventos={d?.eventos || []} />
    </div>
  );
}
function CmdKpi({ ic, n, l, tom }: { ic: string; n: number | string; l: string; tom: string }) {
  return (
    <div className={"cmd-kpi " + tom}>
      <div className="cmd-kpi-ic">{ic}</div>
      <div className="cmd-kpi-n">{n}</div>
      <div className="cmd-kpi-l">{l}</div>
    </div>
  );
}
function CmdRank({ data, suf }: { data: { nome: string; v: number }[]; suf: string }) {
  const max = Math.max(1, ...data.map((x) => x.v));
  return (
    <div className="cmd-rank">
      {data.map((x, i) => (
        <div className="cmd-rank-row" key={i}>
          <span className="pos">{i + 1}</span>
          <span className="nm">{x.nome}</span>
          <div className="bar"><span style={{ width: `${(x.v / max) * 100}%` }} /></div>
          <span className="v">{x.v} {suf}</span>
        </div>
      ))}
    </div>
  );
}
function Ticker({ eventos }: { eventos: DashboardData["eventos"] }) {
  const txt: Record<string, (n: string) => string> = {
    entrou: (n) => `🟢 Pedido ${n} entrou`,
    expedido: (n) => `📦 Pedido ${n} foi expedido`,
    atrasado: (n) => `🔴 Pedido ${n} atrasado`,
  };
  const itens = (eventos.length
    ? eventos
    : [
        { tipo: "entrou" as const, numero: "254", cliente: "" },
        { tipo: "expedido" as const, numero: "251", cliente: "" },
        { tipo: "atrasado" as const, numero: "248", cliente: "" },
      ]
  ).map((e) => txt[e.tipo](e.numero || "—"));
  const linha = [...itens, ...itens, ...itens];
  return (
    <div className="ticker">
      <div className="ticker-tag">AO VIVO</div>
      <div className="ticker-track">
        <div className="ticker-move">
          {linha.map((t, i) => (
            <span className="ticker-item" key={i}>{t}<span className="sep">•</span></span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tela: Capa ────────────────────────────────────────────────────────────────
function CapaScreen({ hora }: { hora: Date }) {
  return (
    <div className="cap">
      <div className="cap-rings"><span /><span /><span /></div>
      <div className="cap-logo">
        <Logo h={64} color="#ffffff" />
      </div>
      <div className="cap-title">Central de Produção</div>
      <div className="cap-sub">Acompanhamento em tempo real da fábrica</div>
      <div className="cap-clock">{hora.toLocaleTimeString("pt-BR")}</div>
      <div className="cap-date">{hora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</div>
    </div>
  );
}

// ── Tela: Resumo (KPIs) ────────────────────────────────────────────────────────
function Kpi({ ic, n, l, tom, prog }: { ic: string; n: number | string; l: string; tom: string; prog?: number }) {
  return (
    <div className={"kpi " + tom}>
      <div className="kpi-ic">{ic}</div>
      <div className="kpi-n">{n}</div>
      <div className="kpi-l">{l}</div>
      {prog !== undefined && (
        <div className="kpi-prog">
          <span style={{ width: `${Math.max(4, Math.min(100, prog))}%` }} />
        </div>
      )}
    </div>
  );
}
function ResumoScreen({ d }: { d: DashboardData | null }) {
  const h = d?.hoje;
  const totalProd = d?.esteira?.reduce((s, e) => s + e.total, 0) || 0;
  return (
    <>
      <ScreenHead ic="📊" t="Resumo do dia" />
      <div className="kpi-grid">
        <Kpi ic="🧾" n={h?.pedidos ?? 0} l="Pedidos hoje" tom="blue" />
        <Kpi ic="🧶" n={h?.pecas ?? 0} l="Peças hoje" tom="violet" />
        <Kpi ic="🏭" n={totalProd} l="Em produção" tom="cyan" />
        <Kpi ic="⏰" n={h?.atrasados ?? 0} l="Em atraso" tom="red" />
        <Kpi ic="📅" n={h?.entregaProxima ?? 0} l="Entrega próxima" tom="amber" />
        <Kpi ic="✅" n={h?.finalizados ?? 0} l="Partes prontas" tom="green" />
      </div>
    </>
  );
}

// ── Tela: Produção (esteira) ────────────────────────────────────────────────────
function ProducaoScreen({ d }: { d: DashboardData | null }) {
  const real = d?.esteira || [];
  const demo = !real.length || real.every((e) => !e.total);
  const dados = demo
    ? ORDEM.map((s, i) => ({ setor: s, total: [12, 8, 6, 9, 4, 7][i], fazendo: [3, 2, 1, 2, 1, 0][i], aguardando: 0, pecas: 0 }))
    : ORDEM.map((s) => real.find((e) => e.setor === s) || { setor: s, total: 0, fazendo: 0, aguardando: 0, pecas: 0 });
  return (
    <>
      <ScreenHead ic="🏭" t="Linha de produção" demo={demo} />
      <div className="flow">
        {dados.map((e, i) => {
          const s = SETOR[e.setor];
          return (
            <div className="flow-item" key={e.setor}>
              <div className="flow-block" style={{ ["--c" as string]: s.cor }}>
                <div className="flow-ic">{s.ic}</div>
                <div className="flow-n">{e.total}</div>
                <div className="flow-name">{s.nome}</div>
                <div className="flow-tag">{e.fazendo > 0 ? `${e.fazendo} em andamento` : "—"}</div>
              </div>
              {i < dados.length - 1 && <div className="flow-arrow">›</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Tela: Urgências ────────────────────────────────────────────────────────────
function UrgentesScreen({ d }: { d: DashboardData | null }) {
  const u = d?.urgentes || [];
  const hojeISO = new Date().toISOString().slice(0, 10);
  const amanhaISO = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const atras = u.filter((p) => p.atrasado);
  const hoje = u.filter((p) => p.data_entrega === hojeISO && !p.atrasado);
  const amanha = u.filter((p) => p.data_entrega === amanhaISO);
  const col = (titulo: string, ic: string, lista: typeof u, tom: string) => (
    <div className={"urg-col " + tom}>
      <div className="urg-head">
        <span>{ic}</span> {titulo} <b>{lista.length}</b>
      </div>
      <div className="urg-list">
        {lista.length === 0 && <div className="urg-empty">Nada por aqui 🎉</div>}
        {lista.slice(0, 6).map((p, i) => (
          <div className="urg-card" key={i}>
            <div className="urg-op">{p.numero || "—"}</div>
            <div className="urg-cli">{p.cliente}</div>
            <div className="urg-ent">{brD(p.data_entrega)}</div>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <>
      <ScreenHead ic="🚨" t="Pedidos urgentes" />
      <div className="urg-grid">
        {col("Atrasados", "⚠️", atras, "red")}
        {col("Para hoje", "📍", hoje, "amber")}
        {col("Para amanhã", "📅", amanha, "blue")}
      </div>
    </>
  );
}

// ── Tela: Etapas (barras pedidos + peças) ────────────────────────────────────────
function EtapasScreen({ d }: { d: DashboardData | null }) {
  const g = d?.graficos;
  const ped = (g?.pedidosPorEtapa || []).map((x) => ({ ...x }));
  const pec = (g?.pecasPorEtapa || []).map((x) => ({ ...x }));
  const demo = !ped.length || ped.every((x) => !x.qtd);
  const pedDados = demo ? ORDEM.map((s, i) => ({ etapa: s, qtd: [12, 8, 6, 9, 4, 7][i] })) : ped;
  const pecDados = demo ? ORDEM.map((s, i) => ({ etapa: s, pecas: [240, 180, 160, 210, 90, 150][i] })) : pec;
  const bP = pedDados.map((x) => ({ label: SETOR[x.etapa]?.nome || x.etapa, value: x.qtd, color: SETOR[x.etapa]?.cor }));
  const bQ = pecDados.map((x) => ({ label: SETOR[x.etapa]?.nome || x.etapa, value: x.pecas, color: SETOR[x.etapa]?.cor }));
  return (
    <>
      <ScreenHead ic="📦" t="Produção por etapa" demo={demo} />
      <div className="two">
        <div className="panel">
          <div className="panel-t">Pedidos por etapa</div>
          <BarsH data={bP} />
        </div>
        <div className="panel">
          <div className="panel-t">Peças por etapa</div>
          <BarsH data={bQ} unidade="pç" />
        </div>
      </div>
    </>
  );
}

// ── Tela: Prazo (donut) + Meta ───────────────────────────────────────────────────
function PrazoScreen({ d, cfg }: { d: DashboardData | null; cfg: Cfg }) {
  const sp = d?.graficos?.statusPrazo;
  const real = sp && sp.atrasados + sp.hoje + sp.amanha + sp.emDia > 0;
  const s = real ? sp! : { atrasados: 3, hoje: 5, amanha: 4, emDia: 22 };
  const slices: Slice[] = [
    { label: "Em dia", value: s.emDia, color: "#22c55e" },
    { label: "Amanhã", value: s.amanha, color: "#38bdf8" },
    { label: "Hoje", value: s.hoje, color: "#fbbf24" },
    { label: "Atrasados", value: s.atrasados, color: "#f87171" },
  ];
  const total = slices.reduce((a, b) => a + b.value, 0);

  const meta = d?.graficos?.metaMes;
  const realizado = meta?.realizadoPedidos ?? (real ? 0 : 42);
  const alvo = Math.max(1, cfg.metaPedidos);
  const pct = realizado / alvo;

  return (
    <>
      <ScreenHead ic="🎯" t="Prazos & meta do mês" demo={!real} />
      <div className="two">
        <div className="panel center">
          <div className="panel-t">Status dos prazos</div>
          <Donut data={slices} centerBig={total} centerSub="pedidos" />
          <DonutLegend data={slices} />
        </div>
        <div className="panel center">
          <div className="panel-t">Meta do mês (pedidos)</div>
          <Gauge pct={pct} big={`${Math.round(pct * 100)}%`} sub={`${realizado} / ${alvo}`} color={pct >= 1 ? "#4ade80" : "#a855f7"} />
          <div className="meta-row">
            <div><b>{realizado}</b><span>realizado</span></div>
            <div><b>{alvo}</b><span>meta</span></div>
            <div><b>{Math.max(0, alvo - realizado)}</b><span>faltam</span></div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Tela: Evolução (linha + colunas) ──────────────────────────────────────────────
function EvolucaoScreen({ d }: { d: DashboardData | null }) {
  const serie = (d?.graficos?.pedidosPorDia || []).map((x) => ({ dia: x.dia, value: x.qtd }));
  const real = serie.some((x) => x.value > 0);
  let linha = ultimosDias(serie, 14);
  if (!real) linha = linha.map((p, i) => ({ ...p, value: [2, 3, 1, 4, 5, 3, 6, 4, 7, 5, 8, 6, 9, 7][i] ?? 3 }));

  const sem = (d?.graficos?.pecasSemana || []).map((x) => ({ dia: x.dia, value: x.pecas }));
  const realSem = sem.some((x) => x.value > 0);
  let cols = ultimosDias(sem, 7);
  if (!realSem) cols = cols.map((p, i) => ({ ...p, value: [120, 180, 90, 220, 160, 240, 140][i] ?? 120 }));

  return (
    <>
      <ScreenHead ic="📈" t="Evolução diária" demo={!real} />
      <div className="two col">
        <div className="panel">
          <div className="panel-t">Pedidos lançados (14 dias)</div>
          <LineArea data={linha} color="#38bdf8" />
        </div>
        <div className="panel">
          <div className="panel-t">Peças por dia (semana)</div>
          <Columns data={cols} color="#a855f7" />
        </div>
      </div>
    </>
  );
}

// ── Tela: Ranking (top representantes + clientes) ──────────────────────────────────
function RankingScreen({ d, cfg }: { d: DashboardData | null; cfg: Cfg }) {
  void cfg;
  const rep = d?.graficos?.topRepresentantes || [];
  const cli = d?.graficos?.topClientes || [];
  const demoRep = !rep.length || rep.every((x) => !x.qtd);
  const demoCli = !cli.length || cli.every((x) => !x.pecas);
  const repD = demoRep
    ? [
        { nome: "Ana Paula", qtd: 18 },
        { nome: "Carlos", qtd: 14 },
        { nome: "Marina", qtd: 11 },
        { nome: "João", qtd: 9 },
        { nome: "Paula", qtd: 6 },
      ]
    : rep;
  const cliD = demoCli
    ? [
        { nome: "Loja Aurora", pecas: 420 },
        { nome: "Casa Bella", pecas: 360 },
        { nome: "Tricô & Cia", pecas: 280 },
        { nome: "Boutique Lumiar", pecas: 210 },
        { nome: "Atelier Sul", pecas: 160 },
      ]
    : cli;
  return (
    <>
      <ScreenHead ic="🏆" t="Top representantes & clientes" demo={demoRep || demoCli} />
      <div className="two">
        <div className="panel">
          <div className="panel-t">Top 5 representantes · pedidos</div>
          <BarsH data={repD.map((x) => ({ label: x.nome, value: x.qtd }))} accent="#38bdf8" />
        </div>
        <div className="panel">
          <div className="panel-t">Top 5 clientes · peças</div>
          <BarsH data={cliD.map((x) => ({ label: x.nome, value: x.pecas }))} accent="#ec4899" unidade="pç" />
        </div>
      </div>
    </>
  );
}

// ── Tela: Avisos ─────────────────────────────────────────────────────────────────
function AvisosScreen({ d }: { d: DashboardData | null }) {
  const a = d?.avisos || [];
  return (
    <>
      <ScreenHead ic="📌" t="Avisos internos" />
      <div className="avisos">
        {a.length === 0 && <div className="dash-empty">Nenhum aviso. Cadastre em ⚙ Configurações.</div>}
        {a.slice(0, 5).map((x) => (
          <div className="aviso" key={x.id}>
            <span className="aviso-ic">📣</span>
            <span>{x.texto}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ScreenHead({ ic, t, demo }: { ic: string; t: string; demo?: boolean }) {
  return (
    <div className="screen-head">
      <span className="sh-ic">{ic}</span>
      <h2>{t}</h2>
      {demo && <span className="sh-demo">dados de demonstração</span>}
    </div>
  );
}

// ── Overlay: Novo pedido ──────────────────────────────────────────────────────────
function NovoPedidoOverlay({ p, mostrarValores }: { p: NonNullable<DashboardData["ultimoPedido"]>; mostrarValores: boolean }) {
  return (
    <div className="novo">
      <div className="novo-glow" />
      <div className="novo-rings"><span /><span /><span /></div>
      <div className="novo-card">
        <div className="novo-tag">✨ Novo pedido</div>
        <div className="novo-big">NOVO PEDIDO!</div>
        <div className="novo-cli">{p.cliente}</div>
        <div className="novo-meta">
          <div className="nm"><span className="l">Pedido</span><span className="v">{p.numero || "—"}</span></div>
          <div className="nm"><span className="l">Peças</span><span className="v">{p.pecas}</span></div>
          <div className="nm"><span className="l">Representante</span><span className="v">{p.vendedor || "—"}</span></div>
          <div className="nm"><span className="l">Entrega</span><span className="v">{brD(p.data_entrega)}</span></div>
          {mostrarValores && <div className="nm"><span className="l">Valor</span><span className="v">—</span></div>}
        </div>
      </div>
    </div>
  );
}

// ── Painel de configuração ─────────────────────────────────────────────────────────
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
    ["comando", "Central de Comando"],
    ["capa", "Capa de abertura"],
    ["resumo", "Resumo do dia"],
    ["producao", "Linha de produção"],
    ["urgentes", "Pedidos urgentes"],
    ["etapas", "Produção por etapa"],
    ["prazo", "Prazos & meta"],
    ["evolucao", "Evolução diária"],
    ["ranking", "Top representantes/clientes"],
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
      <div className="cfg-top">
        <h3>⚙ Configurações</h3>
        <button className="dash-btn" onClick={onFechar}>✕</button>
      </div>

      <div className="grp">
        <label>
          Tempo entre telas (s)
          <input type="number" min={4} max={120} value={cfg.intervalo} onChange={(e) => setCfg({ ...cfg, intervalo: Math.max(4, Number(e.target.value) || 12) })} style={{ width: 80 }} />
        </label>
        <label>
          Meta de pedidos no mês
          <input type="number" min={1} value={cfg.metaPedidos} onChange={(e) => setCfg({ ...cfg, metaPedidos: Math.max(1, Number(e.target.value) || 80) })} style={{ width: 80 }} />
        </label>
        <label>Apenas Central de Comando <input type="checkbox" checked={cfg.fixarComando} onChange={(e) => setCfg({ ...cfg, fixarComando: e.target.checked })} /></label>
        <label>Som de novo pedido <input type="checkbox" checked={cfg.som} onChange={(e) => setCfg({ ...cfg, som: e.target.checked })} /></label>
        <label>Tela de novo pedido <input type="checkbox" checked={cfg.novoPedido} onChange={(e) => setCfg({ ...cfg, novoPedido: e.target.checked })} /></label>
        <label>Mostrar valores <input type="checkbox" checked={cfg.mostrarValores} onChange={(e) => setCfg({ ...cfg, mostrarValores: e.target.checked })} /></label>
        <button className="cfg-sim" onClick={onSimular}>🎬 Simular novo pedido</button>
      </div>

      <div className="grp">
        <h3 className="grp-t">Telas no loop</h3>
        {telasLabels.map(([k, l]) => (
          <label key={k}>
            {l}
            <input type="checkbox" checked={!!cfg.telas[k]} onChange={(e) => setCfg({ ...cfg, telas: { ...cfg.telas, [k]: e.target.checked } })} />
          </label>
        ))}
      </div>

      <div className="grp">
        <h3 className="grp-t">Avisos</h3>
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
