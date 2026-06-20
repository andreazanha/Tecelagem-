import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, tipoLabel, type Pedido } from "../api";

export function Pedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api
      .listarPedidos()
      .then(setPedidos)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pedidos</h1>
          <div className="breadcrumb">Cadastro › Pedidos</div>
        </div>
        <Link to="/pedidos/novo" className="btn btn-primary">
          ＋ Novo Pedido
        </Link>
      </div>

      {carregando && <div className="card pad">Carregando…</div>}
      {erro && <div className="card pad erro">Erro: {erro}</div>}

      {!carregando && !erro && (
        <div className="card">
          {pedidos.length === 0 ? (
            <div className="pad empty">
              Nenhum pedido ainda. Clique em <strong>Novo Pedido</strong> para começar.
            </div>
          ) : (
            <table className="table cards">
              <thead>
                <tr>
                  <th>Nº ERP</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th className="num">Itens</th>
                  <th className="num">Peças</th>
                  <th>Entrega</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Nº ERP">
                      <Link to={`/pedidos/${p.id}`} className="link">
                        {p.numero_erp || "—"}
                      </Link>
                    </td>
                    <td className="strong" data-label="Cliente">
                      {p.cliente_nome}
                    </td>
                    <td data-label="Tipo">
                      <span className="chip">{tipoLabel(p.tipo)}</span>
                      {p.entrega_pe && (
                        <span className="chip chip-soft">
                          PE {p.entrega_pe === "junto" ? "junto" : "separado"}
                        </span>
                      )}
                    </td>
                    <td className="num" data-label="Itens">
                      {p.itens as number}
                    </td>
                    <td className="num" data-label="Peças">
                      {p.pecas ?? 0}
                    </td>
                    <td data-label="Entrega">{p.data_entrega || "—"}</td>
                    <td data-label="Status">
                      <span className={"status status-" + p.status}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
