import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, tipoLabel, type Pedido } from "../api";

export function Pedidos() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    api
      .listarPedidos()
      .then(setPedidos)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  const q = busca.trim().toLowerCase();
  const lista = q
    ? pedidos.filter(
        (p) =>
          (p.numero_erp || "").toLowerCase().includes(q) ||
          (p.cliente_nome || "").toLowerCase().includes(q) ||
          (p.codigo_terceiro || "").toLowerCase().includes(q)
      )
    : pedidos;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pedidos</h1>
          <div className="breadcrumb">Cadastro › Pedidos</div>
        </div>
        <div className="row-gap">
          <input
            className="busca-ped"
            placeholder="🔎 Nº do pedido, código de terceiro ou cliente…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Link to="/pedidos/novo" className="btn btn-primary">
            ＋ Novo Pedido
          </Link>
        </div>
      </div>

      {carregando && <div className="card pad">Carregando…</div>}
      {erro && <div className="card pad erro">Erro: {erro}</div>}

      {!carregando && !erro && (
        <div className="card">
          {lista.length === 0 ? (
            <div className="pad empty">
              {pedidos.length === 0 ? (
                <>Nenhum pedido ainda. Clique em <strong>Novo Pedido</strong> para começar.</>
              ) : (
                <>Nenhum pedido encontrado para “{busca}”.</>
              )}
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
                {lista.map((p) => (
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
