// Ficha Técnica de Programa (tricô).
// Duas camadas bem separadas:
//  • TELA (edição): formulário moderno, em cards, usando o design do sistema
//    (claro/escuro). Confortável para preencher.
//  • PDF / IMPRESSÃO: um layout idêntico à ficha impressa (AN289) — cabeçalho
//    azul-marinho e as tabelas PROGRAMA / GUIA FIOS / ECONOMIZADOR / GRADUAÇÃO /
//    TAKE DOWN / VELOCIDADE. Renderizado num portal no <body> e mostrado só na
//    impressão (window.print → "Salvar como PDF"). Há também uma pré-visualização.
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

// Rótulos fixos da coluna N da VELOCIDADE (iguais ao PDF).
const VELOC_N = ["H", "M", "L", "2", "2", "3", "4", "5", "6", "7"];
// Grupos do ECONOMIZADOR: no PDF os dois últimos ficam sem título.
const ECON_PRINT = ["FRENTE", "COSTA", "", ""];
const ECON_TELA = ["Frente", "Costa", "Coluna 3", "Coluna 4"];
const ECON_COLS: ReadonlyArray<readonly [keyof FichaEconomizador, keyof FichaEconomizador]> = [
  ["c1", "c1p"], ["c2", "c2p"], ["c3", "c3p"], ["c4", "c4p"],
];

const hojeBR = () => {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const fmtData = (iso?: string) => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};
// Normaliza para busca/dedup: minúsculo, sem acento, espaços colapsados.
const normKey = (s?: string) => String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
// Padroniza grafia: só a 1ª letra maiúscula, resto como foi digitado (não força CAIXA ALTA).
const capFirst = (s?: string) => { const t = String(s ?? "").trim().replace(/\s+/g, " "); return t ? t[0].toUpperCase() + t.slice(1) : t; };
function linhas<T>(n: number, mk: () => T): T[] { return Array.from({ length: n }, mk); }
function pad<T>(arr: T[] | undefined, min: number, mk: () => T): T[] {
  const base = Array.isArray(arr) ? arr.slice() : [];
  while (base.length < min) base.push(mk());
  return base;
}
const mkPrograma = (): FichaProgramaLinha => ({ programa: "", descricao: "", tempo: "" });
const mkGuia = (): FichaGuiaFio => ({ num: "", fio: "", cabos: "", fio2: "" });
const mkEcon = (): FichaEconomizador => ({ num: "", c1: "", c1p: "", c2: "", c2p: "", c3: "", c3p: "", c4: "", c4p: "" });
const mkGrad = (): FichaGraduacao => ({ num: "", local: "" });
const mkTake = (): FichaTakeDown => ({ tc: "", tr: "", local: "" });

function novaFicha(): TFicha {
  return {
    id: "", numero: "", cliente: "", descricao: "", programador: "", maquina: "", galga: "", fio: "", data: hojeBR(),
    peso_total: "", tempo_total: "", imagem_key: null,
    programa: linhas(5, mkPrograma), guia_fios: linhas(8, mkGuia), economizador: linhas(4, mkEcon),
    graduacao: linhas(10, mkGrad), take_down: linhas(10, mkTake),
    velocidade: VELOC_N.map((n) => ({ n, ms: "", local: "" })),
  };
}
// Ao abrir: garante ao menos 1 linha por tabela e os rótulos fixos de velocidade.
function normalizar(f: TFicha): TFicha {
  const vel = VELOC_N.map((n, i) => ({ n, ms: f.velocidade?.[i]?.ms || "", local: f.velocidade?.[i]?.local || "" }));
  return {
    ...f, data: f.data || "",
    programa: pad(f.programa, 3, mkPrograma), guia_fios: pad(f.guia_fios, 4, mkGuia),
    economizador: pad(f.economizador, 3, mkEcon), graduacao: pad(f.graduacao, 4, mkGrad),
    take_down: pad(f.take_down, 4, mkTake), velocidade: vel,
  };
}
// Para o PDF: completa com linhas em branco para a ficha sair "cheia" como a de papel.
function paraImpressao(f: TFicha): TFicha {
  return {
    ...f,
    programa: pad(f.programa, 7, mkPrograma), guia_fios: ordenarGuia(pad(f.guia_fios, 10, mkGuia)),
    economizador: pad(f.economizador, 8, mkEcon), graduacao: pad(f.graduacao, 13, mkGrad),
    take_down: pad(f.take_down, 13, mkTake),
    velocidade: VELOC_N.map((n, i) => ({ n, ms: f.velocidade?.[i]?.ms || "", local: f.velocidade?.[i]?.local || "" })),
  };
}

// Seções com cadastro próprio de termos (autocomplete + cadastrar na hora).
const TIPOS_TERMO = ["programa", "economizador", "stitch", "puxamento", "velocidade"] as const;

