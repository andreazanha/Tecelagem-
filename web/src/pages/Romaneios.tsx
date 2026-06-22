import { useEffect, useState } from "react";
import { api, type Tassel, type Prestador, type Costura } from "../api";

const brl = (v: number) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");

export function Romaneios() {
  const [aba, setAba] = useState<"tasseis" | "costura" | "prestadores" | "relatorios">("tasseis");
  const abas: { id: typeof aba; label: string }[] = [
    { id: "tasseis", label: "🧶 Tasseis" },
    { id: "costura", label: "🪡 Costura" },
    { id: "prestadores", label: "👷 Prestadores" },
    { id: "relatorios", label: "📊 Relatórios" },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Romaneios</h1>
          <div className="breadcrumb">Prestadores de serviço › {abas.find((a) => a.id === aba)?.label}</div>
        </div>
        <div className="segmented">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              className={"seg" + (aba === a.id ? " seg-on" : "")}
              onClick={() => setAba(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {aba === "tasseis" && <TasseisCadastro />}
      {aba === "costura" && <CosturaCadastro />}
      {aba === "prestadores" && <PrestadoresCadastro />}
      {aba === "relatorios" && (
        <div className="card pad">
          <p className="muted">
            Relatórios por prestador (total a pagar, romaneios emitidos, por período) entram numa
            próxima etapa. Me diga quais números você quer ver aqui.
          </p>
        </div>
      )}
    </>
  );
}

// ── Tasseis (cor + tamanho + valor da mão de obra) ───────────────────────────
function TasseisCadastro() {
  const [itens, setItens] = useState<Tassel[]>([]);
  const [novo, setNovo] = useState<Tassel>({ cor: "", tamanho: "G", valor: 0 });
  function recarregar() {
    api.listarTasseis().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);
  async function salvar(t: Tassel) {
    try {
      await api.salvarTassel(t);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function adicionar() {
    if (!novo.cor.trim()) return;
    await salvar(novo);
    setNovo({ cor: "", tamanho: "G", valor: 0 });
  }
  async function remover(t: Tassel) {
    await api.excluirTassel(t.cor, t.tamanho);
    recarregar();
  }
  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 16 }}>
        Tassel por <strong>cor</strong> e <strong>tamanho</strong> (G = peseira, P = almofada) e o{" "}
        <strong>valor da mão de obra</strong> por tassel. O romaneio soma tudo automaticamente.
      </p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Cor</th>
              <th>Tamanho</th>
              <th className="num">Valor (mão de obra)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-novo">
              <td>
                <input
                  placeholder="Cor (ex.: AREIA)"
                  value={novo.cor}
                  onChange={(e) => setNovo({ ...novo, cor: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
              </td>
              <td>
                <select value={novo.tamanho} onChange={(e) => setNovo({ ...novo, tamanho: e.target.value })}>
                  <option value="G">G (peseira)</option>
                  <option value="P">P (almofada)</option>
                </select>
              </td>
              <td className="num">
                <input
                  className="w-sm num"
                  type="number"
                  min={0}
                  step="0.01"
                  value={novo.valor}
                  onChange={(e) => setNovo({ ...novo, valor: Number(e.target.value) })}
                />
              </td>
              <td>
                <button className="btn btn-primary" onClick={adicionar}>
                  ＋
                </button>
              </td>
            </tr>
            {itens.map((t) => (
              <tr key={t.cor + "|" + t.tamanho}>
                <td className="strong">{t.cor}</td>
                <td>{t.tamanho}</td>
                <td className="num">
                  <input
                    className="w-sm num"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={t.valor}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== t.valor) salvar({ ...t, valor: v });
                    }}
                  />
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {brl(t.valor)}
                  </span>
                </td>
                <td>
                  <button className="icon-btn" title="Remover" onClick={() => remover(t)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={4} className="empty pad">
                  Nenhum tassel cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Costura (serviço + valor) ────────────────────────────────────────────────
function CosturaCadastro() {
  const [itens, setItens] = useState<Costura[]>([]);
  const [novo, setNovo] = useState<Costura>({ nome: "", valor: 0 });
  function recarregar() {
    api.listarCostura().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);
  async function salvar(c: Costura) {
    try {
      await api.salvarCostura(c);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function adicionar() {
    if (!novo.nome.trim()) return;
    await salvar(novo);
    setNovo({ nome: "", valor: 0 });
  }
  async function remover(c: Costura) {
    await api.excluirCostura(c.nome);
    recarregar();
  }
  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 16 }}>
        Serviços de <strong>costura</strong> e o valor da mão de obra. Usados nos romaneios de costura.
      </p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Serviço de costura</th>
              <th className="num">Valor (mão de obra)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-novo">
              <td>
                <input
                  placeholder="Ex.: Fechar almofada"
                  value={novo.nome}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
              </td>
              <td className="num">
                <input
                  className="w-sm num"
                  type="number"
                  min={0}
                  step="0.01"
                  value={novo.valor}
                  onChange={(e) => setNovo({ ...novo, valor: Number(e.target.value) })}
                />
              </td>
              <td>
                <button className="btn btn-primary" onClick={adicionar}>
                  ＋
                </button>
              </td>
            </tr>
            {itens.map((c) => (
              <tr key={c.nome}>
                <td className="strong">{c.nome}</td>
                <td className="num">
                  <input
                    className="w-sm num"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={c.valor}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== c.valor) salvar({ ...c, valor: v });
                    }}
                  />
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {brl(c.valor)}
                  </span>
                </td>
                <td>
                  <button className="icon-btn" title="Remover" onClick={() => remover(c)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={3} className="empty pad">
                  Nenhum serviço de costura cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Prestadores de serviço ───────────────────────────────────────────────────
function PrestadoresCadastro() {
  const [itens, setItens] = useState<Prestador[]>([]);
  const [novo, setNovo] = useState<Prestador>({ nome: "", telefone: "", servico: "tassel", obs: "" });
  function recarregar() {
    api.listarPrestadores().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);
  async function salvar(p: Prestador) {
    try {
      await api.salvarPrestador(p);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function adicionar() {
    if (!novo.nome.trim()) return;
    await salvar(novo);
    setNovo({ nome: "", telefone: "", servico: "tassel", obs: "" });
  }
  async function remover(p: Prestador) {
    await api.excluirPrestador(p.nome);
    recarregar();
  }
  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 16 }}>
        Quem faz o serviço (tassel, costura…). Aparecem para escolha ao gerar o romaneio.
      </p>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Serviço</th>
              <th>Observação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className="row-novo">
              <td>
                <input
                  placeholder="Nome do prestador"
                  value={novo.nome}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
              </td>
              <td>
                <input
                  placeholder="(00) 00000-0000"
                  value={novo.telefone ?? ""}
                  onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
                />
              </td>
              <td>
                <select value={novo.servico ?? ""} onChange={(e) => setNovo({ ...novo, servico: e.target.value })}>
                  <option value="tassel">Tassel</option>
                  <option value="costura">Costura</option>
                  <option value="outro">Outro</option>
                </select>
              </td>
              <td>
                <input
                  placeholder="Observação"
                  value={novo.obs ?? ""}
                  onChange={(e) => setNovo({ ...novo, obs: e.target.value })}
                />
              </td>
              <td>
                <button className="btn btn-primary" onClick={adicionar}>
                  ＋
                </button>
              </td>
            </tr>
            {itens.map((p) => (
              <tr key={p.nome}>
                <td className="strong">{p.nome}</td>
                <td>{p.telefone || "—"}</td>
                <td>
                  <span className="chip">{p.servico || "—"}</span>
                </td>
                <td>{p.obs || "—"}</td>
                <td>
                  <button className="icon-btn" title="Remover" onClick={() => remover(p)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={5} className="empty pad">
                  Nenhum prestador cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
