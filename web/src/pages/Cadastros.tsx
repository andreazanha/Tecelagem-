import { useEffect, useState } from "react";
import { api, type Modelo, type Cor } from "../api";

export function Cadastros() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cadastros</h1>
          <div className="breadcrumb">Configuração › Modelos &amp; Cores</div>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        <strong>Parte 1</strong> = modelos que tecem na <strong>Máquina 3</strong>. O restante vira{" "}
        <strong>Parte 2</strong> (Máquina 7) e os <strong>kits</strong> saem em Pronta Entrega. Se um
        pedido não tiver nenhum modelo da Parte 1, ele vira <strong>Parte Única</strong>. Defina
        também quais cores são <strong>100% Poliéster</strong> (as demais ficam sem composição).
      </p>
      <div className="grid-2">
        <Modelos />
        <Cores />
      </div>
    </>
  );
}

function Modelos() {
  const [itens, setItens] = useState<Modelo[]>([]);
  const [nome, setNome] = useState("");
  const [ref, setRef] = useState("");

  function recarregar() {
    api.listarModelos().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);

  async function adicionar() {
    if (!nome.trim()) return;
    await api.salvarModelo({ nome: nome.trim(), parte: 1, ref: ref.trim() || null });
    setNome("");
    setRef("");
    recarregar();
  }
  async function alternarParte(m: Modelo) {
    await api.salvarModelo({ ...m, parte: m.parte === 1 ? 2 : 1 });
    recarregar();
  }
  async function remover(m: Modelo) {
    await api.excluirModelo(m.nome);
    recarregar();
  }

  const parte1 = itens.filter((m) => m.parte === 1);

  return (
    <div className="card">
      <div className="card-head">
        <h2>Modelos — Parte 1</h2>
        <span className="muted">{parte1.length} na Parte 1</span>
      </div>
      <div className="pad" style={{ paddingTop: 0 }}>
        <div className="inline-form">
          <input
            placeholder="Nome do modelo (ex.: Daytona)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionar()}
          />
          <input
            className="w-sm"
            placeholder="Ref (opcional)"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
          <button className="btn btn-primary" onClick={adicionar}>
            ＋ Parte 1
          </button>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Modelo</th>
            <th>Ref</th>
            <th>Parte</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {itens.map((m) => (
            <tr key={m.nome}>
              <td className="strong">{m.nome}</td>
              <td>{m.ref || "—"}</td>
              <td>
                <button
                  className={"toggle " + (m.parte === 1 ? "t-on" : "t-off")}
                  onClick={() => alternarParte(m)}
                  title="Alternar Parte"
                >
                  Parte {m.parte}
                </button>
              </td>
              <td>
                <button className="icon-btn" onClick={() => remover(m)} title="Remover">
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {itens.length === 0 && (
            <tr>
              <td colSpan={4} className="empty pad">
                Nenhum modelo cadastrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Cores() {
  const [itens, setItens] = useState<Cor[]>([]);
  const [nome, setNome] = useState("");

  function recarregar() {
    api.listarCores().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);

  async function adicionar() {
    if (!nome.trim()) return;
    await api.salvarCor({ nome: nome.trim(), poliester: 1 });
    setNome("");
    recarregar();
  }
  async function alternar(c: Cor) {
    await api.salvarCor({ nome: c.nome, poliester: c.poliester ? 0 : 1 });
    recarregar();
  }
  async function remover(c: Cor) {
    await api.excluirCor(c.nome);
    recarregar();
  }

  const poli = itens.filter((c) => !!c.poliester).length;

  return (
    <div className="card">
      <div className="card-head">
        <h2>Cores — 100% Poliéster</h2>
        <span className="muted">{poli} marcadas</span>
      </div>
      <div className="pad" style={{ paddingTop: 0 }}>
        <div className="inline-form">
          <input
            placeholder="Nome da cor (ex.: Romenia)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionar()}
          />
          <button className="btn btn-primary" onClick={adicionar}>
            ＋ 100% Poliéster
          </button>
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Cor</th>
            <th>Composição</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {itens.map((c) => (
            <tr key={c.nome}>
              <td className="strong">{c.nome}</td>
              <td>
                <button
                  className={"toggle " + (c.poliester ? "t-on" : "t-off")}
                  onClick={() => alternar(c)}
                >
                  {c.poliester ? "100% Poliéster" : "Sem composição"}
                </button>
              </td>
              <td>
                <button className="icon-btn" onClick={() => remover(c)} title="Remover">
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {itens.length === 0 && (
            <tr>
              <td colSpan={3} className="empty pad">
                Nenhuma cor cadastrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
