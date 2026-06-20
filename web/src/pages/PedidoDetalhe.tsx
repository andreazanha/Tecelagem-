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
  const [originais, setOriginais] = useState<{ nome: string; url: string }[]>([]);

  useEffect(() => {
    if (!id) return;
    api.obterPedido(id).then(setPedido).catch((e) => setErro(e.message));
    api.listarOriginais(id).then((r) => setOriginais(r.arquivos)).catch(() => {});
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
        </div>
        {pedido.observacao && (
          <div style={{ marginTop: 14, color: "#c0392b", fontWeight: 700 }}>
            ⚠️ {pedido.observacao}
          </div>
        )}
        {originais.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="info-label" style={{ marginBottom: 6 }}>
              PDFs originais ({originais.length})
            </div>
            <div className="pdf-list" style={{ marginTop: 0 }}>
              {originais.map((o) => (
                <a key={o.nome} className="btn btn-soft" href={o.url} target="_blank" rel="noreferrer">
                  📄 {o.nome}
                </a>
              ))}
            </div>
          </div>
        )}
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
      <RomaneioTassel id={pedido.id} />
    </>
  );
}

function RomaneioTassel({ id }: { id: string }) {
  const [prestador, setPrestador] = useState("");
  const [prestadores, setPrestadores] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<{ url: string; totalTasseis: number; totalValor: number } | null>(null);

  useEffect(() => {
    api
      .listarPrestadores()
      .then((ps) => setPrestadores(ps.map((p) => p.nome)))
      .catch(() => {});
  }, []);

  async function gerar() {
    setErro(null);
    setCarregando(true);
    try {
      const r = await api.gerarRomaneioTassel(id, prestador);
      setRes(r);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }
  const brl = (v: number) => "R$ " + (v || 0).toFixed(2).replace(".", ",");

  return (
    <div className="card pad">
      <div className="card-head" style={{ padding: 0, marginBottom: 12 }}>
        <h2>Romaneio de Tassel</h2>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Pré-pronto: peseira → tassel <strong>G</strong>, almofada → tassel <strong>P</strong> (qtd por
        peça vem do modelo). Escolha o <strong>prestador</strong> e gere — o valor da mão de obra é
        somado automaticamente. Gerencie tasseis e prestadores em{" "}
        <Link to="/romaneios" className="link">
          Romaneios
        </Link>
        .
      </p>
      <div className="inline-form" style={{ maxWidth: 520 }}>
        <input
          list="prestadores-tassel"
          placeholder="Prestador de serviço (quem vai fazer)"
          value={prestador}
          onChange={(e) => setPrestador(e.target.value)}
        />
        <datalist id="prestadores-tassel">
          {prestadores.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <button className="btn btn-primary" onClick={gerar} disabled={carregando}>
          {carregando ? "Gerando…" : "🧶 Gerar romaneio"}
        </button>
      </div>

      {erro && <div className="aviso aviso-warn" style={{ marginTop: 12 }}>⚠️ {erro}</div>}

      {res && (
        <div className="pdf-list" style={{ marginTop: 14 }}>
          <a className="pdf-link" href={res.url} target="_blank" rel="noreferrer">
            👁 Visualizar romaneio
          </a>
          <span className="chip">{res.totalTasseis} tasseis</span>
          <span className="chip chip-soft">Mão de obra: {brl(res.totalValor)}</span>
        </div>
      )}
    </div>
  );
}

function GerarPdfs({ id }: { id: string }) {
  const [perguntaKit, setPerguntaKit] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arquivos, setArquivos] = useState<{ tipo: string; label: string; url: string }[]>([]);
  const [kitsPeds, setKitsPeds] = useState<{ numero: string; pecas: number }[]>([]);
  const [entregas, setEntregas] = useState<Record<string, string>>({});

  // carrega os PDFs já gerados (persistente, mesmo após recarregar a página)
  useEffect(() => {
    api
      .listarPdfsGerados(id)
      .then((r) => setArquivos(r.arquivos))
      .catch(() => {});
  }, [id]);

  async function iniciar() {
    setErro(null);
    setCarregando(true);
    try {
      const cl = await api.classificarPedido(id);
      if (cl.temKit) {
        const r = await api.kitsPedidos(id);
        setKitsPeds(r.pedidos);
        // padrão: todos JUNTO
        setEntregas(Object.fromEntries(r.pedidos.map((p) => [p.numero, "junto"])));
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

  async function gerar(opts?: { kit?: "junto" | "separado"; entregas?: Record<string, string> }) {
    setPerguntaKit(false);
    setCarregando(true);
    setErro(null);
    try {
      const res = await api.gerarPdfs(id, opts);
      setArquivos(res.arquivos);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  const umKit = kitsPeds.length <= 1;

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

      {perguntaKit && umKit && (
        <div className="pe-box">
          <div className="pe-title">Este pedido tem KIT (Pronta Entrega). Como entregar?</div>
          <div className="segmented">
            <button className="seg seg-on" onClick={() => gerar({ kit: "junto" })}>
              📦 Entregar JUNTO com o pedido
            </button>
            <button className="seg" onClick={() => gerar({ kit: "separado" })}>
              ⏩ Entregar SEPARADO (antecipado)
            </button>
          </div>
        </div>
      )}

      {perguntaKit && !umKit && (
        <div className="pe-box">
          <div className="pe-title">
            Esta OP junta vários pedidos com KIT. Escolha por pedido como entregar a Pronta Entrega:
          </div>
          <table className="table" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th>Pedido</th>
                <th className="num">Peças (kit)</th>
                <th>Entrega</th>
              </tr>
            </thead>
            <tbody>
              {kitsPeds.map((p) => (
                <tr key={p.numero}>
                  <td className="strong">{p.numero}</td>
                  <td className="num">{p.pecas}</td>
                  <td>
                    <div className="segmented">
                      <button
                        className={"seg" + (entregas[p.numero] !== "separado" ? " seg-on" : "")}
                        onClick={() => setEntregas((e) => ({ ...e, [p.numero]: "junto" }))}
                      >
                        📦 Junto
                      </button>
                      <button
                        className={"seg" + (entregas[p.numero] === "separado" ? " seg-on" : "")}
                        onClick={() => setEntregas((e) => ({ ...e, [p.numero]: "separado" }))}
                      >
                        ⏩ Separado
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 10 }}>
            <button className="btn btn-primary" onClick={() => gerar({ entregas })} disabled={carregando}>
              {carregando ? "Gerando…" : "🧾 Gerar PDFs"}
            </button>
          </div>
        </div>
      )}

      {arquivos.length > 0 && (
        <div className="pdf-list">
          {arquivos.map((a) => (
            <a key={a.tipo} className="pdf-link" href={a.url} target="_blank" rel="noreferrer">
              👁 Visualizar {a.label}
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
