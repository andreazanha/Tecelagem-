import { useEffect, useState } from "react";
import { api, type TvRevisaoData } from "../api";
import { Donut, BarsH, type Slice } from "../components/charts";
import "../tv-costura.css";

const CORES = ["#38bdf8", "#a855f7", "#22c55e", "#fbbf24", "#ec4899", "#06b6d4"];
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

const DEMO: TvRevisaoData = {
  topo: { revisadorasAtivas: 4, revisadorasTotal: 4, pedidosEmRevisao: 6, pecasEmRevisao: 870, totalDia: 540, totalMes: 12480, totalAno: 142300 },
  status: { emRevisao: 6, aguardando: 3, finalizadosHoje: 4 },
  revisadoras: [
    { nome: "Betânia", qtdPedidos: 2, qtdPecas: 260, emRevisao: "#2597", aguardando: ["#2601"], datas: ["2025-06-21", "2025-06-23"] },
    { nome: "Bruna", qtdPedidos: 1, qtdPecas: 150, emRevisao: "#2593", aguardando: [], datas: ["2025-06-22"] },
    { nome: "Sula", qtdPedidos: 2, qtdPecas: 300, emRevisao: "#2588", aguardando: ["#2604"], datas: ["2025-06-21", "2025-06-24"] },
    { nome: "Eduarda", qtdPedidos: 1, qtdPecas: 160, emRevisao: "#2591", aguardando: [], datas: ["2025-06-22"] },
  ],
  ultimosFinalizados: [
    { numero: "2596", cliente: "Loja Donna", pecas: 140, finalizado_em: "2025-06-20 20:40" },
    { numero: "2595", cliente: "Fashion Store", pecas: 180, finalizado_em: "2025-06-20 20:25" },
    { numero: "2592", cliente: "Malhas Premium", pecas: 120, finalizado_em: "2025-06-20 20:10" },
    { numero: "2589", cliente: "Tricot Style", pecas: 160, finalizado_em: "2025-06-20 19:55" },
    { numero: "2586", cliente: "Boutique Chic", pecas: 150, finalizado_em: "2025-06-20 19:35" },
  ],
  proximosPrazos: [
    { numero: "2594", cliente: "Malhas Premium", data_entrega: "2025-06-20" },
    { numero: "2587", cliente: "Loja Donna", data_entrega: "2025-06-20" },
    { numero: "2597", cliente: "Loja Exemplo", data_entrega: "2025-06-21" },
    { numero: "2591", cliente: "Cliente Especial", data_entrega: "2025-06-21" },
    { numero: "2593", cliente: "Fashion Store", data_entrega: "2025-06-21" },
  ],
  avisos: [],
  geradoEm: "",
};

function vazio(d: TvRevisaoData | null) {
  if (!d) return true;
  const t = d.topo;
  return t.pecasEmRevisao + t.totalDia + t.totalAno === 0 && d.revisadoras.length === 0;
}

function Ic({ n, s = 24 }: { n: string; s?: number }) {
  const p: Record<string, React.ReactNode> = {
    search: (<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>),
    user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>),
    users: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 3-5 6-5s6 1.7 6 5" /><path d="M16 5.5a3 3 0 010 5.8M21 20c0-2.8-2-4.4-4.5-4.8" /></>),
    clip: (<><rect x="5" y="4" width="14" height="17" rx="2" /><rect x="9" y="2.5" width="6" height="3" rx="1" /><path d="M9 11h6M9 15h6" /></>),
    sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>),
    cal: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>),
    box: (<><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v6l8 4 8-4V7" /></>),
    check: (<><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>),
    bell: (<><path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 004 0" /></>),
    target: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>),
    star: (<><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z" /></>),
    clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {p[n]}
    </svg>
  );
}

// Última resposta boa, para a tela reabrir já com dados reais no loop.
let cacheRevisao: TvRevisaoData | null = null;