// Ordena a Guia de fios pelo Nº (vazios/sem número vão para o fim, mantendo a ordem relativa).
function ordenarGuia(arr: FichaGuiaFio[]): FichaGuiaFio[] {
  const val = (n?: string) => { const x = parseInt(String(n ?? "").replace(/[^\d]/g, ""), 10); return Number.isFinite(x) ? x : Infinity; };
  return arr.map((r, i) => ({ r, i })).sort((a, b) => (val(a.r.num) - val(b.r.num)) || (a.i - b.i)).map((x) => x.r);
}
// Padroniza a grafia (1ª letra maiúscula) nos textos livres e ordena a guia.
// Não toca em código/Nº/sigla (número do programa, máquina, galga, cabos, pts, tc/tr, m/s, tempo).
function padronizar(ff: TFicha): TFicha {
  const cap = (s?: string) => capFirst(s);
  return {
    ...ff,
    cliente: cap(ff.cliente), descricao: cap(ff.descricao), programador: cap(ff.programador), fio: cap(ff.fio),
    programa: (ff.programa || []).map((r) => ({ ...r, programa: cap(r.programa), descricao: cap(r.descricao) })),
    economizador: (ff.economizador || []).map((r) => ({ ...r, c1: cap(r.c1), c2: cap(r.c2), c3: cap(r.c3), c4: cap(r.c4) })),
    graduacao: (ff.graduacao || []).map((r) => ({ ...r, local: cap(r.local) })),
    take_down: (ff.take_down || []).map((r) => ({ ...r, local: cap(r.local) })),
    velocidade: (ff.velocidade || []).map((r) => ({ ...r, local: cap(r.local) })),
    guia_fios: ordenarGuia((ff.guia_fios || []).map((r) => ({ ...r, fio: cap(r.fio), fio2: cap(r.fio2) }))),
  };
}

const CSS = `
.fp-wrap{max-width:1120px;margin:0 auto;padding:0 16px;}
.fp-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px;}
.fp-top .sp{flex:1;}
.fp-h1{margin:0;font-size:20px;font-weight:800;color:var(--ink);}
.fp-eh1{margin:0;font-size:19px;font-weight:800;color:var(--ink);letter-spacing:-.01em;}
.fp-sub{color:var(--muted);font-size:13px;margin-top:2px;}
.fp-err{color:#b91c1c;font-weight:600;font-size:13px;}

.fp-card{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px;}
body.dark .fp-card{background:#0e1426;}
.fp-ch{display:flex;align-items:center;gap:9px;margin:0 0 12px;font-weight:700;font-size:14px;color:var(--ink);}
.fp-ch::before{content:"";width:3px;height:14px;border-radius:2px;background:var(--brand1);flex:none;}
.fp-ch .hint{margin-left:auto;font-weight:600;font-size:12px;color:var(--muted);}

.fp-identi{display:grid;grid-template-columns:1.7fr 1fr;gap:18px;align-items:start;}
.fp-fgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;}
.fp-field{display:flex;flex-direction:column;gap:5px;min-width:0;}
.fp-field label{font-size:12px;}
.fp-field.col2{grid-column:1 / -1;}
.fp-field .selrow{display:flex;gap:6px;}
.fp-field .selrow select{flex:1;min-width:0;}

.fp-drop{border:2px dashed #c7d2fe;border-radius:12px;background:#fafbff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:8px;min-height:190px;overflow:hidden;color:#4338ca;font-size:13px;font-weight:600;position:relative;}
body.dark .fp-drop{background:#0b1120;border-color:#4338ca66;color:#a5b4fc;}
.fp-drop img{width:100%;height:100%;object-fit:contain;max-height:280px;}
.fp-drop .rm{position:absolute;top:8px;right:8px;background:#ef4444;color:#fff;border:none;border-radius:8px;padding:4px 9px;font-size:12px;font-weight:700;cursor:pointer;}

.fp-scroll{overflow-x:auto;}
.fp-tbl{width:100%;border-collapse:separate;border-spacing:0 0;}
.fp-tbl th{font-size:12px;text-transform:uppercase;letter-spacing:.3px;color:var(--muted);font-weight:700;text-align:left;padding:0 6px 7px;white-space:nowrap;}
.fp-tbl td{padding:0 6px 8px;vertical-align:middle;}
.fp-tbl input{width:100%;}
.fp-tbl .c-num{width:66px;}.fp-tbl .c-num input{text-align:center;}
.fp-tbl .c-pts{width:72px;}.fp-tbl .c-pts input{text-align:center;}
.fp-tbl .c-tctr{width:64px;}.fp-tbl .c-tctr input{text-align:center;}
.fp-tbl .c-rm{width:40px;}
.fp-tbl .c-vn{width:52px;font-weight:800;color:var(--muted);text-align:center;}
.fp-addrow{margin-top:2px;}
.fp-tri{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;align-items:start;}
.fp-mini{font-size:12px;color:var(--muted);}
.fp-combo{position:relative;width:100%;}
.fp-combo input.fp-ctr{text-align:center;}
.fp-combo-pop{z-index:95;background:var(--card,#fff);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 26px #0f172a2e;max-height:230px;overflow:auto;padding:4px;}
body.dark .fp-combo-pop{background:#0e1426;}
.fp-combo-opt{padding:6px 9px;border-radius:6px;font-size:13px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink);}
.fp-combo-opt.hi{background:rgba(79,70,229,.12);}
.fp-combo-add{color:var(--brand1);font-weight:600;}

/* ── Modal de pré-visualização ─────────────────────────────────────────── */
.fp-mback{position:fixed;inset:0;background:#0f172a99;z-index:90;display:flex;flex-direction:column;align-items:center;padding:18px 12px;overflow:auto;}
.fp-mbar{display:flex;gap:10px;align-items:center;margin-bottom:14px;color:#fff;font-weight:700;}
.fp-mbar .sp{flex:1;}

/* ── A folha (PDF / impressão) ─────────────────────────────────────────── */
.ficha-sheet{--navy:#1b2a8a;background:#fff;color:#111;width:210mm;max-width:100%;margin:0 auto;
  font-family:Arial,Helvetica,sans-serif;font-size:11px;box-sizing:border-box;}
.ficha-sheet *{box-sizing:border-box;}
.ficha-sheet .titulo{background:var(--navy);color:#fff;text-align:center;font-weight:bold;font-size:17px;padding:7px;letter-spacing:1px;}
.ficha-sheet table{border-collapse:collapse;width:100%;}
.ficha-sheet td,.ficha-sheet th{border:1px solid var(--navy);vertical-align:middle;}
.ficha-sheet th{background:var(--navy);color:#fff;font-size:11px;padding:3px 5px;text-align:center;font-weight:bold;}
.ficha-sheet .cv{min-height:16px;padding:2px 5px;line-height:15px;white-space:pre-wrap;word-break:break-word;}
.ficha-sheet .center .cv{text-align:center;}
.ficha-sheet .secao{font-weight:bold;font-size:11.5px;padding:4px 1px 1px;color:#111;}
.ficha-sheet .cab{border:0;}
.ficha-sheet .cab td{border:0;padding:3px 4px;vertical-align:bottom;}
.ficha-sheet .cab .campo{display:flex;align-items:flex-end;gap:5px;}
.ficha-sheet .cab .lab{font-weight:bold;white-space:nowrap;flex:none;}
.ficha-sheet .cab .val{flex:1;min-width:0;border-bottom:1px solid #c9ccdd;min-height:15px;padding-bottom:1px;}
.ficha-sheet .topo{display:grid;grid-template-columns:1.42fr 1fr;gap:5px;align-items:start;}
.ficha-sheet .navy-cell{background:var(--navy);color:#fff;font-weight:bold;padding:3px 6px;white-space:nowrap;}
.ficha-sheet .img-area{border:1px solid var(--navy);border-top:0;height:300px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fafafe;}
.ficha-sheet .img-area img{max-width:100%;max-height:100%;object-fit:contain;}
.ficha-sheet .img-vazio{color:#aeb3cc;font-size:11px;}
.ficha-sheet .tri{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;align-items:start;}
.ficha-sheet .w-num{width:34px;}.ficha-sheet .w-pts{width:38px;}.ficha-sheet .w-tctr{width:30px;}
.ficha-sheet .veloc-n{background:var(--navy);color:#fff;font-weight:bold;text-align:center;width:28px;}

/* Portal de impressão: escondido na tela, visível só no @media print. */
.fp-print-portal{display:none;}
@media print{
  html,body{background:#fff !important;}
  body>*:not(.fp-print-portal){display:none !important;}
  .fp-print-portal{display:block !important;}
  .fp-print-portal .ficha-sheet{width:100%;}
  @page{size:A4 portrait;margin:8mm;}
}
@media (max-width:820px){
  .fp-identi{grid-template-columns:1fr;}
  .fp-tri{grid-template-columns:1fr;}
  .ficha-sheet{font-size:12px;}
}
`;

