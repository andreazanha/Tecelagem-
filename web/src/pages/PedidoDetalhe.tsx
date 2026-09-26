import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, tipoLabel, PARTES, type Pedido, type PedidoItem } from "../api";
import { getUser, podeFuncao } from "../auth";

function parteLabel(v: string) {
  return PARTES.find((p) => p.value === v)?.label ?? v;
}

export function PedidoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [originais, setOriginais] = useState<{ nome: string; url: string }[]>([]);
  const [verItens, setVerItens] = useState(false); // lista de itens começa recolhida (botão "Visualizar")

  useEffect(() => {
    if (!id) return;
    api.obterPedido(id).then(setPedido).catch((e) => setErro(e.message));
    api.listarOriginais(id).then((r) => setOriginais(r.arquivos)).catch(() => {});
  }, [id]);

  if (erro) return <div className="card pad erro">Erro: {erro}</div>;
  if (!pedido) return <div className="card pad">Carregando…</div>;

  const itens = (pedido.itens as PedidoItem[]) || [];
  const totalPecas = itens.reduce((s, it) => s + (it.qtd || 0), 0);
  const totalValor = itens.reduce((s, it) => s + (it.qtd || 0) * (it.valor_unit || 0), 0);
  const brl = (v: number) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {pedido.codigo_pai && <span className="op-pill">OP {pedido.codigo_pai}</span>}
            Pedido {pedido.numero_erp || pedido.id.slice(0, 8)}
          </h1>
          <div className="breadcrumb">
            <Link to="/pedidos" className="link">
              Pedidos
            </Link>{" "}
            › Detalhe
          </div>
        </div>
        <div className="row-gap" style={{ alignItems: "center" }}>
          <a href={`/api/pedidos/${pedido.id}/pdf-cliente`} target="_blank" rel="noreferrer" className="btn btn-soft">
            💰 PDF do cliente
          </a>
          {podeFuncao(getUser(), "pedido.editar") && <Link to={`/pedidos/${pedido.id}/editar`} className="btn btn-soft">✏️ Editar pedido</Link>}
          {podeFuncao(getUser(), "pedido.excluir") && (
            <button
              className="btn btn-danger"
              onClick={async () => {
                const cod = pedido.codigo_pai ? `OP ${pedido.codigo_pai}` : pedido.numero_erp || pedido.id.slice(0, 8);
                if (!confirm(`Excluir o pedido ${cod} de ${pedido.cliente_nome}?\n\nIsso remove o pedido e seus cards da produção. Não dá para desfazer.`)) return;
                try {
                  await api.excluirPedido(pedido.id);
                  navigate("/pedidos");
                } catch (e) {
                  alert("Não foi possível excluir: " + (e as Error).message);
                }
              }}
            >
              🗑 Excluir pedido
            </button>
          )}
          <span className={"status status-" + pedido.status}>{pedido.status}</span>
        </div>
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
          <Info label="🧶 Limite da Tecelagem" value={pedido.data_tecelagem || "—"} />
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
          <div className="row-gap" style={{ alignItems: "center" }}>
            <span className="muted">{totalPecas} peças no total</span>
            <button className="btn btn-soft" onClick={() => setVerItens((v) => !v)}>
              {verItens ? "▲ Recolher" : "👁 Visualizar pedido"}
            </button>
          </div>
        </div>
        {verItens && (
          <table className="table">
            <thead>
              <tr>
                <th>Modelo / Produto</th>
                <th>Ref (grade)</th>
                <th>Cor</th>
                <th>Tamanho</th>
                <th className="num">Qtd</th>
                <th className="num">Valor unit.</th>
                <th className="num">Total</th>
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
                  <td className="num">{it.valor_unit ? brl(it.valor_unit) : "—"}</td>
                  <td className="num strong">{it.valor_unit ? brl((it.qtd || 0) * (it.valor_unit || 0)) : "—"}</td>
                  <td>
                    <span className="chip">{parteLabel(it.parte)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="strong">Total</td>
                <td className="num strong">{totalPecas} pç</td>
                <td></td>
                <td className="num strong">{brl(totalValor)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <GerarPdfs id={pedido.id} entregaPe={pedido.entrega_pe || "junto"} />
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
  const [temTassel, setTemTassel] = useState<boolean | null>(null); // null = ainda verificando

  useEffect(() => {
    // Só mostra o romaneio de tassel se o pedido REALMENTE tiver tassel em algum produto.
    api
      .obterRomaneio(id)
      .then((d) => setTemTassel(!!(d.tassel && (d.tassel.linhas?.length || 0) > 0)))
      .catch(() => setTemTassel(false));
    api
      .listarPrestadores()
      .then((ps) => setPrestadores(ps.map((p) => p.nome)))
      .catch(() => {});
  }, [id]);

  if (!temTassel) return null; // sem tassel (ou ainda carregando) → esconde o card inteiro

  async function gerar() {
    setErro(null);
    setCarregando(true);
    try {
      const r = await api.gerarRomaneioTassel(id, { prestador });
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

function GerarPdfs({ id, entregaPe }: { id: string; entregaPe: string }) {
  const sep = entregaPe === "separado";
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arquivos, setArquivos] = useState<{ tipo: string; label: string; url: string }[]>([]);
  const [temKit, setTemKit] = useState<boolean>(false);
  const [kitsPeds, setKitsPeds] = useState<{ numero: string; pecas: number }[]>([]);
  const [entregas, setEntregas] = useState<Record<string, string>>({});
  const [kitGeral, setKitGeral] = useState<"junto" | "separado">(sep ? "separado" : "junto");

  // Carrega PDFs já gerados + detecta a Pronta Entrega JÁ na abertura (para escolher ANTES de concluir).
  useEffect(() => {
    api.listarPdfsGerados(id).then((r) => setArquivos(r.arquivos)).catch(() => {});
    api
      .classificarPedido(id)
      .then(async (cl) => {
        setTemKit(cl.temKit);
        if (cl.temKit) {
          const r = await api.kitsPedidos(id);
          setKitsPeds(r.pedidos);
          setEntregas(Object.fromEntries(r.pedidos.map((p) => [p.numero, sep ? "separado" : "junto"])));
        }
      })
      .catch(() => {});
  }, [id, sep]);

  const umKit = kitsPeds.length <= 1;

  async function concluir() {
    setCarregando(true);
    setErro(null);
    try {
      const opts = temKit ? (umKit ? { kit: kitGeral } : { entregas }) : undefined;
      const res = await api.gerarPdfs(id, opts);
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
        <h2>Concluir pedido (produção)</h2>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Primeiro <strong>configure a Pronta Entrega</strong> (se houver) e depois clique em{" "}
        <strong>Concluir</strong> — o sistema identifica kit, Parte 1 e Parte 2 e gera os PDFs no padrão
        Big Tricot.
      </p>

      {erro && <div className="aviso aviso-warn">⚠️ {erro}</div>}

      {/* PRONTA ENTREGA — sempre configurada ANTES de concluir */}
      {temKit ? (
        umKit ? (
          <div className="pe-box">
            <div className="pe-title">Este pedido tem KIT (Pronta Entrega). Como entregar?</div>
            <div className="segmented">
              <button className={"seg" + (kitGeral !== "separado" ? " seg-on" : "")} onClick={() => setKitGeral("junto")}>
                📦 Entregar JUNTO com o pedido
              </button>
              <button className={"seg" + (kitGeral === "separado" ? " seg-on" : "")} onClick={() => setKitGeral("separado")}>
                ⏩ Entregar SEPARADO (antecipado)
              </button>
            </div>
          </div>
        ) : (
          <div className="pe-box">
            <div className="pe-title">
              Pronta Entrega nesta explosão — <strong>{kitsPeds.length} pedido(s)</strong> têm kit. Escolha
              por pedido como entregar:
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
          </div>
        )
      ) : (
        <div className="muted" style={{ marginBottom: 12 }}>
          Este pedido <strong>não tem Pronta Entrega</strong> (kit) — nada a configurar.
        </div>
      )}

      {/* CONCLUIR / resultado */}
      {arquivos.length === 0 ? (
        <button className="btn btn-primary" onClick={concluir} disabled={carregando}>
          {carregando ? "Concluindo…" : "✓ Concluir e gerar PDFs"}
        </button>
      ) : (
        <div className="pdf-list">
          {arquivos.map((a) => (
            <a key={a.tipo} className="pdf-link" href={a.url} target="_blank" rel="noreferrer">
              👁 Visualizar {a.label}
            </a>
          ))}
          <button className="btn btn-soft" onClick={() => setArquivos([])}>
            ↻ Refazer
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
