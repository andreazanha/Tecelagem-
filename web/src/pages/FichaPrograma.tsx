// Ficha Técnica de Programa (tricô) — cadastro no estilo da ficha impressa (AN289).
// Lista as fichas salvas e abre um editor WYSIWYG em formato A4, igual ao PDF:
// cabeçalho azul-marinho, tabelas PROGRAMA/GUIA FIOS/ECONOMIZADOR/GRADUAÇÃO/TAKE DOWN/
// VELOCIDADE e a imagem do produto. Máquina e galga vêm de listas cadastradas.
// Imprime com window.print() mantendo exatamente este layout.
import React, { useEffect, useRef, useState } from "react";
import {
  api,
  type FichaItemLista,
  type FichaPrograma as TFicha,
  type FichaProgramaResumo,
  type FichaProgramaLinha,
  type FichaGuiaFio,
  type FichaEconomizador,
  type FichaGraduacao,
  type FichaTakeDown,
  type FichaVelocidade,
} from "../api";

// Rótulos fixos da coluna N da tabela VELOCIDADE (iguais ao PDF).
const VELOC_N = ["H", "M", "L", "2", "2", "3", "4", "5", "6", "7"];
// Rótulos fixos dos grupos do ECONOMIZADOR (os dois últimos ficam em branco, como no PDF).
const ECON_LABELS = ["FRENTE", "COSTA", "", ""];

const hojeBR = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const fmtData = (iso?: string) => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

function linhas<T>(n: number, mk: () => T): T[] {
  return Array.from({ length: n }, mk);
}
function pad<T>(arr: T[] | undefined, min: number, mk: () => T): T[] {
  const base = Array.isArray(arr) ? arr.slice() : [];
  while (base.length < min) base.push(mk());
  return base;
}

function novaFicha(): TFicha {
  return {
    id: "",
    numero: "", cliente: "", descricao: "", programador: "", maquina: "", galga: "", fio: "", data: hojeBR(),
    peso_total: "", tempo_total: "", imagem_key: null,
    programa: linhas(7, () => ({ programa: "", descricao: "", tempo: "" })),
    guia_fios: linhas(12, () => ({ num: "", fio: "", cabos: "", fio2: "" })),
    economizador: linhas(10, () => ({ num: "", c1: "", c1p: "", c2: "", c2p: "", c3: "", c3p: "", c4: "", c4p: "" })),
    graduacao: linhas(15, () => ({ num: "", local: "" })),
    take_down: linhas(15, () => ({ tc: "", tr: "", local: "" })),
    velocidade: VELOC_N.map((n) => ({ n, ms: "", local: "" })),
  };
}

// Garante quantidade mínima de linhas e os rótulos fixos (N da velocidade) ao abrir.
function normalizar(f: TFicha): TFicha {
  const vel = VELOC_N.map((n, i) => ({ n, ms: f.velocidade?.[i]?.ms || "", local: f.velocidade?.[i]?.local || "" }));
  return {
    ...f,
    data: f.data || "",
    programa: pad(f.programa, 7, () => ({ programa: "", descricao: "", tempo: "" })),
    guia_fios: pad(f.guia_fios, 12, () => ({ num: "", fio: "", cabos: "", fio2: "" })),
    economizador: pad(f.economizador, 10, () => ({ num: "", c1: "", c1p: "", c2: "", c2p: "", c3: "", c3p: "", c4: "", c4p: "" })),
    graduacao: pad(f.graduacao, 15, () => ({ num: "", local: "" })),
    take_down: pad(f.take_down, 15, () => ({ tc: "", tr: "", local: "" })),
    velocidade: vel,
  };
}

