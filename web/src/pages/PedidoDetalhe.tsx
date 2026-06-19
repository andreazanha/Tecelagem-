import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, tipoLabel, PARTES, type Pedido, type PedidoItem } from "../api";

function parteLabel(v: string) {
  return PARTES.find((p) => p.value === v)?.label ?? v;
}

export function PedidoDetalhe() {
  const { id } = useParams();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.obterPedido(id).then(setPedido).catch((e) => setErro(e.message));
  }, [id]);

  if (erro) return <div className="card pad erro">Erro: {erro}</div>;
  if (!pedido) return <div className="card pad">Carregando…</div>;

  const itens = (pedido.itens as PedidoItem[]) || [];
  const totalPecas = itens.reduce((s, it) => s + (it.qtd || 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pedido {pedido.numero_erp || pedido.id.slice(0, 8)}</h1>
          <div className="breadcrumb">
            <Link to="/pedidos" className="link">
              Pedidos
            </Link>{" "}
            › Detalhe
          </div>
        </div>
        <span className={"status status-" + pedido.status}>{pedido.status}</span>
      </div>

      <div className="card pad">
        <div className="info-grid">
          <Info label="Cliente" value={pedido.cliente_nome} />
          <Info label="Vendedor" value={pedido.vendedor || "—"} />
          <Info label="Tipo" value={tipoLabel(pedido.tipo)} />
          {pedido.entrega_pe && (
            <Info
              label="Pronta Entrega"
              value={pedido.entrega_pe === "junto" ? "Entregar junto" : "Entregar separado"}
            />
          )}
          <Info label="Data do pedido" value={pedido.data_pedido || "—"} />
          <Info label="Data de entrega" value={pedido.data_entrega || "—"} />
          {pedido.pdf_key && (
            <Info
              label="PDF original"
              value={
                <a className="link" href={`/api/pedidos/${pedido.id}/pdf`} target="_blank">
                  📄 abrir
                </a>
              }
            />
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Itens ({itens.length})</h2>
          <span className="muted">{totalPecas} peças no total</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Ref</th>
              <th>Cor / Grade</th>
              <th className="num">Qtd</th>
              <th>Parte</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => (
              <tr key={it.id}>
                <td className="strong">{it.produto}</td>
                <td>{it.ref || "—"}</td>
                <td>{it.cor_grade || "—"}</td>
                <td className="num">{it.qtd}</td>
                <td>
                  <span className="chip">{parteLabel(it.parte)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info">
      <div className="info-label">{label}</div>
      <div className="info-value">{value}</div>
    </div>
  );
}