export function TvRevisao() {
  const [raw, setRaw] = useState<TvRevisaoData | null>(() => cacheRevisao);
  const [hora, setHora] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let vivo = true;
    const puxar = async () => {
      try { const d = await api.tvRevisao(); if (vivo) { cacheRevisao = d; setRaw(d); } } catch { /* ignora */ }
    };
    puxar();
    const t = setInterval(puxar, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const d = vazio(raw) ? DEMO : (raw as TvRevisaoData);
  const demo = vazio(raw);

  const dataExt = hora.toLocaleDateString("pt-BR", { weekday: "long" }).toUpperCase();
  const dataLin = hora.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();

  const slices: Slice[] = [
    { label: "Em revisão", value: d.status.emRevisao, color: "#38bdf8" },
    { label: "Aguardando", value: d.status.aguardando, color: "#fbbf24" },
    { label: "Finalizados hoje", value: d.status.finalizadosHoje, color: "#4ade80" },
  ];
  const totalStatus = slices.reduce((a, b) => a + b.value, 0);
  const meta = 85;
  const revs = d.revisadoras.length ? d.revisadoras : DEMO.revisadoras;

  return (
    <div className="cst">
      <header className="cst-top">
        <div className="cst-brand">
          <img className="cst-logo-img" src="/logo-bigtricot.png" alt="Big Tricot" />
          <span className="cst-div" />
          <div className="cst-ic"><Ic n="search" s={32} /></div>
          <div className="cst-setor">
            <h1>REVISÃO</h1>
            <span>PRODUÇÃO EM TEMPO REAL</span>
          </div>
        </div>
        <div className="cst-kpis">
          <Kpi ic="users" label="REVISADORAS ATIVAS" v={`${d.topo.revisadorasAtivas}`} sub={`de ${d.topo.revisadorasTotal || DEMO.topo.revisadorasTotal}`} />
          <Kpi ic="search" label="PEÇAS EM REVISÃO" v={nf(d.topo.pecasEmRevisao)} sub="peças" gold />
          <Kpi ic="sun" label="TOTAL DO DIA" v={nf(d.topo.totalDia)} sub="peças" />
          <Kpi ic="cal" label="TOTAL DO MÊS" v={nf(d.topo.totalMes)} sub="peças" />
          <Kpi ic="box" label="TOTAL DO ANO" v={nf(d.topo.totalAno)} sub="peças" />
        </div>
        <div className="cst-clock">
          <div className="t"><Ic n="clock" s={16} /> {hora.toLocaleTimeString("pt-BR")}</div>
          <div className="dd">{dataExt}</div>
          <div className="dd2">{dataLin}</div>
        </div>
      </header>

      {demo && <div className="cst-demo">dados de demonstração — cadastre as revisadoras em Cadastros › Operadores (setor Revisão)</div>}

      <div className="cst-main">
        <section className="cst-left">
          <div className="cst-card" style={{ minHeight: 0 }}>
            <div className="cst-card-h sm"><span><Ic n="search" s={18} /> PEÇAS POR REVISADORA</span></div>
            <BarsH data={revs.map((r, i) => ({ label: r.nome, value: r.qtdPecas, color: CORES[i % CORES.length] }))} unidade="pç" />
          </div>
          <div className="cst-stats">
            <Stat ic="sun" label="TOTAL DO DIA" v={nf(d.topo.totalDia)} sub="peças" />
            <Stat ic="cal" label="TOTAL DO MÊS" v={nf(d.topo.totalMes)} sub="peças" />
            <Stat ic="box" label="TOTAL DO ANO" v={nf(d.topo.totalAno)} sub="peças" />
            <Stat ic="clip" label="PEDIDOS EM REVISÃO" v={nf(d.topo.pedidosEmRevisao)} sub="pedidos" />
          </div>
        </section>

        <section className="cst-right">
          <div className="cst-card cst-tela">
            <div className="cst-card-h"><span><Ic n="users" s={22} /> TELA DAS REVISADORAS</span></div>
            <table>
              <thead>
                <tr><th>REVISADORA</th><th className="c">QTD. PEDIDOS</th><th className="c">QTD. PEÇAS</th><th>EM REVISÃO AGORA</th><th>AGUARDANDO COM ELA</th><th>DATA DE ENTREGA</th></tr>
              </thead>
              <tbody>
                {revs.map((c, i) => (
                  <tr key={i}>
                    <td className="nm"><span className="cst-av"><Ic n="user" s={18} /></span> {c.nome}</td>
                    <td className="c"><span className="cst-qt">{c.qtdPedidos}</span></td>
                    <td className="c pec">{nf(c.qtdPecas)}</td>
                    <td>{c.emRevisao ? <span className="badge verde">{c.emRevisao}</span> : <span className="muted">—</span>}</td>
                    <td><div className="badges">{c.aguardando.map((a, j) => <span className="badge amb" key={j}>{a}</span>)}{c.aguardando.length === 0 && <span className="muted">—</span>}</div></td>
                    <td className="dt">{c.datas.map((x) => brDM(x)).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="cst-bottom" style={{ gridTemplateColumns: "0.9fr 1.05fr 1.05fr" }}>
        <div className="cst-card center">
          <div className="cst-card-h sm"><span>STATUS DA REVISÃO</span></div>
          <div className="cst-donutrow">
            <Donut data={slices} size={150} thickness={24} centerBig={totalStatus} centerSub="pedidos" />
            <div className="cst-leg">
              {slices.map((s) => (
                <div className="lg" key={s.label}>
                  <span className="dot" style={{ background: s.color }} />
                  <span className="l">{s.label}</span>
                  <span className="v">{totalStatus ? Math.round((s.value / totalStatus) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="cst-card">
          <div className="cst-card-h sm"><span>ÚLTIMOS PEDIDOS REVISADOS</span></div>
          <div className="cst-lista">
            {(d.ultimosFinalizados.length ? d.ultimosFinalizados : DEMO.ultimosFinalizados).map((u, i) => (
              <div className="li" key={i}>
                <span className="ic ok"><Ic n="check" s={18} /></span>
                <span className="op">#{u.numero || "—"}</span>
                <span className="cli">{u.cliente}</span>
                <span className="pc">{u.pecas} peças</span>
                <span className="hr">{hm(u.finalizado_em)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="cst-card">
          <div className="cst-card-h sm"><span>PRÓXIMOS PRAZOS DE ENTREGA</span></div>
          <div className="cst-lista">
            {(d.proximosPrazos.length ? d.proximosPrazos : DEMO.proximosPrazos).map((u, i) => (
              <div className="li" key={i}>
                <span className="ic cal"><Ic n="cal" s={18} /></span>
                <span className="op">#{u.numero || "—"}</span>
                <span className="cli">{u.cliente}</span>
                <span className="dt2">{brDM(u.data_entrega)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <footer className="cst-ticker">
        <div className="cst-tk-tag"><Ic n="bell" s={20} /> COMUNICADOS</div>
        <div className="cst-tk-msg">{d.avisos[0]?.texto || "Reunião de alinhamento: Segunda-feira às 07:30"}</div>
        <div className="cst-tk-meta"><Ic n="target" s={18} /> META DO MÊS <b>{meta}%</b></div>
        <div className="cst-tk-frase"><Ic n="star" s={18} /> Atenção aos detalhes — qualidade em primeiro lugar!</div>
      </footer>
    </div>
  );
}

function Kpi({ ic, label, v, sub, gold }: { ic: string; label: string; v: string; sub: string; gold?: boolean }) {
  return (
    <div className={"cst-kpi" + (gold ? " gold" : "")}>
      <div className="cst-kpi-ic"><Ic n={ic} s={24} /></div>
      <div className="cst-kpi-body">
        <span className="lbl">{label}</span>
        <span className="n">{v}</span>
        <span className="sub">{sub}</span>
      </div>
    </div>
  );
}
function Stat({ ic, label, v, sub }: { ic: string; label: string; v: string; sub: string }) {
  return (
    <div className="cst-stat">
      <div className="cst-stat-ic"><Ic n={ic} s={20} /></div>
      <span className="lbl">{label}</span>
      <span className="n">{v}</span>
      <span className="sub">{sub}</span>
    </div>
  );
}