const CSS = `
.fp-wrap{max-width:1000px;margin:0 auto;}
.fp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px;}
.fp-bar .sp{flex:1;}
.fp-btn{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:8px;padding:7px 12px;font-weight:600;cursor:pointer;font-size:14px;}
.fp-btn:hover{background:rgba(27,42,138,.08);}
.fp-btn.pri{background:#1b2a8a;border-color:#1b2a8a;color:#fff;}
.fp-btn.pri:hover{background:#16207a;}
.fp-btn.dng{color:#b91c1c;border-color:#f3c3c3;}
.fp-btn.dng:hover{background:rgba(185,28,28,.08);}
.fp-tabela{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;}
.fp-tabela th,.fp-tabela td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);font-size:14px;}
.fp-tabela th{background:rgba(27,42,138,.06);font-weight:700;}
.fp-tabela tr:hover td{background:rgba(27,42,138,.04);}
.fp-link{color:#1b2a8a;font-weight:700;cursor:pointer;background:none;border:0;padding:0;font-size:14px;}
.fp-del{color:#b91c1c;cursor:pointer;background:none;border:0;padding:0;font-size:14px;}
.fp-vazio{padding:28px;text-align:center;color:var(--muted);}

/* ── A folha A4 (igual ao PDF) ─────────────────────────────────────────── */
.ficha-sheet{--navy:#1b2a8a;background:#fff;color:#111;width:210mm;max-width:100%;margin:0 auto;padding:6mm;
  font-family:Arial,Helvetica,sans-serif;font-size:11px;box-sizing:border-box;box-shadow:0 2px 14px rgba(0,0,0,.12);border-radius:4px;}
.ficha-sheet *{box-sizing:border-box;}
.ficha-sheet .titulo{background:var(--navy);color:#fff;text-align:center;font-weight:bold;font-size:17px;padding:7px;letter-spacing:1px;}
.ficha-sheet table{border-collapse:collapse;width:100%;}
.ficha-sheet td,.ficha-sheet th{border:1px solid var(--navy);vertical-align:middle;}
.ficha-sheet th{background:var(--navy);color:#fff;font-size:11px;padding:3px 5px;text-align:center;font-weight:bold;}
.ficha-sheet input,.ficha-sheet select{border:0;width:100%;box-sizing:border-box;font:inherit;padding:2px 5px;background:transparent;color:inherit;height:20px;line-height:16px;}
.ficha-sheet input:focus,.ficha-sheet select:focus{outline:2px solid #90caf9;outline-offset:-2px;background:#eef4ff;}
.ficha-sheet select{cursor:pointer;-webkit-appearance:none;appearance:none;}
.ficha-sheet .secao{font-weight:bold;font-size:11.5px;padding:3px 1px 1px;color:#111;}
.ficha-sheet .cab{border:0;}
.ficha-sheet .cab td{border:0;padding:2px 3px;vertical-align:top;}
.ficha-sheet .cab .lab{font-weight:bold;white-space:nowrap;}
.ficha-sheet .cab input,.ficha-sheet .cab select{border-bottom:1px solid #c9ccdd;height:19px;}
.ficha-sheet .topo{display:grid;grid-template-columns:1.42fr 1fr;gap:5px;align-items:start;}
.ficha-sheet .center{text-align:center;}
.ficha-sheet .navy-cell{background:var(--navy);color:#fff;font-weight:bold;padding:3px 6px;white-space:nowrap;}
.ficha-sheet .img-area{border:1px solid var(--navy);border-top:0;height:300px;display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;background:#fafafe;}
.ficha-sheet .img-area img{max-width:100%;max-height:100%;object-fit:contain;}
.ficha-sheet .img-hint{color:#8a90b0;font-size:12px;text-align:center;padding:10px;}
.ficha-sheet .tri{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;align-items:start;}
.ficha-sheet .addrow{text-align:left;margin:2px 0 6px;}
.ficha-sheet .addrow button{border:1px dashed #9aa0c4;background:#f2f4ff;color:#1b2a8a;border-radius:6px;font-size:10.5px;padding:2px 8px;cursor:pointer;}
.ficha-sheet .w-num{width:34px;}
.ficha-sheet .w-pts{width:38px;}
.ficha-sheet .w-tctr{width:30px;}
.ficha-sheet .t-center input{text-align:center;}
.ficha-sheet .veloc-n{background:var(--navy);color:#fff;font-weight:bold;text-align:center;width:28px;}

@media (max-width:760px){
  .ficha-sheet{width:100%;padding:3mm;font-size:12px;}
  .ficha-sheet .topo{grid-template-columns:1fr;}
  .ficha-sheet .tri{grid-template-columns:1fr;}
  .ficha-sheet .img-area{height:240px;}
}

/* ── Impressão: só a folha, em A4 ──────────────────────────────────────── */
@media print{
  body *{visibility:hidden !important;}
  .ficha-sheet,.ficha-sheet *{visibility:visible !important;}
  .ficha-sheet{position:absolute;left:0;top:0;width:100%;margin:0;padding:0;box-shadow:none;border-radius:0;}
  .fp-noprint{display:none !important;}
  .ficha-sheet .img-area{cursor:default;}
  @page{size:A4 portrait;margin:8mm;}
}
`;

