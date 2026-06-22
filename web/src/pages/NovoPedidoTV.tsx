import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import "../novo-pedido.css";

// Dados mínimos para a arte (serve tanto para Pedido quanto para ultimoPedido do dashboard).
export interface NovoPedidoInfo {
  numero: string | null;
  cliente: string;
  pecas: number;
  data_entrega: string | null;
  created_at: string;
}

function brData(s?: string | null) {
  if (!s) return "—";
  const d = (s.length >= 10 ? s.slice(0, 10) : s).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s;
}
function horaDe(s?: string | null) {
  if (!s) return "—";
  try {
    return new Date(s.replace(" ", "T") + (s.includes("Z") ? "" : "Z")).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "—";
  }
}

// Arte da celebração "NOVO PEDIDO!" — usada no painel dedicado e no pop-up do Painel.
export function NovoPedidoArte({ info }: { info: NovoPedidoInfo | null }) {
  const stats = useMemo(
    () => [
      { ic: "📋", l: "PEDIDO", v: info ? "#" + (info.numero || "—") : "—" },
      { ic: "🏢", l: "CLIENTE", v: info?.cliente || "—" },
      { ic: "🧶", l: "PEÇAS", v: info ? String(info.pecas ?? 0) : "—" },
      { ic: "📅", l: "ENTREGA", v: brData(info?.data_entrega) },
      { ic: "🕐", l: "HORÁRIO", v: horaDe(info?.created_at) },
    ],
    [info]
  );

  // O título 3D + boneco + subtítulo + confete vêm da arte (imagem de fundo).
  // Aqui desenhamos só a faixa de dados reais + botão por cima.
  return (
    <div className="np-bg">
      <div className="np-band">
        <div className="np-stats">
          {stats.map((s) => (
            <div className="np-stat" key={s.l}>
              <div className="np-stat-ic">{s.ic}</div>
              <div className="np-stat-l">{s.l}</div>
              <div className="np-stat-v">{s.v}</div>
            </div>
          ))}
        </div>
        <div className="np-cta">VAMOS LÁ!</div>
      </div>
    </div>
  );
}

// Painel dedicado (/tv/novo-pedido): mostra sempre o pedido mais recente.
export function NovoPedidoTV() {
  const [info, setInfo] = useState<NovoPedidoInfo | null>(null);
  useEffect(() => {
    const carregar = () =>
      api
        .listarPedidos()
        .then((l) => {
          const p = l[0];
          if (p)
            setInfo({
              numero: p.codigo_pai || p.numero_erp || null,
              cliente: p.cliente_nome,
              pecas: p.pecas ?? 0,
              data_entrega: p.data_entrega ?? null,
              created_at: p.created_at,
            });
        })
        .catch(() => {});
    carregar();
    const t = setInterval(carregar, 12000);
    return () => clearInterval(t);
  }, []);
  return <NovoPedidoArte info={info} />;
}
