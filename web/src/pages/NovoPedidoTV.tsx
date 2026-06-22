import { useEffect, useMemo, useState } from "react";
import { api, type Pedido } from "../api";
import "../novo-pedido.css";

// Tela de celebração "NOVO PEDIDO!" — painel de TV que mostra o pedido mais
// recente com o boneco da BiG. Atualiza sozinho quando entra um novo.
function brData(s?: string | null) {
  if (!s) return "—";
  const d = (s.length >= 10 ? s.slice(0, 10) : s).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s;
}
function horaDe(s?: string | null) {
  if (!s) return "—";
  try {
    return new Date(s.replace(" ", "T") + "Z").toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "—";
  }
}

const CONFETE = Array.from({ length: 70 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: (i % 10) * 0.4,
  dur: 3 + (i % 5),
  cor: ["#fde047", "#60a5fa", "#f472b6", "#34d399", "#fb923c", "#a78bfa"][i % 6],
  size: 6 + (i % 4) * 2,
}));

export function NovoPedidoTV() {
  const [pedido, setPedido] = useState<Pedido | null>(null);

  useEffect(() => {
    const carregar = () =>
      api.listarPedidos().then((l) => l[0] && setPedido(l[0])).catch(() => {});
    carregar();
    const t = setInterval(carregar, 12000);
    return () => clearInterval(t);
  }, []);

  const stats = useMemo(
    () => [
      { ic: "📋", l: "PEDIDO", v: pedido ? "#" + (pedido.codigo_pai || pedido.numero_erp || "—") : "—" },
      { ic: "🏢", l: "CLIENTE", v: pedido?.cliente_nome || "—" },
      { ic: "🧶", l: "PEÇAS", v: pedido ? String(pedido.pecas ?? 0) : "—" },
      { ic: "📅", l: "ENTREGA", v: brData(pedido?.data_entrega) },
      { ic: "🕐", l: "HORÁRIO", v: horaDe(pedido?.created_at) },
    ],
    [pedido]
  );

  return (
    <div className="np-bg">
      <div className="np-confete">
        {CONFETE.map((c, i) => (
          <span
            key={i}
            style={{
              left: c.left + "%",
              animationDelay: c.delay + "s",
              animationDuration: c.dur + "s",
              background: c.cor,
              width: c.size,
              height: c.size * 1.6,
            }}
          />
        ))}
      </div>

      <img className="np-boneco" src="/boneco-big.png" alt="" />

      <div className="np-centro">
        <div className="np-sino">🔔</div>
        <h1 className="np-titulo">NOVO<br />PEDIDO!</h1>
        <div className="np-sub">UM NOVO DESAFIO CHEGOU 💪 VAMOS FAZER ACONTECER!</div>

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