export function FichaPrograma() {
  const [lista, setLista] = useState<FichaProgramaResumo[] | null>(null);
  const [maquinas, setMaquinas] = useState<FichaItemLista[]>([]);
  const [galgas, setGalgas] = useState<FichaItemLista[]>([]);
  const [editando, setEditando] = useState<TFicha | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [gerenciando, setGerenciando] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [imgBust, setImgBust] = useState(0);

  function carregarLista() {
    setLista(null);
    api.fichasListar().then(setLista).catch((e) => setErro((e as Error).message));
  }
  function carregarListas() {
    api.fichasMaquinas().then(setMaquinas).catch(() => {});
    api.fichasGalgas().then(setGalgas).catch(() => {});
  }
  useEffect(() => { carregarLista(); carregarListas(); }, []);

  // ── Ações de lista ────────────────────────────────────────────────────
  function abrirNova() { setErro(""); setEditando(normalizar(novaFicha())); setImgBust(0); }
  function abrir(id: string) {
    setErro("");
    api.fichaObter(id).then((f) => { setEditando(normalizar(f)); setImgBust(Date.now()); }).catch((e) => setErro((e as Error).message));
  }
  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir a ficha ${nome || ""}? Esta ação não pode ser desfeita.`)) return;
    try { await api.fichaExcluir(id); carregarLista(); } catch (e) { alert((e as Error).message); }
  }

  // ── Edição do campo ───────────────────────────────────────────────────
  function set<K extends keyof TFicha>(k: K, v: TFicha[K]) {
    setEditando((f) => (f ? { ...f, [k]: v } : f));
  }
  function setLinha<T>(k: keyof TFicha, i: number, campo: keyof T, v: string) {
    setEditando((f) => {
      if (!f) return f;
      const arr = ([...(f[k] as unknown as T[])]);
      arr[i] = { ...(arr[i] as T), [campo]: v } as T;
      return { ...f, [k]: arr } as TFicha;
    });
  }
  function addLinha(k: keyof TFicha, mk: () => unknown) {
    setEditando((f) => (f ? { ...f, [k]: [...(f[k] as unknown[]), mk()] } as TFicha : f));
  }

  async function salvar(): Promise<TFicha | null> {
    if (!editando) return null;
    setSalvando(true); setErro("");
    try {
      const r = await api.fichaSalvar(editando);
      const f = normalizar(r.ficha);
      setEditando(f);
      carregarLista();
      return f;
    } catch (e) { setErro((e as Error).message); return null; }
    finally { setSalvando(false); }
  }

  function imprimir() { window.print(); }

  // Adiciona máquina/galga pela própria ficha (prompt) e já seleciona.
  async function adicionarMaquina() {
    const nome = prompt("Nova máquina (modelo):")?.trim();
    if (!nome) return;
    try { await api.fichaMaquinaAdd(nome); const l = await api.fichasMaquinas(); setMaquinas(l); set("maquina", nome); } catch (e) { alert((e as Error).message); }
  }
  async function adicionarGalga() {
    const nome = prompt("Nova galga:")?.trim();
    if (!nome) return;
    try { await api.fichaGalgaAdd(nome); const l = await api.fichasGalgas(); setGalgas(l); set("galga", nome); } catch (e) { alert((e as Error).message); }
  }

  async function escolherImagem(file: File) {
    let f = editando;
    if (!f) return;
    if (!f.id) { f = await salvar(); if (!f) return; }
    try {
      await api.fichaImagemUpload(f.id, file);
      setEditando((cur) => (cur ? { ...cur, imagem_key: `ficha/${f!.id}` } : cur));
      setImgBust(Date.now());
    } catch (e) { alert((e as Error).message); }
  }

  const titulo = <h1 style={{ margin: "0 0 2px", fontSize: 22 }}>📐 Ficha Técnica de Programa</h1>;

  // ── LISTA ─────────────────────────────────────────────────────────────
  if (!editando) {
    return (
      <div className="fp-wrap">
        <style>{CSS}</style>
        <div className="fp-bar">
          <div>{titulo}<div style={{ color: "var(--muted)", fontSize: 13 }}>Cadastre o programa de tricô e imprima igual à ficha.</div></div>
          <div className="sp" />
          <button className="fp-btn" onClick={() => setGerenciando((v) => !v)}>⚙️ Máquinas e galgas</button>
          <button className="fp-btn pri" onClick={abrirNova}>➕ Nova ficha</button>
        </div>

        {gerenciando && (
          <GerenciarListas
            maquinas={maquinas} galgas={galgas}
            onChange={carregarListas}
          />
        )}

        {erro && <div style={{ color: "#b91c1c", marginBottom: 10 }}>⚠️ {erro}</div>}

        {lista === null ? (
          <div className="fp-vazio">Carregando…</div>
        ) : lista.length === 0 ? (
          <div className="fp-vazio">Nenhuma ficha cadastrada ainda. Clique em <b>Nova ficha</b> para começar.</div>
        ) : (
          <table className="fp-tabela">
            <thead>
              <tr><th style={{ width: 90 }}>Nº</th><th>Cliente</th><th>Descrição</th><th>Máquina</th><th>Galga</th><th style={{ width: 100 }}>Data</th><th style={{ width: 150 }}></th></tr>
            </thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.id}>
                  <td><button className="fp-link" onClick={() => abrir(f.id)}>{f.numero || "—"}</button></td>
                  <td>{f.cliente || "—"}</td>
                  <td>{f.descricao || "—"}</td>
                  <td>{f.maquina || "—"}</td>
                  <td>{f.galga || "—"}</td>
                  <td>{fmtData(f.data)}</td>
                  <td>
                    <button className="fp-link" onClick={() => abrir(f.id)}>Abrir</button>
                    <span style={{ margin: "0 8px", color: "var(--line)" }}>|</span>
                    <button className="fp-del" onClick={() => excluir(f.id, f.numero || "")}>Excluir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── EDITOR / FOLHA ────────────────────────────────────────────────────
  const f = editando;
  const inp = (val: string | undefined, on: (v: string) => void, extra?: React.CSSProperties) => (
    <input value={val || ""} onChange={(e) => on(e.target.value)} style={extra} />
  );

  return (
    <div className="fp-wrap">
      <style>{CSS}</style>
      <div className="fp-bar fp-noprint">
        <button className="fp-btn" onClick={() => { setEditando(null); carregarLista(); }}>← Voltar</button>
        <div className="sp" />
        {erro && <span style={{ color: "#b91c1c" }}>⚠️ {erro}</span>}
        <button className="fp-btn pri" onClick={() => salvar()} disabled={salvando}>{salvando ? "Salvando…" : "💾 Salvar"}</button>
        <button className="fp-btn" onClick={imprimir}>🖨️ Imprimir</button>
        {f.id && <button className="fp-btn dng" onClick={async () => { if (confirm("Excluir esta ficha?")) { await api.fichaExcluir(f.id); setEditando(null); carregarLista(); } }}>Excluir</button>}
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const file = e.target.files?.[0]; if (file) escolherImagem(file); e.target.value = ""; }} />

      <div className="ficha-sheet">
        <div className="titulo">FICHA TÉCNICA DE PROGRAMA</div>

        {/* Cabeçalho (3 colunas) */}
        <table className="cab"><tbody>
          <tr>
            <td style={{ width: "34%" }}><span className="lab">CLIENTE: </span></td>
            <td style={{ width: "40%" }}><span className="lab">PROGRAMADOR: </span></td>
            <td style={{ width: "26%" }}><span className="lab">DATA: </span></td>
          </tr>
          <tr>
            <td>{inp(f.cliente, (v) => set("cliente", v))}</td>
            <td>{inp(f.programador, (v) => set("programador", v))}</td>
            <td><input type="date" value={f.data || ""} onChange={(e) => set("data", e.target.value)} /></td>
          </tr>
          <tr>
            <td><span className="lab">Nº PROGRAMA: </span></td>
            <td><span className="lab">MAQ. MODELO: </span></td>
            <td><span className="lab">GALGA: </span></td>
          </tr>
          <tr>
            <td>{inp(f.numero, (v) => set("numero", v))}</td>
            <td>
              <select value={maquinas.some((m) => m.nome === f.maquina) ? f.maquina : (f.maquina ? "__cur__" : "")}
                onChange={(e) => { if (e.target.value === "__add__") adicionarMaquina(); else set("maquina", e.target.value === "__cur__" ? f.maquina || "" : e.target.value); }}>
                <option value="">—</option>
                {f.maquina && !maquinas.some((m) => m.nome === f.maquina) && <option value="__cur__">{f.maquina}</option>}
                {maquinas.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
                <option value="__add__">➕ nova máquina…</option>
              </select>
            </td>
            <td>
              <select value={galgas.some((g) => g.nome === f.galga) ? f.galga : (f.galga ? "__cur__" : "")}
                onChange={(e) => { if (e.target.value === "__add__") adicionarGalga(); else set("galga", e.target.value === "__cur__" ? f.galga || "" : e.target.value); }}>
                <option value="">—</option>
                {f.galga && !galgas.some((g) => g.nome === f.galga) && <option value="__cur__">{f.galga}</option>}
                {galgas.map((g) => <option key={g.id} value={g.nome}>{g.nome}</option>)}
                <option value="__add__">➕ nova galga…</option>
              </select>
            </td>
          </tr>
          <tr>
            <td><span className="lab">DESCRIÇÃO: </span></td>
            <td><span className="lab">FIO: </span></td>
            <td></td>
          </tr>
          <tr>
            <td>{inp(f.descricao, (v) => set("descricao", v))}</td>
            <td>{inp(f.fio, (v) => set("fio", v))}</td>
            <td></td>
          </tr>
        </tbody></table>

        {/* PROGRAMA + IMAGEM */}
        <div className="topo" style={{ marginTop: 4 }}>
          <div>
            <table><tbody>
              <tr><th style={{ width: "30%" }}>PROGRAMA</th><th style={{ width: "50%" }}>DESCRIÇÃO</th><th style={{ width: "20%" }}>TEMPO</th></tr>
              {(f.programa || []).map((r, i) => (
                <tr key={i}>
                  <td>{inp(r.programa, (v) => setLinha<FichaProgramaLinha>("programa", i, "programa", v))}</td>
                  <td>{inp(r.descricao, (v) => setLinha<FichaProgramaLinha>("programa", i, "descricao", v))}</td>
                  <td>{inp(r.tempo, (v) => setLinha<FichaProgramaLinha>("programa", i, "tempo", v))}</td>
                </tr>
              ))}
              <tr>
                <td className="navy-cell">PESO TOTAL:</td>
                <td>{inp(f.peso_total, (v) => set("peso_total", v))}</td>
                <td className="navy-cell" style={{ fontSize: 10 }}>TEMPO TOTAL:</td>
              </tr>
              <tr><td colSpan={3} style={{ border: 0, padding: 0 }}>{inp(f.tempo_total, (v) => set("tempo_total", v))}</td></tr>
            </tbody></table>
            <div className="addrow fp-noprint"><button onClick={() => addLinha("programa", () => ({ programa: "", descricao: "", tempo: "" }))}>+ linha</button></div>
          </div>
          <div>
            <table><tbody><tr><th>IMAGEM</th></tr></tbody></table>
            <div className="img-area" onClick={() => fileRef.current?.click()}>
              {f.imagem_key ? (
                <img src={api.fichaImagemUrl(f.id) + "?t=" + imgBust} alt="produto" />
              ) : (
                <div className="img-hint">🖼️<br />Clique para adicionar<br />a foto do produto</div>
              )}
            </div>
          </div>
        </div>

        {/* GUIA FIOS */}
        <div className="secao">GUIA FIOS</div>
        <table className="t-center"><tbody>
          <tr><th className="w-num">Nº</th><th style={{ width: "40%", textAlign: "left" }}>FIO</th><th style={{ width: "18%" }}>CABOS</th><th style={{ textAlign: "left" }}>FIO</th></tr>
          {(f.guia_fios || []).map((r, i) => (
            <tr key={i}>
              <td className="w-num">{inp(r.num, (v) => setLinha<FichaGuiaFio>("guia_fios", i, "num", v))}</td>
              <td style={{ textAlign: "left" }}><input style={{ textAlign: "left" }} value={r.fio || ""} onChange={(e) => setLinha<FichaGuiaFio>("guia_fios", i, "fio", e.target.value)} /></td>
              <td>{inp(r.cabos, (v) => setLinha<FichaGuiaFio>("guia_fios", i, "cabos", v))}</td>
              <td style={{ textAlign: "left" }}><input style={{ textAlign: "left" }} value={r.fio2 || ""} onChange={(e) => setLinha<FichaGuiaFio>("guia_fios", i, "fio2", e.target.value)} /></td>
            </tr>
          ))}
        </tbody></table>
        <div className="addrow fp-noprint"><button onClick={() => addLinha("guia_fios", () => ({ num: "", fio: "", cabos: "", fio2: "" }))}>+ linha</button></div>

        {/* ECONOMIZADOR */}
        <div className="secao">ECONOMIZADOR</div>
        <table className="t-center"><tbody>
          <tr>
            <th className="w-num">Nº</th>
            {ECON_LABELS.map((lb, k) => (
              <React.Fragment key={k}>
                <th style={{ textAlign: "left" }}>{lb}</th>
                <th className="w-pts">PTS</th>
              </React.Fragment>
            ))}
          </tr>
          {(f.economizador || []).map((r, i) => (
            <tr key={i}>
              <td className="w-num">{inp(r.num, (v) => setLinha<FichaEconomizador>("economizador", i, "num", v))}</td>
              {([["c1", "c1p"], ["c2", "c2p"], ["c3", "c3p"], ["c4", "c4p"]] as const).map(([cn, cp], k) => (
                <React.Fragment key={k}>
                  <td style={{ textAlign: "left" }}><input style={{ textAlign: "left" }} value={(r as Record<string, string>)[cn] || ""} onChange={(e) => setLinha<FichaEconomizador>("economizador", i, cn, e.target.value)} /></td>
                  <td className="w-pts">{inp((r as Record<string, string>)[cp], (v) => setLinha<FichaEconomizador>("economizador", i, cp, v))}</td>
                </React.Fragment>
              ))}
            </tr>
          ))}
        </tbody></table>
        <div className="addrow fp-noprint"><button onClick={() => addLinha("economizador", () => ({ num: "", c1: "", c1p: "", c2: "", c2p: "", c3: "", c3p: "", c4: "", c4p: "" }))}>+ linha</button></div>

        {/* GRADUAÇÃO · TAKE DOWN · VELOCIDADE */}
        <div className="tri" style={{ marginTop: 4 }}>
          <div>
            <div className="secao">GRADUAÇÃO</div>
            <table className="t-center"><tbody>
              <tr><th className="w-num">Nº</th><th style={{ textAlign: "left" }}>LOCALIZAÇÃO</th></tr>
              {(f.graduacao || []).map((r, i) => (
                <tr key={i}>
                  <td className="w-num">{inp(r.num, (v) => setLinha<FichaGraduacao>("graduacao", i, "num", v))}</td>
                  <td style={{ textAlign: "left" }}><input style={{ textAlign: "left" }} value={r.local || ""} onChange={(e) => setLinha<FichaGraduacao>("graduacao", i, "local", e.target.value)} /></td>
                </tr>
              ))}
            </tbody></table>
            <div className="addrow fp-noprint"><button onClick={() => addLinha("graduacao", () => ({ num: "", local: "" }))}>+ linha</button></div>
          </div>
          <div>
            <div className="secao">TAKE DOWN</div>
            <table className="t-center"><tbody>
              <tr><th className="w-tctr">TC</th><th className="w-tctr">TR</th><th style={{ textAlign: "left" }}>LOCALIZAÇÃO</th></tr>
              {(f.take_down || []).map((r, i) => (
                <tr key={i}>
                  <td className="w-tctr">{inp(r.tc, (v) => setLinha<FichaTakeDown>("take_down", i, "tc", v))}</td>
                  <td className="w-tctr">{inp(r.tr, (v) => setLinha<FichaTakeDown>("take_down", i, "tr", v))}</td>
                  <td style={{ textAlign: "left" }}><input style={{ textAlign: "left" }} value={r.local || ""} onChange={(e) => setLinha<FichaTakeDown>("take_down", i, "local", e.target.value)} /></td>
                </tr>
              ))}
            </tbody></table>
            <div className="addrow fp-noprint"><button onClick={() => addLinha("take_down", () => ({ tc: "", tr: "", local: "" }))}>+ linha</button></div>
          </div>
          <div>
            <div className="secao">VELOCIDADE</div>
            <table className="t-center"><tbody>
              <tr><th className="veloc-n">N</th><th className="w-pts">M/S</th><th style={{ textAlign: "left" }}>LOCAL</th></tr>
              {(f.velocidade || []).map((r, i) => (
                <tr key={i}>
                  <td className="veloc-n">{r.n}</td>
                  <td className="w-pts">{inp(r.ms, (v) => setLinha<FichaVelocidade>("velocidade", i, "ms", v))}</td>
                  <td style={{ textAlign: "left" }}><input style={{ textAlign: "left" }} value={r.local || ""} onChange={(e) => setLinha<FichaVelocidade>("velocidade", i, "local", e.target.value)} /></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Painel de gerência das listas de máquina e galga (na tela de lista).
function GerenciarListas({ maquinas, galgas, onChange }: { maquinas: FichaItemLista[]; galgas: FichaItemLista[]; onChange: () => void }) {
  const [nm, setNm] = useState("");
  const [ng, setNg] = useState("");
  async function addM() { const n = nm.trim(); if (!n) return; await api.fichaMaquinaAdd(n); setNm(""); onChange(); }
  async function addG() { const n = ng.trim(); if (!n) return; await api.fichaGalgaAdd(n); setNg(""); onChange(); }
  async function delM(id: string) { if (confirm("Remover máquina?")) { await api.fichaMaquinaDel(id); onChange(); } }
  async function delG(id: string) { if (confirm("Remover galga?")) { await api.fichaGalgaDel(id); onChange(); } }
  const col = (titulo: string, itens: FichaItemLista[], val: string, setVal: (s: string) => void, add: () => void, del: (id: string) => void, ph: string) => (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{titulo}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={ph}
          style={{ flex: 1, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--fg)" }} />
        <button className="fp-btn pri" onClick={add}>Adicionar</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {itens.length === 0 ? <span style={{ color: "var(--muted)", fontSize: 13 }}>nenhum cadastrado</span> :
          itens.map((it) => (
            <span key={it.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", borderRadius: 999, padding: "3px 6px 3px 10px", fontSize: 13 }}>
              {it.nome}<button className="fp-del" title="remover" onClick={() => del(it.id)}>✕</button>
            </span>
          ))}
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, border: "1px solid var(--line)", background: "var(--card)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
      {col("Máquinas (modelos)", maquinas, nm, setNm, addM, delM, "ex.: SSR 07")}
      {col("Galgas", galgas, ng, setNg, addG, delG, "ex.: 12")}
    </div>
  );
}
