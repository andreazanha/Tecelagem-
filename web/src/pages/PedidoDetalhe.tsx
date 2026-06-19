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
              <th>Modelo / Produto</th>
              <th>Ref (grade)</th>
              <th>Cor</th>
              <th>Tamanho</th>
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
                <td>{it.tamanho || "—"}</td>
                <td className="num">{it.qtd}</td>
                <td>
                  <span className="chip">{parteLabel(it.parte)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <GerarPdfs id={pedido.id} />
    </>
  );
}

function GerarPdfs({ id }: { id: string }) {
  const [perguntaKit, setPerguntaKit] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arquivos, setArquivos] = useState<{ tipo: string; label: string; url: string }[]>([]);

  async function iniciar() {
    setErro(null);
    setCarregando(true);
    try {
      const cl = await api.classificarPedido(id);
      if (cl.temKit) {
        setPerguntaKit(true);
        setCarregando(false);
      } else {
        await gerar();
      }
    } catch (e) {
      setErro((e as Error).message);
      setCarregando(false);
    }
  }

  async function gerar(kit?: "junto" | "separado") {
    setPerguntaKit(false);
    setCarregando(true);
    setErro(null);
    try {
      const res = await api.gerarPdfs(id, kit);
      setArquivos(res.arquivos);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="card pad">
      <div className="card-head" style={{ padding: 0, marginBottom: 12 }}>
        <h2>Gerar PDFs de produção</h2>
        {arquivos.length === 0 && (
          <button className="btn btn-primary" onClick={iniciar} disabled={carregando}>
            {carregando ? "Gerando…" : "🧾 Gerar PDFs"}
          </button>
        )}
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        O sistema identifica <strong>kit</strong>, <strong>Parte 1</strong> e <strong>Parte 2</strong>{" "}
        automaticamente (sem modelos da Parte 1 → Parte Única) e gera os PDFs no padrão Big Tricot.
      </p>

      {erro && <div className="aviso aviso-warn">⚠️ {erro}</div>}

      {perguntaKit && (
        <div className="pe-box">
          <div className="pe-title">Este pedido tem KIT (Pronta Entrega). Como entregar?</div>
          <div className="segmented">
            <button className="seg seg-on" onClick={() => gerar("junto")}>
              📦 Entregar JUNTO com o pedido
            </button>
            <button className="seg" onClick={() => gerar("separado")}>
              ⏩ Entregar SEPARADO (antecipado)
            </button>
          </div>
        </div>
      )}

      {arquivos.length > 0 && (
        <div className="pdf-list">
          {arquivos.map((a) => (
            <a key={a.tipo} className="pdf-link" href={a.url} target="_blank" rel="noreferrer">
              📄 {a.label}
            </a>
          ))}
          <button className="btn btn-soft" onClick={() => setArquivos([])}>
            ↻ Gerar novamente
          </button>
        </div>
      )}
    </div>
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
