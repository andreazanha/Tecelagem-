import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ConferenciaExpedicao, type PecaExpedicao, type FaseConf } from "../api";
import { getUser } from "../auth";
import { svgBarcode } from "../barcode";
import { svgQR } from "../qrPrint";
import { LeitorCamera } from "./LeitorCamera";

// Conferência por bipagem — serve às DUAS fases (a `fase` decide os textos):
//  • separacao = bipa o que sai do ESTOQUE (kit inteiro + avulsa) — só pronta entrega,
//    feito pelo CELULAR (o computador fica longe do estoque).
//  • expedicao = bipa cada PEÇA física que sai (kit explodido + avulsas) — tudo.
// Cada código conta UMA vez só; o botão de concluir só libera quando tudo foi
// bipado. Controle 100% interno — NADA é escrito no Syntech.

type Feedback = { tipo: "ok" | "aviso" | "erro"; msg: string } | null;

const CFG: Record<FaseConf, {
  pill: string; unidade: string; acao: string; etiqueta: string;
  sucesso: (n: number) => string; semItens: string; faltaLiberar: string;
}> = {
  expedicao: {
    pill: "📦 Conferência de Expedição",
    unidade: "peças",
    acao: "✅ Expedir",
    etiqueta: "🖨️ Etiquetas das peças",
    sucesso: (n) => `✅ Todas as ${n} peças foram conferidas. Pode expedir!`,
    semItens: "Este pedido não tem peças para conferir. Você pode expedir normalmente.",
    faltaLiberar: "Bipe todas as peças para liberar",
  },
  separacao: {
    pill: "📋 Separação (bipar estoque)",
    unidade: "itens",
    acao: "✅ Separado ▶ Revisão",
    etiqueta: "🖨️ Etiquetas (kit / avulso)",
    sucesso: (n) => `✅ Tudo separado (${n}). Pode mandar pra Revisão!`,
    semItens: "Este pedido não tem itens de estoque para separar.",
    faltaLiberar: "Bipe todos os itens para liberar",
  },
};

// Agrupa unidades iguais (mesmo produto/tipo/tamanho/cor) para mostrar "bipado/total".
function chaveGrupo(p: PecaExpedicao): string {
  return [p.produto, p.tipo, p.tamanho, p.cor || ""].join("|");
}

export function ConferenciaBipagemModal({
  pedidoId,
  cliente,
  codigoPedido,
  fase,
  onFechar,
  onConcluir,
}: {
  pedidoId: string;
  cliente: string | null;
  codigoPedido: string;
  fase: FaseConf;
  onFechar: () => void;
  onConcluir: () => void;
}) {
  const t = CFG[fase];
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
      .conferencia(pedidoId, fase, regerar)
      .then((d) => { setConf(d); setErro(null); })
      .catch(() => setErro("Não consegui carregar os itens deste pedido."))
      .finally(() => { setCarregando(false); foco(); });
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [pedidoId, fase]);

  function foco() { setTimeout(() => inputRef.current?.focus(), 30); }

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
      const r = await api.biparConferencia(pedidoId, fase, codigo);
      if (r.status === "ok") {
        aplicar(codigo, true, r.total, r.bipados);
        const p = r.peca;
        setFeedback({ tipo: "ok", msg: `✓ Bipado: ${p ? `${p.tipo} ${p.tamanho} · ${p.cor || ""}`.trim() : codigo}` });
      } else if (r.status === "ja_bipada") {
        setFeedback({ tipo: "aviso", msg: `⚠ Esse item já foi bipado (${codigo}). Não conta de novo.` });
      } else if (r.status === "nivel_errado") {
        setFeedback({ tipo: "aviso", msg: `⚠ ${r.dica || "Código do nível errado para esta tela."}` });
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

  async function desbipar(p: PecaExpedicao) {
    if (!p.bipado) return;
    try {
      const r = await api.desbiparConferencia(pedidoId, fase, p.codigo);
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
  const semItens = !carregando && !erro && total === 0;
  const completo = semItens || (total > 0 && bipados >= total);
  const pct = total ? Math.round((bipados / total) * 100) : 0;

  // Imprime as etiquetas (uma por unidade da fase) com código de barras (leitor
  // USB) + QR (câmera do celular) — rolo térmico 50×30mm.
  function imprimirEtiquetas() {
    const pecas = conf?.pecas || [];
    if (!pecas.length) { alert("Nada para etiquetar neste pedido."); return; }
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
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
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
    <div className="modal-bg cexp-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal-card cexp-full" style={{ padding: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className={"modal-hd " + (completo ? "kit" : "unica")}>
          <div className="modal-hd-top">
            <span className="modal-pills">
              <span className="modal-pill">{codigoPedido}</span>
              <span className="modal-pill">{t.pill}</span>
            </span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-row">
            <span className="modal-cli">{cliente || "—"}</span>
            <span className={"conf-chip " + (completo ? "ok" : "")}>{bipados} / {total} {t.unidade}</span>
          </div>
        </div>

        <div className="modal-bd">
          {carregando ? (
            <div className="card pad">Carregando itens…</div>
          ) : erro ? (
            <div className="conf-fb erro">{erro}</div>
          ) : (
            <>
              <div className="conf-barra"><div className="conf-barra-fill" style={{ width: pct + "%" }} /></div>

              {feedback && <div className={"conf-fb " + feedback.tipo}>{feedback.msg}</div>}

              {semItens ? (
                <div className="conf-fb aviso">{t.semItens}</div>
              ) : !completo ? (
                <div className="conf-scan">
                  <div className="conf-scan-row">
                    <input
                      ref={inputRef}
                      className="conf-input"
                      placeholder="Bipe o código (leitor USB) e aperte Enter…"
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
                      title="Ler o QR com a câmera do celular"
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
                  <div className="conf-dica">Leia pelo <b>celular (câmera, QR)</b> ou pelo <b>leitor USB</b> (código de barras). <b>Cada código vale uma vez</b> — bipar o mesmo de novo avisa “já bipado”.</div>
                </div>
              ) : (
                <div className="conf-fb ok" style={{ fontSize: 15 }}>{t.sucesso(total)}</div>
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
                          <span className="conf-grp-sub">{g.amostra.produto}{g.amostra.cor ? ` · ${g.amostra.cor}` : ""}{g.amostra.ref ? ` · ${g.amostra.ref}` : ""}</span>
                        </div>
                        <span className={"conf-grp-cont " + (full ? "ok" : "")}>{bip}/{tot}</span>
                      </div>
                      <div className="conf-dots">
                        {g.pecas.map((p) => (
                          <button
                            key={p.codigo}
                            className={"conf-dot " + (p.bipado ? "on" : "")}
                            title={p.bipado ? `Bipado (${p.codigo}) — clique p/ desfazer` : `Falta bipar (${p.codigo})`}
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
          <button className="btn btn-soft" onClick={imprimirEtiquetas}>{t.etiqueta}</button>
          {admin && !carregando && bipados === 0 && (
            <button className="btn btn-soft" onClick={() => carregar(true)} title="Refaz os códigos deste pedido (só enquanto nada foi bipado)">↻ Refazer códigos</button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onFechar}>Fechar</button>
          <button className="kbtn tecer" disabled={!completo} onClick={onConcluir} title={completo ? "" : t.faltaLiberar}>
            {t.acao}
          </button>
        </div>
      </div>
    </div>
  );
}
