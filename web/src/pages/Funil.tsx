import { useEffect, useMemo, useState } from "react";
import { api, type FunilCard, type FunilBoard, type FunilCardDetalhe, type FunilEtapa } from "../api";

const brl = (n?: number | null) => "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
function dataBr(d?: string | null): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}
function waHref(num?: string | null): string | null {
  const d = (num || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? "55" + d : d}`;
}
function iniciais(nome?: string | null): string {
  return (nome || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

// Metadados das etapas (ordem, rótulo e cor do quadro).
const ETAPAS_META: { id: FunilEtapa; label: string; cor: string }[] = [
  { id: "novo-lead", label: "Novo Lead", cor: "#3b82f6" },
  { id: "primeiro-contato", label: "Primeiro Contato", cor: "#8b5cf6" },
  { id: "negociacao", label: "Negociação", cor: "#f59e0b" },
  { id: "aguardando-retorno", label: "Aguardando Retorno", cor: "#0ea5e9" },
  { id: "pedido-andamento", label: "Pedido em Andamento", cor: "#6366f1" },
  { id: "pos-venda", label: "Pós-venda", cor: "#14b8a6" },
  { id: "ativo", label: "Cliente Ativo", cor: "#22c55e" },
  { id: "inativo", label: "Inativo", cor: "#94a3b8" },
  { id: "perdido", label: "Perdido", cor: "#ef4444" },
];
const LABEL: Record<string, string> = Object.fromEntries(ETAPAS_META.map((e) => [e.id, e.label]));
const MOTIVOS: { id: string; label: string }[] = [
  { id: "preco", label: "Preço" }, { id: "concorrencia", label: "Concorrência" },
  { id: "sem-interesse", label: "Sem interesse" }, { id: "fechou-loja", label: "Fechou loja" },
  { id: "inadimplencia", label: "Inadimplência" }, { id: "nao-respondeu", label: "Não respondeu" },
  { id: "outro", label: "Outro" },
];
const SETOR_LABEL: Record<string, string> = {
  tecelagem: "Tecelagem", passadoria: "Passadoria", corte: "Corte", costura: "Costura", revisao: "Revisão", expedicao: "Expedição",
};
const EV_ICON: Record<string, string> = { ligacao: "📞", whatsapp: "💬", email: "✉️", etapa: "➡️", tarefa: "✅", pedido: "🧾", obs: "📝" };

// ── QUADRO do funil ────────────────────────────────────────────────────────────
export function Funil() {
  const [board, setBoard] = useState<FunilBoard | null>(null);
  const [filtro, setFiltro] = useState<string>("todos"); // todos | alerta | <responsavel>
  const [abrir, setAbrir] = useState<string | null>(null); // card id detalhe
  const [novo, setNovo] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null); // card id em drag
  const [sobre, setSobre] = useState<string | null>(null); // etapa alvo do drag

  function recarregar() { api.funilBoard().then(setBoard).catch(() => {}); }
  useEffect(() => { recarregar(); }, []);

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await api.sincronizarFunil();
      recarregar();
      alert(r.criados ? `${r.criados} cliente(s) trazido(s) para o funil.` : "Todos os clientes já estão no funil.");
    } catch (e) { alert((e as Error).message); } finally { setSincronizando(false); }
  }

  // Arrastar cartão para outra etapa. Etapas que exigem dado extra (Perdido →
  // motivo, Aguardando Retorno → data) abrem o detalhe já na etapa escolhida.
  async function soltarEm(etapaAlvo: FunilEtapa) {
    const id = arrastando; setArrastando(null); setSobre(null);
    if (!id) return;
    const c = (board?.cards || []).find((k) => k.id === id);
    if (!c || c.etapa === etapaAlvo) return;
    if (etapaAlvo === "perdido" || etapaAlvo === "aguardando-retorno") { setAbrir(id); return; }
    try { await api.atualizarCard(id, { etapa: etapaAlvo }); recarregar(); }
    catch (e) { alert((e as Error).message); }
  }

  const responsaveis = useMemo(
    () => [...new Set((board?.cards || []).map((c) => c.responsavel).filter(Boolean) as string[])].sort(),
    [board]
  );
  const visiveis = useMemo(() => {
    const cards = board?.cards || [];
    if (filtro === "todos") return cards;
    if (filtro === "alerta") return cards.filter((c) => c.alerta);
    return cards.filter((c) => c.responsavel === filtro);
  }, [board, filtro]);

  const r = board?.resumo;
  return (
    <div className="quadro-page" style={{ maxWidth: "none" }}>
      <div className="page-head">
        <div><h1>Funil de Vendas</h1><div className="breadcrumb">Comercial › Funil</div></div>
        <div className="fx-filtros">
          <span className={"fx-pill" + (filtro === "todos" ? " on" : "")} onClick={() => setFiltro("todos")}>Todos</span>
          {responsaveis.map((rp) => (
            <span key={rp} className={"fx-pill" + (filtro === rp ? " on" : "")} onClick={() => setFiltro(rp)}>{rp}</span>
          ))}
          <span className={"fx-pill" + (filtro === "alerta" ? " on" : "")} onClick={() => setFiltro("alerta")}>⚠️ Em alerta</span>
          <button className="btn" disabled={sincronizando} onClick={sincronizar}>{sincronizando ? "Sincronizando…" : "🔄 Sincronizar clientes"}</button>
          <button className="btn btn-primary" onClick={() => setNovo(true)}>＋ Novo lead</button>
        </div>
      </div>

      {r && (r.parados + r.semTarefa + r.retornos > 0) && (
        <div className="fx-alertbar">
          ⚠️ {[
            r.parados ? `${r.parados} parado(s) há +7 dias` : "",
            r.semTarefa ? `${r.semTarefa} sem próxima tarefa` : "",
            r.retornos ? `${r.retornos} retorno(s) vencendo` : "",
          ].filter(Boolean).join("  ·  ")}
        </div>
      )}

      {!board ? (
        <div className="card pad muted">Carregando…</div>
      ) : (
        <div className="fx-board">
          {ETAPAS_META.map((et) => {
            const cards = visiveis.filter((c) => c.etapa === et.id)
              .sort((a, b) => Number(b.alerta) - Number(a.alerta) || b.diasParado - a.diasParado);
            return (
              <div
                className={"fx-col" + (sobre === et.id ? " drag-over" : "")}
                key={et.id}
                onDragOver={(e) => { if (arrastando) { e.preventDefault(); setSobre(et.id); } }}
                onDragLeave={() => setSobre((s) => (s === et.id ? null : s))}
                onDrop={() => soltarEm(et.id)}
              >
                <div className="fx-hd"><span className="fx-dot" style={{ background: et.cor }} />{et.label}<span className="ct">{cards.length}</span></div>
                {cards.map((c) => (
                  <CardMini
                    key={c.id} c={c} onAbrir={() => setAbrir(c.id)}
                    onDragStart={() => setArrastando(c.id)} onDragEnd={() => { setArrastando(null); setSobre(null); }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {novo && <NovoLead onFechar={() => setNovo(false)} onSalvo={() => { setNovo(false); recarregar(); }} />}
      {abrir && <CardDetalhe id={abrir} onFechar={() => setAbrir(null)} onMudou={recarregar} />}
    </div>
  );
}

function CardMini({ c, onAbrir, onDragStart, onDragEnd }: { c: FunilCard; onAbrir: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  const wa = waHref(c.whatsapp);
  const cls = c.vermelho ? "red" : c.semTarefa ? "alert" : "";
  return (
    <div className={"fx-card " + cls} onClick={onAbrir} draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="fx-nm">{c.nome}</div>
      <div className="fx-sub">{[c.cidade, c.uf].filter(Boolean).join(" · ") || "—"}</div>
      <div className="fx-chips">
        {c.etapa === "negociacao" && c.valor_estimado != null && (
          <span className="fx-chip val">{brl(c.valor_estimado)}{c.probabilidade != null ? ` · ${c.probabilidade}%` : ""}</span>
        )}
        {c.etapa === "aguardando-retorno" && c.retorno_em && (
          <span className={"fx-chip" + (c.retornoVencido ? " dias warn" : "")}>📅 {dataBr(c.retorno_em)}</span>
        )}
        {(c.etapa === "ativo" || c.etapa === "inativo") && c.diasSemComprar != null && (
          <span className={"fx-chip dias" + (c.faixa ? " warn" : "")}>{c.diasSemComprar}d s/ comprar</span>
        )}
        <span className={"fx-chip dias" + (c.diasParado >= 7 ? " warn" : "")}>⏱ {c.diasParado}d parado</span>
      </div>
      {c.pedido && (
        <div className="fx-prod">
          {c.pedido.numero ? "#" + c.pedido.numero + " · " : ""}{brl(c.pedido.valor)}
          {c.pedido.setor ? <><br />🧵 {SETOR_LABEL[c.pedido.setor] || c.pedido.setor}{c.pedido.previsao ? " · prev. " + dataBr(c.pedido.previsao) : ""}</> : null}
        </div>
      )}
      <div className={"fx-task" + (c.semTarefa ? " miss" : "")}>
        {c.semTarefa ? "⚠️ Sem próxima tarefa" : <>📋 {c.proxTarefa?.titulo}{c.proxTarefa?.vence_em ? ` · ${dataBr(c.proxTarefa.vence_em)}` : ""}</>}
      </div>
      <div className="fx-foot">
        <div className="fx-av">{iniciais(c.responsavel)}</div>
        <span className="fx-sub">{c.responsavel || "sem responsável"}</span>
        {wa && <a className="fx-wa" href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>💬</a>}
      </div>
    </div>
  );
}

// ── Detalhe do cartão (mover etapa, tarefas, timeline, histórico) ────────────────
function CardDetalhe({ id, onFechar, onMudou }: { id: string; onFechar: () => void; onMudou: () => void }) {
  const [d, setD] = useState<FunilCardDetalhe | null>(null);
  const [etapa, setEtapa] = useState<FunilEtapa>("novo-lead");
  const [motivo, setMotivo] = useState("");
  const [retorno, setRetorno] = useState("");
  const [novaTarefa, setNovaTarefa] = useState("");
  const [venceTarefa, setVenceTarefa] = useState("");
  const [evTipo, setEvTipo] = useState("obs");
  const [evTexto, setEvTexto] = useState("");
  const [busy, setBusy] = useState(false);

  function carregar() {
    api.funilCard(id).then((x) => { setD(x); setEtapa(x.etapa); setMotivo(x.motivo_perdido || ""); setRetorno(x.retorno_em || ""); });
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [id]);

  async function moverEtapa() {
    if (etapa === "perdido" && !motivo) { alert("Escolha o motivo da perda."); return; }
    if (etapa === "aguardando-retorno" && !retorno) { alert("Defina a data de retorno."); return; }
    setBusy(true);
    try {
      await api.atualizarCard(id, { etapa, motivo_perdido: motivo || undefined, retorno_em: retorno || undefined });
      carregar(); onMudou();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }
  async function salvarValor(campo: "valor_estimado" | "probabilidade", v: string) {
    await api.atualizarCard(id, { [campo]: v }); carregar(); onMudou();
  }
  async function addTarefa() {
    if (!novaTarefa.trim()) return;
    setBusy(true);
    try { await api.addTarefaFunil(id, { titulo: novaTarefa.trim(), vence_em: venceTarefa || undefined }); setNovaTarefa(""); setVenceTarefa(""); carregar(); onMudou(); }
    finally { setBusy(false); }
  }
  async function concluir(tid: string) { await api.concluirTarefaFunil(tid); carregar(); onMudou(); }
  async function addEvento() {
    if (!evTexto.trim()) return;
    setBusy(true);
    try { await api.addEventoFunil(id, { tipo: evTipo, texto: evTexto.trim() }); setEvTexto(""); carregar(); onMudou(); }
    finally { setBusy(false); }
  }

  const wa = d ? waHref(d.whatsapp) : null;
  const cor = ETAPAS_META.find((e) => e.id === (d?.etapa || "novo-lead"))?.cor || "#4f46e5";
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card fx-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: `linear-gradient(130deg,${cor},#4f46e5)` }}>
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">{d ? LABEL[d.etapa] : "…"}</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-title">{d?.nome || "Carregando…"}</div>
          <div className="modal-hd-sub">{d ? ([d.cidade, d.uf].filter(Boolean).join(" · ") || "—") : ""}{d?.responsavel ? ` · 🧑 ${d.responsavel}` : ""}</div>
        </div>
        {!d ? <div className="modal-bd"><div className="pad muted">Carregando…</div></div> : (
          <div className="modal-bd fx-detalhe">
            <div className="fx-d-main">
              {/* Mover de etapa */}
              <div className="fx-block">
                <div className="fx-block-h">Etapa</div>
                <div className="fx-mover">
                  <select value={etapa} onChange={(e) => setEtapa(e.target.value as FunilEtapa)}>
                    {ETAPAS_META.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                  {etapa === "perdido" && (
                    <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                      <option value="">Motivo…</option>
                      {MOTIVOS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                    </select>
                  )}
                  {etapa === "aguardando-retorno" && (
                    <input type="date" value={retorno} onChange={(e) => setRetorno(e.target.value)} />
                  )}
                  <button className="kbtn go" disabled={busy || etapa === d.etapa} onClick={moverEtapa}>Mover</button>
                </div>
                {d.etapa === "negociacao" && (
                  <div className="fx-neg">
                    <label className="fld">Valor estimado (R$)
                      <input type="number" defaultValue={d.valor_estimado ?? ""} onBlur={(e) => salvarValor("valor_estimado", e.target.value)} />
                    </label>
                    <label className="fld">Probabilidade (%)
                      <input type="number" defaultValue={d.probabilidade ?? ""} onBlur={(e) => salvarValor("probabilidade", e.target.value)} />
                    </label>
                  </div>
                )}
              </div>

              {/* Tarefas */}
              <div className="fx-block">
                <div className="fx-block-h">Tarefas</div>
                {d.tarefas.filter((t) => !t.feita).length === 0 && <div className="fx-warn">⚠️ Sem próxima tarefa — todo cartão precisa de uma.</div>}
                {d.tarefas.map((t) => (
                  <div key={t.id} className={"fx-tar" + (t.feita ? " done" : "")}>
                    <input type="checkbox" checked={!!t.feita} disabled={!!t.feita} onChange={() => concluir(t.id)} />
                    <span className="tt">{t.titulo}</span>
                    {t.vence_em && <span className="fx-sub">{dataBr(t.vence_em)}</span>}
                  </div>
                ))}
                <div className="fx-addtar">
                  <input placeholder="Nova tarefa…" value={novaTarefa} onChange={(e) => setNovaTarefa(e.target.value)} />
                  <input type="date" value={venceTarefa} onChange={(e) => setVenceTarefa(e.target.value)} />
                  <button className="btn" disabled={busy || !novaTarefa.trim()} onClick={addTarefa}>Adicionar</button>
                </div>
              </div>

              {/* Histórico de pedidos */}
              {d.pedidos.length > 0 && (
                <div className="fx-block">
                  <div className="fx-block-h">Pedidos do cliente</div>
                  <table className="crm"><tbody>
                    {d.pedidos.map((p) => (
                      <tr key={p.id}><td>{dataBr(p.data)}</td><td>{p.numero ? "#" + p.numero : "—"}</td><td className="money">{brl(p.valor)}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              )}
            </div>

            {/* Timeline */}
            <div className="fx-d-side">
              {wa && <a className="wa wa-big" href={wa} target="_blank" rel="noreferrer">🟢 Abrir WhatsApp</a>}
              <div className="fx-block-h">Registrar</div>
              <div className="fx-addev">
                <select value={evTipo} onChange={(e) => setEvTipo(e.target.value)}>
                  <option value="obs">📝 Observação</option>
                  <option value="ligacao">📞 Ligação</option>
                  <option value="whatsapp">💬 WhatsApp</option>
                  <option value="email">✉️ E-mail</option>
                </select>
                <textarea placeholder="O que aconteceu…" rows={2} value={evTexto} onChange={(e) => setEvTexto(e.target.value)} />
                <button className="btn btn-primary" disabled={busy || !evTexto.trim()} onClick={addEvento}>Registrar</button>
              </div>
              <div className="fx-block-h">Histórico</div>
              <div className="fx-timeline">
                {d.timeline.length === 0 && <div className="muted2">Sem registros ainda.</div>}
                {d.timeline.map((ev) => (
                  <div className="fx-ev" key={ev.id}>
                    <span className="ic">{EV_ICON[ev.tipo] || "•"}</span>
                    <div><div className="tx">{ev.texto}</div><div className="fx-sub">{dataBr(ev.criado_em)}{ev.autor ? " · " + ev.autor : ""}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Novo lead ────────────────────────────────────────────────────────────────────
function NovoLead({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({ nome: "", whatsapp: "", cidade: "", uf: "", responsavel: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  async function salvar() {
    if (!f.nome.trim()) { alert("Informe o nome."); return; }
    if (!f.whatsapp.trim()) { alert("Informe o telefone/WhatsApp."); return; }
    setBusy(true);
    try { await api.criarCard(f); onSalvo(); }
    catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ background: "linear-gradient(130deg,#3b82f6,#4f46e5)" }}>
          <div className="modal-hd-top"><span className="modal-pills"><span className="modal-pill">Novo lead</span></span><button className="modal-x" onClick={onFechar}>✕</button></div>
        </div>
        <div className="modal-bd">
          <div className="form-grid">
            <label className="fld full">Nome / Razão social<input value={f.nome} onChange={(e) => set("nome", e.target.value)} autoFocus /></label>
            <label className="fld full">Telefone / WhatsApp<input value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="(31) 9 9999-9999" /></label>
            <label className="fld">Cidade<input value={f.cidade} onChange={(e) => set("cidade", e.target.value)} /></label>
            <label className="fld uf">UF<input value={f.uf} onChange={(e) => set("uf", e.target.value)} maxLength={2} /></label>
            <label className="fld full">Responsável<input value={f.responsavel} onChange={(e) => set("responsavel", e.target.value)} /></label>
          </div>
          <div className="muted2" style={{ marginTop: 8 }}>Já crio uma tarefa de 1º contato em 24h. 🕑</div>
        </div>
        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="kbtn go" disabled={busy} onClick={salvar}>{busy ? "Salvando…" : "Criar lead"}</button>
        </div>
      </div>
    </div>
  );
}
