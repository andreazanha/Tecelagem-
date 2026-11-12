import { useEffect, useMemo, useRef, useState } from "react";
import { api, type CardExpedicao, type ConferenciaExpedicao, type PecaExpedicao } from "../api";
import { opCodigo } from "../expedicaoUtil";
import { getUser } from "../auth";
import { svgBarcode } from "../barcode";
import { svgQR } from "../qrPrint";
import { LeitorCamera } from "./LeitorCamera";

// Conferência de Expedição (bipagem peça a peça). Cada peça do pedido tem um
// CÓDIGO ÚNICO. O operador bipa cada peça; cada código conta UMA vez só (impede
// bipar a mesma peça várias vezes) e o "Expedir" só libera quando TODAS as peças
// foram bipadas. Controle 100% interno — NADA é escrito no Syntech.

type Feedback = { tipo: "ok" | "aviso" | "erro"; msg: string } | null;

// Agrupa peças iguais (mesmo produto/tipo/tamanho/cor) para mostrar "bipado/total".
function chaveGrupo(p: PecaExpedicao): string {
  return [p.produto, p.tipo, p.tamanho, p.cor || ""].join("|");
}

export function ConferenciaExpedicaoModal({
  card,
  onFechar,
  onConcluir,
}: {
  card: CardExpedicao;
  onFechar: () => void;
  onConcluir: () => void;
}) {
  const [conf, setConf] = useState<ConferenciaExpedicao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [ocupado, setOcupado] = useState(false);
  const [camera, setCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const admin = !!getUser()?.admin;

  function carregar(regerar?: boolean) {
    setCarregando(true);
    api
      .pecasExpedicao(card.pedido_id, regerar)
      .then((d) => { setConf(d); setErro(null); })
      .catch(() => setErro("Não consegui carregar as peças deste pedido."))
      .finally(() => { setCarregando(false); foco(); });
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [card.pedido_id]);

  function foco() { setTimeout(() => inputRef.current?.focus(), 30); }

  // Marca uma peça como bipada (ou não) no estado local, sem recarregar tudo.
  function aplicar(codigo: string, bipado: boolean, total?: number, bipados?: number) {
    setConf((c) =>
      c
        ? {
            ...c,
            total: total ?? c.total,
            bipados: bipados ?? c.bipados,
            pecas: c.pecas.map((p) => (p.codigo === codigo ? { ...p, bipado } : p)),
          }
        : c
    );
  }

  async function bipar(bruto: string) {
    const codigo = bruto.trim();
    setValor("");
    if (!codigo || ocupado) { foco(); return; }
    setOcupado(true);
    try {
      const r = await api.biparPeca(card.pedido_id, codigo);
      if (r.status === "ok") {
        aplicar(codigo, true, r.total, r.bipados);
        const p = r.peca;
        setFeedback({ tipo: "ok", msg: `✓ Bipada: ${p ? `${p.tipo} ${p.tamanho} · ${p.cor || ""}`.trim() : codigo}` });
      } else if (r.status === "ja_bipada") {
        setFeedback({ tipo: "aviso", msg: `⚠ Essa peça já foi bipada (${codigo}). Não conta de novo.` });
      } else if (r.status === "outro_pedido") {
        setFeedback({ tipo: "erro", msg: `✗ O código ${codigo} NÃO é deste pedido.` });
      } else if (r.status === "desconhecido") {
        setFeedback({ tipo: "erro", msg: `✗ Código ${codigo} não reconhecido. Confira a etiqueta.` });
      } else {
        setFeedback({ tipo: "erro", msg: "Código vazio." });
      }
    } catch {
      setFeedback({ tipo: "erro", msg: "Falha ao bipar. Tente de novo." });
    } finally {
      setOcupado(false);
      foco();
    }
  }

  // Desfaz a bipagem de uma peça (correção de engano).
  async function desbipar(p: PecaExpedicao) {
    if (!p.bipado) return;
    try {
      const r = await api.desbiparPeca(card.pedido_id, p.codigo);
      aplicar(p.codigo, false, r.total, r.bipados);
      setFeedback({ tipo: "aviso", msg: `Desfeito: ${p.tipo} ${p.tamanho} voltou para "falta bipar".` });
    } catch { /* ok */ }
    foco();
  }

  const grupos = useMemo(() => {
    const m = new Map<string, { amostra: PecaExpedicao; pecas: PecaExpedicao[] }>();
    for (const p of conf?.pecas || []) {
      const k = chaveGrupo(p);
      if (!m.has(k)) m.set(k, { amostra: p, pecas: [] });
      m.get(k)!.pecas.push(p);
    }
    return [...m.values()];
  }, [conf]);

  const total = conf?.total ?? 0;
  const bipados = conf?.bipados ?? 0;
  const semPecas = !carregando && !erro && total === 0;
  // Sem peças cadastradas = não há o que conferir; libera a expedição (não trava).
  const completo = semPecas || (total > 0 && bipados >= total);
  const pct = total ? Math.round((bipados / total) * 100) : 0;

  // Imprime as etiquetas com o CÓDIGO ÚNICO (uma por peça) — rolo térmico 50×30mm.
  function imprimirEtiquetas() {
    const pecas = conf?.pecas || [];
    if (!pecas.length) { alert("Este pedido não tem peças para etiquetar."); return; }
    const W = 50, H = 30; // mm
    const et = (p: PecaExpedicao) => `
      <div class="et">
        <div class="mod">${p.produto}</div>
        <div class="lin"><b>${p.tipo} ${p.tamanho}</b></div>
        <div class="lin">Cor: <b>${p.cor || "—"}</b>${p.ref ? ` · ${p.ref}` : ""}</div>
        <div class="cods">
          <div class="bc">${svgBarcode(p.codigo, { height: 26, width: 1.2, fontSize: 12 })}</div>
          <div class="qr">${svgQR(p.codigo)}</div>
        </div>
      </div>`;
    const body = pecas
      .map((p) => `<div class="pg" style="width:${W}mm;height:${H}mm">${et(p)}</div>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas de expedição</title><style>
      @page { size: ${W}mm ${H}mm; margin: 0; } *{box-sizing:border-box} body{margin:0;font-family:Arial,Helvetica,sans-serif}
      .pg{position:relative;overflow:hidden;page-break-after:always}
      .et{width:100%;height:100%;padding:1.5mm 2mm;display:flex;flex-direction:column}
      .et .mod{font-size:8pt;font-weight:700;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .et .lin{font-size:8pt;line-height:1.15}
      .et .cods{margin-top:auto;display:flex;align-items:flex-end;gap:1.5mm;width:100%;height:52%}
      .et .cods .bc{flex:1;min-width:0;height:100%;line-height:0}
      .et .cods .bc svg{display:block;width:100%;height:100%}
      .et .cods .qr{width:13mm;height:13mm;flex:none}
      .et .cods .qr svg{display:block;width:100%;height:100%}
    </style></head><body>${body}<script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-card" style={{ maxWidth: 760, padding: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className={"modal-hd " + (completo ? "kit" : "unica")}>
          <div className="modal-hd-top">
            <span className="modal-pills">
              <span className="modal-pill">{opCodigo(card)}</span>
              <span className="modal-pill">📦 Conferência de Expedição</span>
            </span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-row">
            <span className="modal-cli">{card.cliente_nome}</span>
            <span className={"conf-chip " + (completo ? "ok" : "")}>{bipados} / {total} peças</span>
          </div>
        </div>

        <div className="modal-bd">
          {carregando ? (
            <div className="card pad">Carregando peças…</div>
          ) : erro ? (
            <div className="conf-fb erro">{erro}</div>
          ) : (
            <>
              <div className="conf-barra"><div className="conf-barra-fill" style={{ width: pct + "%" }} /></div>

              {feedback && <div className={"conf-fb " + feedback.tipo}>{feedback.msg}</div>}

              {semPecas ? (
                <div className="conf-fb aviso">Este pedido não tem peças cadastradas para conferir. Você pode expedir normalmente.</div>
              ) : !completo ? (
                <div className="conf-scan">
                  <div className="conf-scan-row">
                    <input
                      ref={inputRef}
                      className="conf-input"
                      placeholder="Bipe o código da peça (leitor USB) e aperte Enter…"
                      value={valor}
                      autoFocus
                      disabled={ocupado}
                      onChange={(e) => setValor(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); bipar(valor); } }}
                      onBlur={() => { if (!completo && !camera) foco(); }}
                    />
                    <button
                      className={"conf-cam-btn" + (camera ? " on" : "")}
                      onClick={() => setCamera((v) => !v)}
                      title="Ler o QR da peça com a câmera do celular"
                    >
                      📷 {camera ? "Fechar câmera" : "Câmera"}
                    </button>
                  </div>
                  {camera && (
                    <LeitorCamera
                      onCodigo={(txt) => bipar(txt)}
                      onErro={(m) => { setFeedback({ tipo: "erro", msg: m }); setCamera(false); }}
                    />
                  )}
                  <div className="conf-dica">Leia pelo <b>celular (câmera, QR)</b> ou pelo <b>leitor USB</b> (código de barras). <b>Cada código vale uma vez</b> — bipar a mesma peça de novo avisa “já bipada”.</div>
                </div>
              ) : (
                <div className="conf-fb ok" style={{ fontSize: 15 }}>✅ Todas as {total} peças foram conferidas. Pode expedir!</div>
              )}

              <div className="conf-grupos">
                {grupos.map((g) => {
                  const tot = g.pecas.length;
                  const bip = g.pecas.filter((p) => p.bipado).length;
                  const full = bip >= tot;
                  return (
                    <div className={"conf-grp " + (full ? "full" : "")} key={chaveGrupo(g.amostra)}>
                      <div className="conf-grp-hd">
                        <div className="conf-grp-nome">
                          <b>{g.amostra.tipo} {g.amostra.tamanho}</b>
                          <span className="conf-grp-sub">{g.amostra.produto}{g.amostra.cor ? ` · ${g.amostra.cor}` : ""}</span>
                        </div>
                        <span className={"conf-grp-cont " + (full ? "ok" : "")}>{bip}/{tot}</span>
                      </div>
                      <div className="conf-dots">
                        {g.pecas.map((p) => (
                          <button
                            key={p.codigo}
                            className={"conf-dot " + (p.bipado ? "on" : "")}
                            title={p.bipado ? `Bipada (${p.codigo}) — clique p/ desfazer` : `Falta bipar (${p.codigo})`}
                            onClick={() => p.bipado && desbipar(p)}
                          >
                            {p.bipado ? "✓" : "○"}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="modal-ft">
          <button className="btn btn-soft" onClick={imprimirEtiquetas}>🖨️ Imprimir etiquetas (código único)</button>
          {admin && !carregando && bipados === 0 && (
            <button className="btn btn-soft" onClick={() => carregar(true)} title="Refaz os códigos deste pedido (só enquanto nada foi bipado)">↻ Refazer códigos</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onFechar}>Fechar</button>
          <button className="kbtn tecer" disabled={!completo} onClick={onConcluir} title={completo ? "" : "Bipe todas as peças para liberar"}>
            ✅ Expedir
          </button>
        </div>
      </div>
    </div>
  );
}
