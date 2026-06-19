import { useEffect, useState } from "react";
import { api, COMPOSICOES, type Modelo } from "../api";

export function Cadastros() {
  const [itens, setItens] = useState<Modelo[]>([]);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState<Modelo>({
    nome: "",
    parte: 2,
    ref: "",
    composicao: "",
    tassel_peseira: 0,
    tassel_almofada: 0,
  });

  function recarregar() {
    api.listarModelos().then(setItens).catch(() => {});
  }
  useEffect(recarregar, []);

  async function salvar(m: Modelo, de?: string) {
    try {
      await api.salvarModelo(m, de);
      recarregar();
    } catch (e) {
      alert((e as Error).message);
      recarregar();
    }
  }
  async function adicionar() {
    if (!novo.nome.trim()) return;
    await salvar(novo);
    setNovo({ nome: "", parte: 2, ref: "", composicao: "", tassel_peseira: 0, tassel_almofada: 0 });
  }
  async function remover(m: Modelo) {
    await api.excluirModelo(m.nome);
    recarregar();
  }

  const filtrados = itens.filter((m) => m.nome.toLowerCase().includes(busca.toLowerCase()));
  const p1 = itens.filter((m) => m.parte === 1).length;

  // Importação em lote: cada linha "Nome  Código" (separador: vírgula, ponto e vírgula, tab ou 2+ espaços).
  const [mostrarImport, setMostrarImport] = useState(false);
  const [texto, setTexto] = useState("");
  const [importando, setImportando] = useState(false);
  function parseLinhas(): { nome: string; ref?: string }[] {
    return texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const partes = l.split(/\t|;|,|\s{2,}/).map((p) => p.trim()).filter(Boolean);
        const nome = partes[0] || "";
        const ref = partes.slice(1).find((p) => /\w/.test(p));
        return { nome, ref };
      })
      .filter((i) => i.nome);
  }
  async function importarLista() {
    const linhas = parseLinhas();
    if (linhas.length === 0) return;
    setImportando(true);
    try {
      const r = await api.importarModelos(linhas);
      setTexto("");
      setMostrarImport(false);
      recarregar();
      alert(`${r.total} modelo(s) importado(s)/atualizado(s).`);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setImportando(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cadastro de Modelos</h1>
          <div className="breadcrumb">Configuração › Modelos</div>
        </div>
        <div className="row-gap">
          <input
            placeholder="🔎 Buscar modelo…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <button className="btn btn-soft" onClick={() => setMostrarImport((v) => !v)}>
            ⬆ Subir lista (nome + código)
          </button>
        </div>
      </div>

      {mostrarImport && (
        <div className="card pad">
          <h2>Subir lista de modelos (nome + código)</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Cole uma linha por modelo: <strong>Nome</strong> e <strong>Código</strong> separados por
            vírgula, tab ou 2+ espaços. Ex.: <code>Perola, 1075</code>. Cria os que faltam e atualiza
            o código dos existentes <strong>sem alterar</strong> parte/composição já cadastradas.
          </p>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={"Perola, 1075\nAspen, 1083\nKora, KT1092"}
            rows={8}
            style={{ width: "100%", font: "inherit", padding: 10, borderRadius: 10, border: "1px solid #e2e8f0" }}
          />
          <div className="row-gap" style={{ marginTop: 10, justifyContent: "flex-end" }}>
            <span className="muted" style={{ marginRight: "auto" }}>
              {parseLinhas().length} linha(s) detectada(s)
            </span>
            <button className="btn" onClick={() => { setTexto(""); setMostrarImport(false); }}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={importarLista} disabled={importando}>
              {importando ? "Importando…" : "Importar"}
            </button>
          </div>
        </div>
      )}
      <p className="muted" style={{ marginTop: -8, marginBottom: 16 }}>
        Tabela completa de modelos. <strong>Parte 1</strong> = tece na Máquina 3 (o resto = Parte 2;
        kits = Pronta Entrega; sem Parte 1 → Parte Única). A <strong>composição</strong> é do modelo
        (a mesma cor pode ser acrílico num modelo e poliéster em outro). <strong>Tassel</strong> = qtd
        do acessório por peça (peseira e almofada têm tamanhos diferentes).{" "}
        <strong>Para editar um modelo</strong>, basta alterar qualquer campo na linha (nome, código,
        parte, composição ou tassel) — salva automaticamente.{" "}
        {itens.length} modelos · {p1} na Parte 1.
      </p>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Modelo</th>
              <th>Código</th>
              <th>Parte</th>
              <th>Composição</th>
              <th className="num">Tassel Peseira</th>
              <th className="num">Tassel Almofada</th>
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
                  placeholder="Código"
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
                  value={novo.tassel_peseira ?? 0}
                  onChange={(e) => setNovo({ ...novo, tassel_peseira: Number(e.target.value) })}
                />
              </td>
              <td className="num">
                <input
                  className="w-xs num"
                  type="number"
                  min={0}
                  value={novo.tassel_almofada ?? 0}
                  onChange={(e) => setNovo({ ...novo, tassel_almofada: Number(e.target.value) })}
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
                <td colSpan={7} className="empty pad">
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
  onSalvar: (m: Modelo, de?: string) => void;
  onRemover: (m: Modelo) => void;
}) {
  return (
    <tr>
      <td className="strong">
        <input
          defaultValue={m.nome}
          placeholder="Nome do modelo"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== m.nome) onSalvar({ ...m, nome: v }, m.nome);
          }}
        />
      </td>
      <td>
        <input
          className="w-sm"
          placeholder="Código"
          defaultValue={m.ref ?? ""}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (m.ref ?? "")) onSalvar({ ...m, ref: v });
          }}
        />
      </td>
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
          defaultValue={m.tassel_peseira ?? 0}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v !== (m.tassel_peseira ?? 0)) onSalvar({ ...m, tassel_peseira: v });
          }}
        />
      </td>
      <td className="num">
        <input
          className="w-xs num"
          type="number"
          min={0}
          defaultValue={m.tassel_almofada ?? 0}
          onBlur={(e) => {
            const v = Number(e.target.value);
            if (v !== (m.tassel_almofada ?? 0)) onSalvar({ ...m, tassel_almofada: v });
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
