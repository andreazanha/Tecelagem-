import { useEffect, useState } from "react";
import { api, type TvCosturaData } from "../api";
import { Donut, BarsH, type Slice } from "../components/charts";
import "../tv-costura.css";

const nf = (n: number) => n.toLocaleString("pt-BR");
const CORES = ["#a855f7", "#38bdf8", "#22c55e", "#fbbf24", "#ec4899", "#06b6d4"];
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

const DEMO: TvCosturaData = {
  topo: { costureirasAtivas: 6, costureirasTotal: 6, pedidosComCostureiras: 16, pecasEmCostura: 2255, finalizadosHoje: 73, acumuladoAno: 285760, maquinasOperacao: 42, maquinasTotal: 48 },
  status: { emCostura: 9, aguardando: 4, emRevisao: 2, finalizadosHoje: 1 },
  costureiras: [
    { nome: "Silvia", qtdPedidos: 3, qtdPecas: 420, emCostura: "#2597", aguardando: ["#2601", "#2605"], datas: ["2025-06-21", "2025-06-22", "2025-06-24"] },
    { nome: "Angelica", qtdPedidos: 2, qtdPecas: 310, emCostura: "#2593", aguardando: ["#2599"], datas: ["2025-06-21", "2025-06-23"] },
    { nome: "Bene", qtdPedidos: 4, qtdPecas: 520, emCostura: "#2588", aguardando: ["#2594", "#2602", "#2607"], datas: ["2025-06-20", "2025-06-22", "2025-06-24", "2025-06-25"] },
    { nome: "Nice", qtdPedidos: 2, qtdPecas: 275, emCostura: "#2591", aguardando: ["#2596"], datas: ["2025-06-21", "2025-06-22"] },
    { nome: "Cristina", qtdPedidos: 3, qtdPecas: 390, emCostura: "#2587", aguardando: ["#2598", "#2603"], datas: ["2025-06-20", "2025-06-23", "2025-06-24"] },
    { nome: "Thiago", qtdPedidos: 2, qtdPecas: 340, emCostura: "#2590", aguardando: ["#2604"], datas: ["2025-06-21", "2025-06-24"] },
  ],
  tipos: [
    { nome: "Peseiras", pedidos: 7, pct: 44 },
    { nome: "Mantas", pedidos: 4, pct: 25 },
    { nome: "Almofadas", pedidos: 3, pct: 19 },
    { nome: "Capas de almofada", pedidos: 2, pct: 12 },
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

// Sem produção real ainda → mostra demonstração para a tela ficar "viva".
function vazio(d: TvCosturaData | null) {
  if (!d) return true;
  const t = d.topo;
  return t.pecasEmCostura + t.finalizadosHoje + t.acumuladoAno === 0;
}

function Ic({ n, s = 24 }: { n: string; s?: number }) {
  const p: Record<string, React.ReactNode> = {
    seam: (<><path d="M3 12h18M5 12l2-3M9 12l2-3M13 12l2-3M17 12l2-3" /><circle cx="12" cy="17" r="2" /></>),
    user: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>),
    users: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 3-5 6-5s6 1.7 6 5" /><path d="M16 5.5a3 3 0 010 5.8M21 20c0-2.8-2-4.4-4.5-4.8" /></>),
    clip: (<><rect x="5" y="4" width="14" height="17" rx="2" /><rect x="9" y="2.5" width="6" height="3" rx="1" /><path d="M9 11h6M9 15h6" /></>),
    spool: (<><path d="M7 4h10M7 20h10M8 4v16M16 4v16" /><path d="M8 9h8M8 12h8M8 15h8" /></>),
    box: (<><path d="M4 7l8-4 8 4-8 4-8-4z" /><path d="M4 7v6l8 4 8-4V7" /></>),
    machine: (<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>),
    check: (<><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>),
    bell: (<><path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 004 0" /></>),
    target: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>),
    star: (<><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z" /></>),
    cal: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>),
    clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {p[n]}
    </svg>
  );
}

// Última resposta boa, para a tela reabrir já com dados reais no loop.
let cacheCostura: TvCosturaData | null = null;

export function TvCostura() {
  const [raw, setRaw] = useState<TvCosturaData | null>(() => cacheCostura);
  const [hora, setHora] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let vivo = true;
    const puxar = async () => {
      try {
        const d = await api.tvCostura();
        if (vivo) { cacheCostura = d; setRaw(d); }
      } catch {
        /* ignora */
      }
    };
    puxar();
    const t = setInterval(puxar, 5000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const d = vazio(raw) ? DEMO : (raw as TvCosturaData);
  const demo = vazio(raw);
  const costs = d.costureiras.length ? d.costureiras : DEMO.costureiras;

  const dataExt = hora.toLocaleDateString("pt-BR", { weekday: "long" }).toUpperCase();
  const dataLin = hora.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase();

  const slices: Slice[] = [
    { label: "Em costura", value: d.status.emCostura, color: "#4ade80" },
    { label: "Aguardando", value: d.status.aguardando, color: "#fbbf24" },
    { label: "Em revisão", value: d.status.emRevisao, color: "#38bdf8" },
    { label: "Finalizados hoje", value: d.status.finalizadosHoje, color: "#94a3b8" },
  ];
  const totalStatus = slices.reduce((a, b) => a + b.value, 0);
  const tipos = d.tipos.length ? d.tipos : DEMO.tipos;
  const maxTipo = Math.max(1, ...tipos.map((t) => t.pedidos));
  const meta = 85;

  return (
    <div className="cst">
      <header className="cst-top">
        <div className="cst-brand">
          <img className="cst-logo-img" src="/logo-bigtricot.png" alt="Big Tricot" />
          <span className="cst-div" />
          <div className="cst-ic"><Ic n="seam" s={34} /></div>
          <div className="cst-setor">
            <h1>COSTURA</h1>
            <span>PRODUÇÃO EM TEMPO REAL</span>
          </div>
        </div>
        <div className="cst-kpis">
          <Kpi ic="users" label="COSTUREIRAS ATIVAS" v={`${d.topo.costureirasAtivas}`} sub={`de ${d.topo.costureirasTotal || DEMO.topo.costureirasTotal}`} />
          <Kpi ic="clip" label="PEDIDOS COM COSTUREIRAS" v={nf(d.topo.pedidosComCostureiras)} sub="pedidos" />
          <Kpi ic="spool" label="PEÇAS EM COSTURA" v={nf(d.topo.pecasEmCostura)} sub="peças" gold />
          <Kpi ic="check" label="FINALIZADOS HOJE" v={nf(d.topo.finalizadosHoje)} sub="peças" />
          <Kpi ic="box" label="ACUMULADO DO ANO" v={nf(d.topo.acumuladoAno)} sub="peças" />
        </div>
        <div className="cst-clock">
          <div className="t"><Ic n="clock" s={16} /> {hora.toLocaleTimeString("pt-BR")}</div>
          <div className="dd">{dataExt}</div>
          <div className="dd2">{dataLin}</div>
        </div>
      </header>

      {demo && <div className="cst-demo">dados de demonstração — começa a refletir a costura real assim que houver costureiras atribuídas aos pedidos</div>}

      <div className="cst-main">
        <section className="cst-left">
          <div className="cst-card" style={{ minHeight: 0 }}>
            <div className="cst-card-h sm"><span><Ic n="spool" s={18} /> PEÇAS POR COSTUREIRA</span></div>
            <BarsH data={costs.map((c, i) => ({ label: c.nome, value: c.qtdPecas, color: CORES[i % CORES.length] }))} unidade="pç" />
          </div>
          <div className="cst-stats">
            <Stat ic="machine" label="MÁQUINAS EM OPERAÇÃO" v={`${d.topo.maquinasOperacao || DEMO.topo.maquinasOperacao} de ${d.topo.maquinasTotal}`} sub="máquinas" />
            <Stat ic="user" label="COSTUREIRAS ATIVAS" v={`${d.topo.costureirasAtivas} de ${d.topo.costureirasTotal || DEMO.topo.costureirasTotal}`} sub="ativas" />
            <Stat ic="clip" label="PEDIDOS COM COSTUREIRAS" v={nf(d.topo.pedidosComCostureiras)} sub="pedidos" />
            <Stat ic="spool" label="PEÇAS EM COSTURA" v={nf(d.topo.pecasEmCostura)} sub="peças" />
          </div>
        </section>

        <section className="cst-right">
          <div className="cst-card cst-tela">
            <div className="cst-card-h"><span><Ic n="users" s={22} /> TELA DAS COSTUREIRAS</span></div>
            <table>
              <thead>
                <tr><th>COSTUREIRA</th><th className="c">QTD. PEDIDOS</th><th className="c">QTD. PEÇAS</th><th>EM COSTURA AGORA</th><th>AGUARDANDO COM ELA</th><th>DATA DE ENTREGA</th></tr>
              </thead>
              <tbody>
                {(d.costureiras.length ? d.costureiras : DEMO.costureiras).map((c, i) => (
                  <tr key={i}>
                    <td className="nm"><span className="cst-av"><Ic n="user" s={18} /></span> {c.nome}</td>
                    <td className="c"><span className="cst-qt">{c.qtdPedidos}</span></td>
                    <td className="c pec">{nf(c.qtdPecas)}</td>
                    <td>{c.emCostura ? <span className="badge verde">{c.emCostura}</span> : <span className="muted">—</span>}</td>
                    <td><div className="badges">{c.aguardando.map((a, j) => <span className="badge amb" key={j}>{a}</span>)}{c.aguardando.length === 0 && <span className="muted">—</span>}</div></td>
                    <td className="dt">{c.datas.map((x) => brDM(x)).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="cst-bottom">
        <div className="cst-card center">
          <div className="cst-card-h sm"><span>STATUS DA COSTURA</span></div>
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
          <div className="cst-card-h sm"><span>TIPOS DE PRODUTOS EM COSTURA</span></div>
          <div className="cst-tipos">
            {tipos.map((t) => (
              <div className="tp" key={t.nome}>
                <span className="tp-ic"><Ic n="spool" s={18} /></span>
                <span className="tp-nm">{t.nome}</span>
                <div className="tp-bar"><span style={{ width: `${(t.pedidos / maxTipo) * 100}%` }} /></div>
                <span className="tp-v">{t.pedidos} ped · {t.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="cst-card">
          <div className="cst-card-h sm"><span>ÚLTIMOS PEDIDOS FINALIZADOS</span></div>
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
        <div className="cst-tk-frase"><Ic n="star" s={18} /> Foco, dedicação e qualidade são o que nos move!</div>
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