// ── Folha no formato da ficha de papel (somente leitura) ────────────────────
function FichaSheet({ f }: { f: TFicha }) {
  const V = (s?: string) => <div className="cv">{s || ""}</div>;
  return (
    <div className="ficha-sheet">
      <div className="titulo">FICHA TÉCNICA DE PROGRAMA</div>
      <table className="cab"><tbody>
        <tr>
          <td style={{ width: "36%" }}><div className="campo"><span className="lab">CLIENTE:</span><span className="val">{f.cliente}</span></div></td>
          <td style={{ width: "40%" }}><div className="campo"><span className="lab">PROGRAMADOR:</span><span className="val">{f.programador}</span></div></td>
          <td style={{ width: "24%" }}><div className="campo"><span className="lab">DATA:</span><span className="val">{fmtData(f.data)}</span></div></td>
        </tr>
        <tr>
          <td><div className="campo"><span className="lab">Nº PROGRAMA:</span><span className="val">{f.numero}</span></div></td>
          <td><div className="campo"><span className="lab">MAQ. MODELO:</span><span className="val">{f.maquina}</span></div></td>
          <td><div className="campo"><span className="lab">GALGA:</span><span className="val">{f.galga}</span></div></td>
        </tr>
        <tr>
          <td><div className="campo"><span className="lab">DESCRIÇÃO:</span><span className="val">{f.descricao}</span></div></td>
          <td><div className="campo"><span className="lab">FIO:</span><span className="val">{f.fio}</span></div></td>
          <td></td>
        </tr>
      </tbody></table>

      <div className="topo" style={{ marginTop: 4 }}>
        <div>
          <table><tbody>
            <tr><th style={{ width: "30%" }}>PROGRAMA</th><th style={{ width: "50%" }}>DESCRIÇÃO</th><th style={{ width: "20%" }}>TEMPO</th></tr>
            {(f.programa || []).map((r, i) => (
              <tr key={i}><td>{V(r.programa)}</td><td>{V(r.descricao)}</td><td>{V(r.tempo)}</td></tr>
            ))}
          </tbody></table>
          <table style={{ marginTop: -1 }}><tbody>
            <tr>
              <td className="navy-cell" style={{ width: "24%" }}>PESO TOTAL:</td>
              <td style={{ width: "28%" }}>{V(f.peso_total)}</td>
              <td className="navy-cell" style={{ width: "26%" }}>TEMPO TOTAL:</td>
              <td>{V(f.tempo_total)}</td>
            </tr>
          </tbody></table>
        </div>
        <div>
          <table><tbody><tr><th>IMAGEM</th></tr></tbody></table>
          <div className="img-area">
            {f.imagem_key ? <img src={api.fichaImagemUrl(f.id)} alt="produto" /> : <span className="img-vazio">—</span>}
          </div>
        </div>
      </div>

      <div className="secao">GUIA FIOS</div>
      <table className="center"><tbody>
        <tr><th className="w-num">Nº</th><th style={{ width: "40%", textAlign: "left" }}>FIO</th><th style={{ width: "18%" }}>CABOS</th><th style={{ textAlign: "left" }}>FIO</th></tr>
        {(f.guia_fios || []).map((r, i) => (
          <tr key={i}><td className="w-num">{V(r.num)}</td><td style={{ textAlign: "left" }}><div className="cv">{r.fio || ""}</div></td><td>{V(r.cabos)}</td><td style={{ textAlign: "left" }}><div className="cv">{r.fio2 || ""}</div></td></tr>
        ))}
      </tbody></table>

      <div className="secao">ECONOMIZADOR</div>
      <table className="center"><tbody>
        <tr>
          <th className="w-num">Nº</th>
          {ECON_PRINT.map((lb, k) => (
            <React.Fragment key={k}><th style={{ textAlign: "left" }}>{lb}</th><th className="w-pts">PTS</th></React.Fragment>
          ))}
        </tr>
        {(f.economizador || []).map((r, i) => (
          <tr key={i}>
            <td className="w-num">{V(r.num)}</td>
            {ECON_COLS.map(([cn, cp], k) => (
              <React.Fragment key={k}>
                <td style={{ textAlign: "left" }}><div className="cv">{(r as Record<string, string>)[cn] || ""}</div></td>
                <td className="w-pts">{V((r as Record<string, string>)[cp])}</td>
              </React.Fragment>
            ))}
          </tr>
        ))}
      </tbody></table>

      <div className="tri" style={{ marginTop: 4 }}>
        <div>
          <div className="secao">GRADUAÇÃO</div>
          <table className="center"><tbody>
            <tr><th className="w-num">Nº</th><th style={{ textAlign: "left" }}>LOCALIZAÇÃO</th></tr>
            {(f.graduacao || []).map((r, i) => (
              <tr key={i}><td className="w-num">{V(r.num)}</td><td style={{ textAlign: "left" }}><div className="cv">{r.local || ""}</div></td></tr>
            ))}
          </tbody></table>
        </div>
        <div>
          <div className="secao">TAKE DOWN</div>
          <table className="center"><tbody>
            <tr><th className="w-tctr">TC</th><th className="w-tctr">TR</th><th style={{ textAlign: "left" }}>LOCALIZAÇÃO</th></tr>
            {(f.take_down || []).map((r, i) => (
              <tr key={i}><td className="w-tctr">{V(r.tc)}</td><td className="w-tctr">{V(r.tr)}</td><td style={{ textAlign: "left" }}><div className="cv">{r.local || ""}</div></td></tr>
            ))}
          </tbody></table>
        </div>
        <div>
          <div className="secao">VELOCIDADE</div>
          <table className="center"><tbody>
            <tr><th className="veloc-n">N</th><th className="w-pts">M/S</th><th style={{ textAlign: "left" }}>LOCAL</th></tr>
            {(f.velocidade || []).map((r, i) => (
              <tr key={i}><td className="veloc-n">{r.n}</td><td className="w-pts">{V(r.ms)}</td><td style={{ textAlign: "left" }}><div className="cv">{r.local || ""}</div></td></tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

// Campo com busca + autocomplete + adicionar novo (sem sair da ficha).
// A lista suspensa vai num portal (position:fixed) para não ser cortada pelas
// tabelas com rolagem horizontal.
type ComboOpt = { id: string; nome: string };
function Combo({ value, onChange, options, onAdd, cap, center, placeholder }: {
  value: string; onChange: (v: string) => void; options: ComboOpt[];
  onAdd?: (nome: string) => Promise<string | null>; cap?: boolean; center?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const inpRef = useRef<HTMLInputElement | null>(null);
  const nq = normKey(value);
  const matches = options.filter((o) => !nq || normKey(o.nome).includes(nq)).slice(0, 8);
  const exact = options.some((o) => normKey(o.nome) === nq);
  const showAdd = !!onAdd && nq.length > 0 && !exact;
  const nItems = matches.length + (showAdd ? 1 : 0);

  function medir() { const el = inpRef.current; if (el) { const r = el.getBoundingClientRect(); setRect({ top: r.bottom + 2, left: r.left, width: r.width }); } }
  function abrir() { medir(); setOpen(true); }
  function pick(nome: string) { onChange(nome); setOpen(false); }
  async function doAdd() { if (!onAdd) return; const nome = cap ? capFirst(value) : value.trim(); const r = await onAdd(nome).catch(() => null); pick(r || nome); }
  function onKey(e: React.KeyboardEvent) {
    if (!open || nItems === 0) { if (e.key === "Escape") setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, nItems - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (hi < matches.length) pick(matches[hi].nome); else if (showAdd) doAdd(); }
    else if (e.key === "Escape") setOpen(false);
  }
  function onBlur() { window.setTimeout(() => setOpen(false), 150); if (cap && value) { const c = capFirst(value); if (c !== value) onChange(c); } }
  useEffect(() => { setHi(0); }, [value, open]);
  useEffect(() => {
    if (!open) return;
    const fechar = () => setOpen(false);
    window.addEventListener("scroll", fechar, true); window.addEventListener("resize", fechar);
    return () => { window.removeEventListener("scroll", fechar, true); window.removeEventListener("resize", fechar); };
  }, [open]);

  return (
    <div className="fp-combo">
      <input ref={inpRef} value={value} placeholder={placeholder} className={center ? "fp-ctr" : undefined}
        onChange={(e) => { onChange(e.target.value); if (!open) abrir(); else medir(); }}
        onFocus={abrir} onBlur={onBlur} onKeyDown={onKey} autoComplete="off" />
      {open && nItems > 0 && rect && createPortal(
        <div className="fp-combo-pop" style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}>
          {matches.map((o, i) => (
            <div key={o.id} className={"fp-combo-opt" + (i === hi ? " hi" : "")}
              onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); pick(o.nome); }}>{o.nome}</div>
          ))}
          {showAdd && (
            <div className={"fp-combo-opt fp-combo-add" + (hi === matches.length ? " hi" : "")}
              onMouseEnter={() => setHi(matches.length)} onMouseDown={(e) => { e.preventDefault(); doAdd(); }}>
              + Adicionar “{cap ? capFirst(value) : value.trim()}”
            </div>
          )}
        </div>, document.body)}
    </div>
  );
}

export function FichaPrograma() {
  const [lista, setLista] = useState<FichaProgramaResumo[] | null>(null);
  const [maquinas, setMaquinas] = useState<FichaItemLista[]>([]);
  const [galgas, setGalgas] = useState<FichaItemLista[]>([]);
  const [fios, setFios] = useState<FichaItemLista[]>([]);
  const [termos, setTermos] = useState<Record<string, FichaItemLista[]>>({});
  const [editando, setEditando] = useState<TFicha | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [gerenciando, setGerenciando] = useState(false);
  const [preview, setPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [imgBust, setImgBust] = useState(0);

  function carregarLista() { setLista(null); api.fichasListar().then(setLista).catch((e) => setErro((e as Error).message)); }
  function carregarListas() {
    api.fichasMaquinas().then(setMaquinas).catch(() => {});
    api.fichasGalgas().then(setGalgas).catch(() => {});
    api.fichasFios().then(setFios).catch(() => {});
    TIPOS_TERMO.forEach((t) => api.fichasTermos(t).then((l) => setTermos((m) => ({ ...m, [t]: l }))).catch(() => {}));
  }
  // Adiciona um termo novo (sem sair da ficha) e deixa disponível na lista local.
  async function addFio(nome: string): Promise<string | null> { try { const r = await api.fichaFioAdd(nome); setFios((l) => l.some((x) => x.id === r.id) ? l : [...l, { id: r.id, nome: r.nome }]); return r.nome; } catch { return null; } }
  async function addTermo(tipo: string, nome: string): Promise<string | null> { try { const r = await api.fichaTermoAdd(tipo, nome); setTermos((m) => { const cur = m[tipo] || []; return cur.some((x) => x.id === r.id) ? m : { ...m, [tipo]: [...cur, { id: r.id, nome: r.nome }] }; }); return r.nome; } catch { return null; } }
  async function addMaquinaCombo(nome: string): Promise<string | null> { try { await api.fichaMaquinaAdd(nome); const l = await api.fichasMaquinas(); setMaquinas(l); return nome; } catch { return null; } }
  async function addGalgaCombo(nome: string): Promise<string | null> { try { await api.fichaGalgaAdd(nome); const l = await api.fichasGalgas(); setGalgas(l); return nome; } catch { return null; } }
  useEffect(() => { carregarLista(); carregarListas(); }, []);

  function abrirNova() { setErro(""); setEditando(normalizar(novaFicha())); setImgBust(0); }
  function abrir(id: string) { setErro(""); api.fichaObter(id).then((f) => { setEditando(normalizar(f)); setImgBust(Date.now()); }).catch((e) => setErro((e as Error).message)); }
  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir a ficha ${nome || ""}? Esta ação não pode ser desfeita.`)) return;
    try { await api.fichaExcluir(id); carregarLista(); } catch (e) { alert((e as Error).message); }
  }

  function set<K extends keyof TFicha>(k: K, v: TFicha[K]) { setEditando((f) => (f ? { ...f, [k]: v } : f)); }
  function setLinha<T>(k: keyof TFicha, i: number, campo: keyof T, v: string) {
    setEditando((f) => {
      if (!f) return f;
      const arr = [...(f[k] as unknown as T[])];
      arr[i] = { ...(arr[i] as T), [campo]: v } as T;
      return { ...f, [k]: arr } as TFicha;
    });
  }
  function addLinha(k: keyof TFicha, mk: () => unknown) { setEditando((f) => (f ? { ...f, [k]: [...(f[k] as unknown[]), mk()] } as TFicha : f)); }
  function delLinha(k: keyof TFicha, i: number) {
    setEditando((f) => { if (!f) return f; const arr = (f[k] as unknown[]).filter((_, j) => j !== i); return { ...f, [k]: arr.length ? arr : [mkVazia(k)] } as TFicha; });
  }
  function mkVazia(k: keyof TFicha): unknown {
    switch (k) { case "programa": return mkPrograma(); case "guia_fios": return mkGuia(); case "economizador": return mkEcon(); case "graduacao": return mkGrad(); case "take_down": return mkTake(); default: return {}; }
  }

  async function salvar(): Promise<TFicha | null> {
    if (!editando) return null;
    setSalvando(true); setErro("");
    try { const payload = padronizar(editando); setEditando(payload); const r = await api.fichaSalvar(payload); const f = normalizar(r.ficha); setEditando(f); carregarLista(); return f; }
    catch (e) { setErro((e as Error).message); return null; }
    finally { setSalvando(false); }
  }
  async function salvarEImprimir() { const f = await salvar(); if (f) setTimeout(() => window.print(), 120); }

  async function escolherImagem(file: File) {
    let f = editando; if (!f) return;
    if (!f.id) { f = await salvar(); if (!f) return; }
    try { await api.fichaImagemUpload(f.id, file); setEditando((cur) => (cur ? { ...cur, imagem_key: `ficha/${f!.id}` } : cur)); setImgBust(Date.now()); }
    catch (e) { alert((e as Error).message); }
  }

  // ── LISTA ─────────────────────────────────────────────────────────────
  if (!editando) {
    return (
      <div className="fp-wrap">
        <style>{CSS}</style>
        <div className="fp-top">
          <div>
            <h1 className="fp-h1">Ficha Técnica de Programa</h1>
            <div className="fp-sub">Cadastre o programa de tricô e gere o PDF da ficha para preencher/imprimir.</div>
          </div>
          <div className="sp" />
          <button className="btn" onClick={() => setGerenciando((v) => !v)}>Máquinas e galgas</button>
          <button className="btn btn-primary" onClick={abrirNova}>Nova ficha</button>
        </div>

        {gerenciando && <GerenciarListas maquinas={maquinas} galgas={galgas} onChange={carregarListas} />}
        {erro && <div className="aviso aviso-warn">{erro}</div>}

        <div className="fp-card" style={{ padding: 0, overflow: "hidden" }}>
          {lista === null ? (
            <div style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>Carregando…</div>
          ) : lista.length === 0 ? (
            <div style={{ padding: 34, textAlign: "center", color: "var(--muted)" }}>Nenhuma ficha cadastrada ainda.<br />Clique em <b>Nova ficha</b> para começar.</div>
          ) : (
            <table className="table" style={{ width: "100%" }}>
              <thead><tr><th style={{ width: 100 }}>Nº</th><th>Cliente</th><th>Descrição</th><th>Máquina</th><th>Galga</th><th style={{ width: 110 }}>Data</th><th style={{ width: 150 }}></th></tr></thead>
              <tbody>
                {lista.map((f) => (
                  <tr key={f.id}>
                    <td><button className="btn-link" style={{ background: "none", border: 0, color: "var(--brand1)", fontWeight: 800, cursor: "pointer", padding: 0 }} onClick={() => abrir(f.id)}>{f.numero || "—"}</button></td>
                    <td>{f.cliente || "—"}</td><td>{f.descricao || "—"}</td><td>{f.maquina || "—"}</td><td>{f.galga || "—"}</td><td>{fmtData(f.data)}</td>
                    <td>
                      <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => abrir(f.id)}>Abrir</button>
                      <button className="btn" style={{ padding: "4px 10px", fontSize: 12, marginLeft: 6, color: "#b91c1c", borderColor: "#f3c3c3" }} onClick={() => excluir(f.id, f.numero || "")}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ── EDITOR (tela bonita) ──────────────────────────────────────────────
  const f = editando;
  const campo = (label: string, node: React.ReactNode, col2 = false) => (
    <div className={"fp-field" + (col2 ? " col2" : "")}><label>{label}</label>{node}</div>
  );
  const txt = (k: keyof TFicha, ph = "", cap = false) => (
    <input value={(f[k] as string) || ""} placeholder={ph}
      onChange={(e) => set(k, e.target.value as TFicha[typeof k])}
      onBlur={cap ? () => { const v = (f[k] as string) || ""; const cc = capFirst(v); if (cc !== v) set(k, cc as TFicha[typeof k]); } : undefined} />
  );

  return (
    <div className="fp-wrap">
      <style>{CSS}</style>
      <div className="fp-top">
        <button className="btn" onClick={() => { setEditando(null); carregarLista(); }}>← Voltar</button>
        <h1 className="fp-eh1">Ficha Técnica de Programa{f.numero ? ` · ${f.numero}` : ""}</h1>
        <div className="sp" />
        {erro && <span className="fp-err">{erro}</span>}
        <button className="btn" onClick={() => setPreview(true)}>Pré-visualizar</button>
        <button className="btn btn-soft" onClick={salvarEImprimir} disabled={salvando}>Imprimir / PDF</button>
        <button className="btn btn-primary" onClick={() => salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const file = e.target.files?.[0]; if (file) escolherImagem(file); e.target.value = ""; }} />

      {/* IDENTIFICAÇÃO + IMAGEM */}
      <div className="fp-card">
        <div className="fp-ch">Identificação</div>
        <div className="fp-identi">
          <div className="fp-fgrid">
            {campo("Cliente", txt("cliente", "Nome do cliente", true))}
            {campo("Nº Programa", txt("numero", "ex.: AN289"))}
            {campo("Descrição", txt("descricao", "ex.: Vestido", true))}
            {campo("Programador", txt("programador", "Quem programou", true))}
            {campo("Máq. modelo", (
              <Combo value={f.maquina || ""} onChange={(v) => set("maquina", v)} options={maquinas} onAdd={addMaquinaCombo} placeholder="Buscar ou cadastrar…" />
            ))}
            {campo("Galga", (
              <Combo value={f.galga || ""} onChange={(v) => set("galga", v)} options={galgas} onAdd={addGalgaCombo} placeholder="Buscar ou cadastrar…" />
            ))}
            {campo("Fio", txt("fio", "ex.: Powerbrite + Lurex", true))}
            {campo("Data", <input type="date" value={f.data || ""} onChange={(e) => set("data", e.target.value)} />)}
          </div>
          <div className="fp-field">
            <label>Imagem do produto</label>
            <div className="fp-drop" onClick={() => fileRef.current?.click()}>
              {f.imagem_key ? (
                <>
                  <img src={api.fichaImagemUrl(f.id) + "?t=" + imgBust} alt="produto" />
                  <button className="rm" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>Trocar</button>
                </>
              ) : (<><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg><div>Clique para enviar a foto<br />do produto</div></>)}
            </div>
          </div>
        </div>
      </div>

      {/* PROGRAMA */}
      <div className="fp-card">
        <div className="fp-ch">Programa <span className="hint">passos do programa</span></div>
        <div className="fp-scroll">
          <table className="fp-tbl"><thead><tr><th style={{ width: "28%" }}>Programa</th><th style={{ width: "50%" }}>Descrição</th><th>Tempo</th><th className="c-rm"></th></tr></thead>
            <tbody>
              {(f.programa || []).map((r, i) => (
                <tr key={i}>
                  <td><Combo value={r.programa || ""} onChange={(v) => setLinha<FichaProgramaLinha>("programa", i, "programa", v)} options={termos.programa || []} onAdd={(n) => addTermo("programa", n)} cap /></td>
                  <td><input value={r.descricao || ""} onChange={(e) => setLinha<FichaProgramaLinha>("programa", i, "descricao", e.target.value)} onBlur={(e) => { const cc = capFirst(e.target.value); if (cc !== (r.descricao || "")) setLinha<FichaProgramaLinha>("programa", i, "descricao", cc); }} /></td>
                  <td><input value={r.tempo || ""} onChange={(e) => setLinha<FichaProgramaLinha>("programa", i, "tempo", e.target.value)} /></td>
                  <td className="c-rm"><button className="icon-btn danger" title="remover" onClick={() => delLinha("programa", i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fp-addrow"><button className="btn btn-soft" onClick={() => addLinha("programa", mkPrograma)}>+ linha</button></div>
        <div className="fp-fgrid" style={{ marginTop: 14, maxWidth: 420 }}>
          {campo("Peso total", txt("peso_total"))}
          {campo("Tempo total", txt("tempo_total"))}
        </div>
      </div>

      {/* GUIA FIOS */}
      <div className="fp-card">
        <div className="fp-ch">Guia de fios</div>
        <div className="fp-scroll">
          <table className="fp-tbl"><thead><tr><th className="c-num">Nº</th><th style={{ width: "40%" }}>Fio</th><th className="c-num">Cabos</th><th>Fio (2)</th><th className="c-rm"></th></tr></thead>
            <tbody>
              {(f.guia_fios || []).map((r, i) => (
                <tr key={i}>
                  <td className="c-num"><input value={r.num || ""} onChange={(e) => setLinha<FichaGuiaFio>("guia_fios", i, "num", e.target.value)} /></td>
                  <td><Combo value={r.fio || ""} onChange={(v) => setLinha<FichaGuiaFio>("guia_fios", i, "fio", v)} options={fios} onAdd={addFio} cap /></td>
                  <td className="c-num"><input value={r.cabos || ""} onChange={(e) => setLinha<FichaGuiaFio>("guia_fios", i, "cabos", e.target.value)} /></td>
                  <td><Combo value={r.fio2 || ""} onChange={(v) => setLinha<FichaGuiaFio>("guia_fios", i, "fio2", v)} options={fios} onAdd={addFio} cap /></td>
                  <td className="c-rm"><button className="icon-btn danger" title="remover" onClick={() => delLinha("guia_fios", i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fp-addrow"><button className="btn btn-soft" onClick={() => addLinha("guia_fios", mkGuia)}>+ linha</button></div>
      </div>

      {/* ECONOMIZADOR */}
      <div className="fp-card">
        <div className="fp-ch">Economizador</div>
        <div className="fp-scroll">
          <table className="fp-tbl" style={{ minWidth: 760 }}>
            <thead><tr>
              <th className="c-num">Nº</th>
              {ECON_TELA.map((lb, k) => (<React.Fragment key={k}><th>{lb}</th><th className="c-pts">Pts</th></React.Fragment>))}
              <th className="c-rm"></th>
            </tr></thead>
            <tbody>
              {(f.economizador || []).map((r, i) => (
                <tr key={i}>
                  <td className="c-num"><input value={r.num || ""} onChange={(e) => setLinha<FichaEconomizador>("economizador", i, "num", e.target.value)} /></td>
                  {ECON_COLS.map(([cn, cp], k) => (
                    <React.Fragment key={k}>
                      <td><Combo value={(r as Record<string, string>)[cn] || ""} onChange={(v) => setLinha<FichaEconomizador>("economizador", i, cn, v)} options={termos.economizador || []} onAdd={(n) => addTermo("economizador", n)} cap /></td>
                      <td className="c-pts"><input value={(r as Record<string, string>)[cp] || ""} onChange={(e) => setLinha<FichaEconomizador>("economizador", i, cp, e.target.value)} /></td>
                    </React.Fragment>
                  ))}
                  <td className="c-rm"><button className="icon-btn danger" title="remover" onClick={() => delLinha("economizador", i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fp-addrow"><button className="btn btn-soft" onClick={() => addLinha("economizador", mkEcon)}>+ linha</button></div>
      </div>

      {/* GRADUAÇÃO · TAKE DOWN · VELOCIDADE */}
      <div className="fp-tri">
        <div className="fp-card">
          <div className="fp-ch">Graduação</div>
          <table className="fp-tbl"><thead><tr><th className="c-num">Nº</th><th>Localização</th><th className="c-rm"></th></tr></thead>
            <tbody>
              {(f.graduacao || []).map((r, i) => (
                <tr key={i}>
                  <td className="c-num"><input value={r.num || ""} onChange={(e) => setLinha<FichaGraduacao>("graduacao", i, "num", e.target.value)} /></td>
                  <td><Combo value={r.local || ""} onChange={(v) => setLinha<FichaGraduacao>("graduacao", i, "local", v)} options={termos.stitch || []} onAdd={(n) => addTermo("stitch", n)} cap /></td>
                  <td className="c-rm"><button className="icon-btn danger" onClick={() => delLinha("graduacao", i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="fp-addrow"><button className="btn btn-soft" onClick={() => addLinha("graduacao", mkGrad)}>+ linha</button></div>
        </div>
        <div className="fp-card">
          <div className="fp-ch">Take down</div>
          <table className="fp-tbl"><thead><tr><th className="c-tctr">TC</th><th className="c-tctr">TR</th><th>Localização</th><th className="c-rm"></th></tr></thead>
            <tbody>
              {(f.take_down || []).map((r, i) => (
                <tr key={i}>
                  <td className="c-tctr"><input value={r.tc || ""} onChange={(e) => setLinha<FichaTakeDown>("take_down", i, "tc", e.target.value)} /></td>
                  <td className="c-tctr"><input value={r.tr || ""} onChange={(e) => setLinha<FichaTakeDown>("take_down", i, "tr", e.target.value)} /></td>
                  <td><Combo value={r.local || ""} onChange={(v) => setLinha<FichaTakeDown>("take_down", i, "local", v)} options={termos.puxamento || []} onAdd={(n) => addTermo("puxamento", n)} cap /></td>
                  <td className="c-rm"><button className="icon-btn danger" onClick={() => delLinha("take_down", i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="fp-addrow"><button className="btn btn-soft" onClick={() => addLinha("take_down", mkTake)}>+ linha</button></div>
        </div>
        <div className="fp-card">
          <div className="fp-ch">Velocidade</div>
          <table className="fp-tbl"><thead><tr><th className="c-vn">N</th><th className="c-pts">M/S</th><th>Local</th></tr></thead>
            <tbody>
              {(f.velocidade || []).map((r, i) => (
                <tr key={i}>
                  <td className="c-vn">{r.n}</td>
                  <td className="c-pts"><input value={r.ms || ""} onChange={(e) => setLinha<FichaVelocidade>("velocidade", i, "ms", e.target.value)} /></td>
                  <td><Combo value={r.local || ""} onChange={(v) => setLinha<FichaVelocidade>("velocidade", i, "local", v)} options={termos.velocidade || []} onAdd={(n) => addTermo("velocidade", n)} cap /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="fp-mini" style={{ marginTop: 8 }}>A coluna N já vem fixa (igual à ficha).</div>
        </div>
      </div>

      {/* Pré-visualização (modal) */}
      {preview && (
        <div className="fp-mback" onClick={() => setPreview(false)}>
          <div className="fp-mbar" onClick={(e) => e.stopPropagation()} style={{ width: "min(210mm,100%)" }}>
            <span>Pré-visualização do PDF</span><div className="sp" />
            <button className="btn btn-soft" onClick={() => window.print()}>Imprimir / PDF</button>
            <button className="btn" onClick={() => setPreview(false)}>Fechar</button>
          </div>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(210mm,100%)", background: "#fff", boxShadow: "0 10px 40px #0008", borderRadius: 4, padding: "6mm" }}>
            <FichaSheet f={paraImpressao(f)} />
          </div>
        </div>
      )}

      {/* Portal de impressão (só aparece no PDF / impressão) */}
      {createPortal(
        <div className="fp-print-portal"><div style={{ padding: "4mm" }}><FichaSheet f={paraImpressao(f)} /></div></div>,
        document.body
      )}
    </div>
  );
}

// Gerência das listas de máquina e galga.
function GerenciarListas({ maquinas, galgas, onChange }: { maquinas: FichaItemLista[]; galgas: FichaItemLista[]; onChange: () => void }) {
  const [nm, setNm] = useState(""); const [ng, setNg] = useState("");
  async function addM() { const n = nm.trim(); if (!n) return; await api.fichaMaquinaAdd(n); setNm(""); onChange(); }
  async function addG() { const n = ng.trim(); if (!n) return; await api.fichaGalgaAdd(n); setNg(""); onChange(); }
  async function delM(id: string) { if (confirm("Remover máquina?")) { await api.fichaMaquinaDel(id); onChange(); } }
  async function delG(id: string) { if (confirm("Remover galga?")) { await api.fichaGalgaDel(id); onChange(); } }
  const col = (titulo: string, itens: FichaItemLista[], val: string, setVal: (s: string) => void, add: () => void, del: (id: string) => void, ph: string) => (
    <div style={{ flex: 1, minWidth: 230 }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={ph} style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={add}>Adicionar</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {itens.length === 0 ? <span style={{ color: "var(--muted)", fontSize: 13 }}>nenhum cadastrado</span> :
          itens.map((it) => (
            <span key={it.id} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--line)", borderRadius: 999, padding: "4px 7px 4px 12px", fontSize: 13 }}>
              {it.nome}<button onClick={() => del(it.id)} title="remover" style={{ background: "none", border: 0, color: "#b91c1c", cursor: "pointer", fontWeight: 700 }}>×</button>
            </span>
          ))}
      </div>
    </div>
  );
  return (
    <div className="fp-card" style={{ display: "flex", flexWrap: "wrap", gap: 28 }}>
      {col("Máquinas (modelos)", maquinas, nm, setNm, addM, delM, "ex.: SSR 07")}
      {col("Galgas", galgas, ng, setNg, addG, delG, "ex.: 12")}
    </div>
  );
}
