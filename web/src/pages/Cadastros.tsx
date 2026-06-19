import { useEffect, useState } from "react";
import { api, COMPOSICOES, type Modelo } from "../api";

export function Cadastros() {
  const [itens, setItens] = useState<Modelo[]>([]);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState<Modelo>({ nome: "", parte: 2, ref: "", composicao: "", tassel: 0 });

  function recarregar() {
    api.listarModelos().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);

  async function salvar(m: Modelo) {
    await api.salvarModelo(m);
    recarregar();
  }
  async function adicionar() {
    if (!novo.nome.trim()) return;
    await salvar(novo);
    setNovo({ nome: "", parte: 2, ref: "", composicao: "", tassel: 0 });
  }
  async function remover(m: Modelo) {
    await api.excluirModelo(m.nome);
    recarregar();
  }

  const filtrados = itens.filter((m) => m.nome.toLowerCase().includes(busca.toLowerCase()));
  const p1 = itens.filter((m) => m.parte === 1).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cadastro de Modelos</h1>
          <div className="breadcrumb">Configuração › Modelos</div>
        </div>
        <input
          placeholder="🔎 Buscar modelo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ minWidth: 220 }}
        />
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Tabela completa de modelos. <strong>Parte 1</strong> = tece na Máquina 3 (o resto = Parte 2;
        kits = Pronta Entrega; sem Parte 1 → Parte Única). A <strong>composição</strong> é do modelo
        (a mesma cor pode ser acrílico num modelo e poliéster em outro). <strong>Tassel</strong> = qtd
        do acessório por peça. {itens.length} modelos · {p1} na Parte 1.
      </p>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Modelo</th>
              <th>Ref</th>
              <th>Parte</th>
              <th>Composição</th>
              <th className="num">Tassel/peça</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {/* linha de novo modelo */}
            <tr className="row-novo">
              <td>
                <input
                  placeholder="Nome do modelo"
                  value={novo.nome}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
              </td>
              <td>
                <input
                  className="w-sm"
                  placeholder="Ref"
                  value={novo.ref ?? ""}
                  onChange={(e) => setNovo({ ...novo, ref: e.target.value })}
                />
              </td>
              <td>
                <select
                  value={novo.parte}
                  onChange={(e) => setNovo({ ...novo, parte: Number(e.target.value) })}
                >
                  <option value={1}>Parte 1</option>
                  <option value={2}>Parte 2</option>
                </select>
              </td>
              <td>
                <select
                  value={novo.composicao ?? ""}
                  onChange={(e) => setNovo({ ...novo, composicao: e.target.value })}
                >
                  {COMPOSICOES.map((c) => (
                    <option key={c} value={c}>
                      {c || "Sem composição"}
                    </option>
                  ))}
                </select>
              </td>
              <td className="num">
                <input
                  className="w-xs num"
                  type="number"
                  min={0}
                  value={novo.tassel ?? 0}
                  onChange={(e) => setNovo({ ...novo, tassel: Number(e.target.value) })}
                />
              </td>
              <td>
                <button className="btn btn-primary" onClick={adicionar}>
                  ＋
                </button>
              </td>
            </tr>

            {filtrados.map((m) => (
              <ModeloRow key={m.nome} m={m} onSalvar={salvar} onRemover={remover} />
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={6} className="empty pad">
                  Nenhum modelo cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ModeloRow({
  m,
  onSalvar,
  onRemover,
}: {
  m: Modelo;
  onSalvar: (m: Modelo) => void;
  onRemover: (m: Modelo) => void;
}) {
  return (
    <tr>
      <td className="strong">{m.nome}</td>
      <td>{m.ref || "—"}</td>
      <td>
        <select
          value={m.parte}
          onChange={(e) => onSalvar({ ...m, parte: Number(e.target.value) })}
          className={m.parte === 1 ? "sel-p1" : ""}
        >
          <option value={1}>Parte 1</option>
          <option value={2}>Parte 2</option>
        </select>
      </td>
      <td>
        <select value={m.composicao ?? ""} onChange={(e) => onSalvar({ ...m, composicao: e.target.value })}>
          {COMPOSICOES.map((c) => (
            <option key={c} value={c}>
              {c || "Sem composição"}
            </option>
          ))}
        </select>
      </td>
      <td className="num">
        <input
          className="w-xs num"
          type="number"
          min={0}
          defaultValue={m.tassel ?? 0}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v !== (m.tassel ?? 0)) onSalvar({ ...m, tassel: v });
          }}
        />
      </td>
      <td>
        <button className="icon-btn" title="Remover" onClick={() => onRemover(m)}>
          ✕
        </button>
      </td>
    </tr>
  );
}
