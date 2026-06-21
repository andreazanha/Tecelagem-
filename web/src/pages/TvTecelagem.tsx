import { useEffect, useRef, useState } from "react";
import { api, type TvTecelagemData } from "../api";
import "../tv-tecelagem.css";

const nf = (n: number) => n.toLocaleString("pt-BR");
const brDM = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : d;
};
const hm = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "—";
};
const inicioFmt = (d?: string | null) => (d ? `${brDM(d)} ${hm(d)}` : "—");
function tempoProd(inicio?: string | null) {
  if (!inicio) return "—";
  const t = Date.parse(inicio.replace(" ", "T"));
  if (isNaN(t)) return "—";
  const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}

// Dados de demonstração (espelham a referência) enquanto não há produção real.
const DEMO: TvTecelagemData = {
  topo: { aguardando: 93, emTecimento: 128, finalizadosHoje: 67 },
  pecas: { hoje: 3842, mes: 78650, ano: 946320, maquinasEmUso: 3, maquinasTotal: 7 },
  emProducao: [
    { numero: "2587", cliente: "Loja Donna", quantidade: 250, dataInicio: "2025-06-20 08:15", previsao: "2025-06-22" },
    { numero: "2589", cliente: "Malhas Premium", quantidade: 180, dataInicio: "2025-06-20 09:30", previsao: "2025-06-22" },
    { numero: "2591", cliente: "Fashion Store", quantidade: 320, dataInicio: "2025-06-20 10:45", previsao: "2025-06-23" },
    { numero: "2593", cliente: "Tricot Style", quantidade: 210, dataInicio: "2025-06-20 11:20", previsao: "2025-06-23" },
    { numero: "2595", cliente: "Boutique Chic", quantidade: 160, dataInicio: "2025-06-20 12:05", previsao: "2025-06-23" },
    { numero: "2597", cliente: "Loja Exemplo", quantidade: 280, dataInicio: "2025-06-20 13:40", previsao: "2025-06-24" },
    { numero: "2599", cliente: "Cliente Especial", quantidade: 190, dataInicio: "2025-06-20 14:10", previsao: "2025-06-24" },
  ],
  pedidoAtual: { numero: "2587", cliente: "Loja Donna", quantidade: 250, entrega: "2025-06-22", inicio: "2025-06-20 08:15" },
  topProdutos: [
    { nome: "DALIA", pecas: 12850 },
    { nome: "BUBLES", pecas: 9430 },
    { nome: "PÉROLA", pecas: 7890 },
    { nome: "OTTO", pecas: 6420 },
    { nome: "KORA", pecas: 5780 },
  ],
  atualizacoes: [
    { numero: "2590", status: "fazendo", ts: "2025-06-20 14:10" },
    { numero: "2586", status: "pronto", ts: "2025-06-20 13:45" },
    { numero: "2584", status: "aguardando", ts: "2025-06-20 13:20" },
    { numero: "2583", status: "fazendo", ts: "2025-06-20 13:05" },
  ],
  geradoEm: "",
};

function vazio(d: TvTecelagemData | null) {
  if (!d) return true;
  const { topo, pecas } = d;
  return topo.aguardando + topo.emTecimento + topo.finalizadosHoje + pecas.mes + pecas.ano === 0 && d.emProducao.length === 0;
}

const STATUS: Record<string, { label: string; ic: string }> = {
  fazendo: { label: "Em produção", ic: "loom" },
  pronto: { label: "Finalizado", ic: "check" },
  aguardando: { label: "Aguardando início", ic: "clock" },
};

function Ic({ n, s = 24 }: { n: string; s?: number }) {
  const p: Record<string, React.ReactNode> = {
    clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
    loom: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v16M16 4v16" /></>),
    check: (<><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>),
    pecas: (<><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v6l8 4 8-4V7" /></>),
    maquina: (<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>),
    calendar: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>),
    bell: (<><path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 004 0" /></>),
    chart: (<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
    trophy: (<><path d="M7 4h10v4a5 5 0 01-10 0V4z" /><path d="M5 4H3v2a3 3 0 003 3M19 4h2v2a3 3 0 01-3 3M9 14h6M10 18h4M12 14v4" /></>),
    truck: (<><rect x="1" y="6" width="14" height="10" rx="1" /><path d="M15 9h4l3 3v4h-7z" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>),
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {p[n]}
    </svg>
  );
}

export function TvTecelagem() {
  const [raw, setRaw] = useState<TvTecelagemData | null>(null);
  const [hora, setHora] = useState(new Date());
  const [foto, setFoto] = useState<string | null>(() => localStorage.getItem("tclFoto"));
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let vivo = true;
    async function puxar() {
      try {
        const d = await api.tvTecelagem();
        if (vivo) setRaw(d);
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
  }, []);

  const d = vazio(raw) ? DEMO : (raw as TvTecelagemData);
  const demo = vazio(raw);

  function trocarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      localStorage.setItem("tclFoto", url);
      setFoto(url);
    };
    r.readAsDataURL(f);
  }

  const dataExt = hora.toLocaleDateString("pt-BR", { weekday: "long" }).toUpperCase();
  const dataLin = hora.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();

  return (
    <div className="tcl">
      {/* ── Cabeçalho ── */}
      <header className="tcl-top">
        <div className="tcl-brand">
          <div className="tcl-logo">
            B<span>i</span>G<small>TRICOT HOME DECOR</small>
          </div>
          <span className="tcl-div" />
          <div className="tcl-setor">
            <h1>TECELAGEM</h1>
            <span>PRODUÇÃO EM TEMPO REAL</span>
          </div>
        </div>

        <div className="tcl-kpis">
          <Kpi ic="clock" label="AGUARDANDO INÍCIO" n={d.topo.aguardando} sub="pedidos" />
          <Kpi ic="loom" label="EM TECIMENTO" n={d.topo.emTecimento} sub="pedidos" />
          <Kpi ic="check" label="FINALIZADOS HOJE" n={d.topo.finalizadosHoje} sub="pedidos" gold />
        </div>

        <div className="tcl-clock">
          <div className="t">{hora.toLocaleTimeString("pt-BR")}</div>
          <div className="d">{dataExt}</div>
          <div className="d2">{dataLin}</div>
        </div>
      </header>

      {demo && <div className="tcl-demo">dados de demonstração — começa a refletir a produção real assim que houver tecelagem em andamento</div>}

      {/* ── Corpo ── */}
      <div className="tcl-main">
        {/* Coluna esquerda */}
        <section className="tcl-left">
          <div className="tcl-photo" onClick={() => fileRef.current?.click()} title="Clique para trocar a foto da máquina">
            {foto ? <img src={foto} alt="Máquina" /> : <div className="tcl-photo-ph"><Ic n="loom" s={64} /><span>Foto da máquina<br /><small>clique para enviar</small></span></div>}
            <div className="tcl-status">
              <span className="lbl">STATUS GERAL</span>
              <span className="val"><i className="dot" /> OPERACIONAL</span>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={trocarFoto} />
          </div>

          <div className="tcl-stats">
            <Stat ic="pecas" label="PEÇAS PRODUZIDAS HOJE" n={nf(d.pecas.hoje)} sub="peças" />
            <Stat label="ACUMULADO DO MÊS" n={nf(d.pecas.mes)} sub="peças" />
            <Stat ic="maquina" label="MÁQUINAS EM OPERAÇÃO" n={`${d.pecas.maquinasEmUso} de ${d.pecas.maquinasTotal}`} sub="máquinas" />
            <Stat label="ACUMULADO DO ANO" n={nf(d.pecas.ano)} sub="peças" />
          </div>

          <div className="tcl-atual">
            <div className="tcl-atual-ic"><Ic n="chart" s={46} /></div>
            <div className="tcl-atual-body">
              <div className="tcl-atual-t">PEDIDO ATUAL</div>
              <div className="tcl-atual-row">
                <div><span className="l">NÚMERO</span><span className="v gold">#{d.pedidoAtual?.numero || "—"}</span></div>
                <div><span className="l">CLIENTE</span><span className="v">{d.pedidoAtual?.cliente || "—"}</span></div>
                <div><span className="l">QUANTIDADE</span><span className="v">{d.pedidoAtual?.quantidade ?? 0}<small> peças</small></span></div>
              </div>
              <div className="tcl-atual-row sub">
                <div><span className="l">DATA DE ENTREGA</span><span className="v">{brDM(d.pedidoAtual?.entrega)}</span></div>
                <div><span className="l">DATA DE INÍCIO</span><span className="v">{inicioFmt(d.pedidoAtual?.inicio)}</span></div>
                <div><span className="l">TEMPO EM PRODUÇÃO</span><span className="v"><Ic n="clock" s={16} /> {tempoProd(d.pedidoAtual?.inicio)}</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* Coluna direita */}
        <section className="tcl-right">
          <div className="tcl-card tcl-tabela">
            <div className="tcl-card-h">
              <span>PEDIDOS EM PRODUÇÃO ({d.emProducao.length})</span>
              <Ic n="loom" s={26} />
            </div>
            <table>
              <thead>
                <tr><th>PEDIDO</th><th>CLIENTE</th><th>QUANTIDADE</th><th>DATA INÍCIO</th><th>PREVISÃO</th></tr>
              </thead>
              <tbody>
                {d.emProducao.map((p, i) => (
                  <tr key={i}>
                    <td className="gold">{p.numero || "—"}</td>
                    <td>{p.cliente}</td>
                    <td>{p.quantidade} peças</td>
                    <td>{inicioFmt(p.dataInicio)}</td>
                    <td>{brDM(p.previsao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tcl-card tcl-vendidos">
            <div className="tcl-card-h"><span>PRODUTOS MAIS VENDIDOS</span></div>
            <div className="tcl-rank">
              {d.topProdutos.map((p, i) => {
                const max = Math.max(1, ...d.topProdutos.map((x) => x.pecas));
                return (
                  <div className="tcl-rank-row" key={i}>
                    <span className={"medal m" + (i + 1)}>{i + 1}</span>
                    <span className="nm">{p.nome}</span>
                    <div className="bar"><span style={{ width: `${(p.pecas / max) * 100}%` }} /></div>
                    <span className="v">{nf(p.pecas)} <small>peças</small></span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* ── Ticker ── */}
      <footer className="tcl-ticker">
        <div className="tcl-ticker-tag"><Ic n="bell" s={22} /> ÚLTIMAS ATUALIZAÇÕES</div>
        <div className="tcl-ticker-items">
          {d.atualizacoes.map((a, i) => {
            const s = STATUS[a.status] || STATUS.aguardando;
            return (
              <div className="tcl-upd" key={i}>
                <span className="ic"><Ic n={s.ic} s={20} /></span>
                <span className="txt">Pedido #{a.numero || "—"}<small>{s.label}</small></span>
                <span className="hora">{hm(a.ts)}</span>
              </div>
            );
          })}
        </div>
      </footer>
    </div>
  );
}

function Kpi({ ic, label, n, sub, gold }: { ic: string; label: string; n: number; sub: string; gold?: boolean }) {
  return (
    <div className={"tcl-kpi" + (gold ? " gold" : "")}>
      <div className="tcl-kpi-ic"><Ic n={ic} s={26} /></div>
      <div className="tcl-kpi-body">
        <span className="lbl">{label}</span>
        <span className="n">{nf(n)}</span>
        <span className="sub">{sub}</span>
      </div>
    </div>
  );
}

function Stat({ ic, label, n, sub }: { ic?: string; label: string; n: string; sub: string }) {
  return (
    <div className="tcl-stat">
      {ic && <div className="tcl-stat-ic"><Ic n={ic} s={22} /></div>}
      <span className="lbl">{label}</span>
      <span className="n">{n}</span>
      <span className="sub">{sub}</span>
    </div>
  );
}
