// Ordens de compra de insumos — lista + detalhe.
// Fluxo (1 status por etapa):
//   🟡 aguardando_aprovacao  (PCP cria)
//     → gestor abre, confere e clica COTAR
//   🔵 cotando               (em cotação)
//     → gestor clica APROVAR COMPRA → gera PDF + WhatsApp
//   🟢 compra_efetuada       (compra realizada; aguarda o recebimento)
//     → ao dar entrada no estoque → recebida_parcial / recebida
// Também dá pra RECUSAR enquanto aguardando/cotando.
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, type OrdemCompra, type OrdemCompraDetalhe, type OrdemCompraItemRow, type OrdemCompraStatus } from "../api";
import { getUser, podeFuncao } from "../auth";

const nBR = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const rBR = (v: number) => "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function dataHora(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}
// data de entrega (ISO yyyy-mm-dd) → dd/mm/aaaa
function dataEnt(s: string | null | undefined) {
  const v = (s || "").trim(); if (!v) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

const ST: Record<OrdemCompraStatus, { txt: string; bg: string; fg: string }> = {
  aguardando_aprovacao: { txt: "🟡 Aguardando aprovação", bg: "#fef3c7", fg: "#92400e" },
  cotando: { txt: "🔵 Cotando", bg: "#dbeafe", fg: "#1e40af" },
  compra_efetuada: { txt: "🟢 Compra efetuada", bg: "#dcfce7", fg: "#166534" },
  enviada: { txt: "🟢 Compra efetuada", bg: "#dcfce7", fg: "#166534" }, // legado
  aprovada: { txt: "Com falha no envio", bg: "#ffedd5", fg: "#9a3412" },
  recebida_parcial: { txt: "Recebido parcial", bg: "#fef9c3", fg: "#854d0e" },
  recebida: { txt: "Recebido ✓", bg: "#ccfbf1", fg: "#0f766e" },
  recusada: { txt: "Recusada", bg: "#fee2e2", fg: "#991b1b" },
};
function Selo({ s }: { s: OrdemCompraStatus }) {
  const c = ST[s] || { txt: s, bg: "#e5e7eb", fg: "#374151" };
  return <span style={{ background: c.bg, color: c.fg, borderRadius: 999, padding: "2px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{c.txt}</span>;
}

const FILTROS: { id: string; label: string }[] = [
  { id: "", label: "Todas" },
  { id: "aguardando_aprovacao", label: "Aguardando aprovação" },
  { id: "cotando", label: "Cotando" },
  { id: "compra_efetuada", label: "Compra efetuada" },
  { id: "recebida", label: "Recebidas" },
  { id: "aprovada", label: "Com falha" },
  { id: "recusada", label: "Recusadas" },
];

export function OrdensCompra() {
  const u = getUser();
  const podeAprovar = podeFuncao(u, "compras.aprovar");
  const ehMaster = !!u?.admin;
  const [filtro, setFiltro] = useState("");
  const [lista, setLista] = useState<OrdemCompra[]>([]);
  const [carregou, setCarregou] = useState(false);
  const [abertaId, setAbertaId] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try { setLista(await api.listarOrdensCompra(filtro)); } catch { /* mantém */ }
    finally { setCarregou(true); }
  }, [filtro]);

  useEffect(() => { recarregar(); }, [recarregar]);

  async function excluir(o: OrdemCompra) {
    if (!confirm(`Excluir a ordem ${o.numero}? Esta ação não pode ser desfeita.`)) return;
    try { await api.excluirOrdemCompra(o.id); recarregar(); }
    catch (e) { alert((e as Error).message); }
  }

  return (
    <>
      <div className="row-gap" style={{ alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Ordens de compra</h2>
        <span className="muted" style={{ fontSize: 12 }}>
          {podeAprovar ? "Confira e clique em COTAR; depois APROVAR COMPRA envia ao fornecedor." : "Suas ordens criadas (o gestor cota e aprova a compra)."}
        </span>
        <Link to="/compras" className="btn btn-soft" style={{ marginLeft: "auto" }} title="Criar ordens a partir das compras sugeridas (estoque baixo)">🛒 Sugestões de compra</Link>
        <button className="btn btn-soft" onClick={recarregar}>↻ Atualizar</button>
      </div>

      <div className="row-gap" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {FILTROS.map((f) => (
          <button key={f.id} className={"btn " + (filtro === f.id ? "btn-primary" : "btn-soft")} style={{ fontSize: 13 }} onClick={() => setFiltro(f.id)}>{f.label}</button>
        ))}
      </div>

      {carregou && lista.length === 0 && (
        <div className="card pad empty">Nenhuma ordem {filtro ? "neste filtro" : "ainda"}.</div>
      )}

      {lista.length > 0 && (
        <div className="card">
          <table className="table">
            <thead><tr>
              <th>Nº</th><th>Fornecedor</th><th className="num">Itens</th><th className="num">Total</th>
              <th>Entrega</th><th>Status</th><th>Criada</th><th>Por</th><th></th>
            </tr></thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => setAbertaId(o.id)}>
                  <td className="strong">{o.numero}</td>
                  <td>{o.fornecedor_nome || "—"}</td>
                  <td className="num">{o.n_itens ?? "—"}</td>
                  <td className="num">{rBR(o.total)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{dataEnt(o.data_entrega)}</td>
                  <td><Selo s={o.status} /></td>
                  <td style={{ whiteSpace: "nowrap" }}>{dataHora(o.criado_em)}</td>
                  <td className="muted">{o.criado_por_nome || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-soft" style={{ fontSize: 12 }} onClick={(e) => { e.stopPropagation(); setAbertaId(o.id); }}>Abrir</button>
                    {ehMaster && <button className="btn btn-soft" title="Excluir ordem" style={{ fontSize: 12, marginLeft: 4, color: "#b91c1c" }} onClick={(e) => { e.stopPropagation(); excluir(o); }}>🗑</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abertaId && (
        <DetalheOrdem id={abertaId} podeAprovar={podeAprovar} onFechar={() => setAbertaId(null)} onMudou={recarregar} />
      )}
    </>
  );
}

function DetalheOrdem({ id, podeAprovar, onFechar, onMudou }: { id: string; podeAprovar: boolean; onFechar: () => void; onMudou: () => void }) {
  const [ord, setOrd] = useState<OrdemCompraDetalhe | null>(null);
  const [itens, setItens] = useState<OrdemCompraItemRow[]>([]);
  const [obs, setObs] = useState("");
  const [formaPag, setFormaPag] = useState("");
  const [dataEntrega, setDataEntrega] = useState("");
  const [formas, setFormas] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [receberOpen, setReceberOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const ehMaster = !!getUser()?.admin;

  useEffect(() => {
    let vivo = true;
    api.obterOrdemCompra(id).then((o) => { if (!vivo) return; setOrd(o); setItens(o.itens || []); setObs(o.obs || ""); setFormaPag(o.forma_pagamento || ""); setDataEntrega(o.data_entrega || ""); })
      .catch((e) => { if (vivo) setErro((e as Error).message); });
    api.listarFormasPagamento().then((l) => { if (vivo) setFormas(l.filter((x) => x.ativo !== 0).map((x) => x.nome)); }).catch(() => {});
    return () => { vivo = false; };
  }, [id]);

  // Editável enquanto NÃO foi efetuada a compra: "aguardando" (quem criou) e "cotando" (só gestor).
  const editavel = !!ord && (ord.status === "aguardando_aprovacao" || (ord.status === "cotando" && podeAprovar));
  // Já passou pela aprovação (compra efetuada / falha / recebida) → libera "Receber no estoque".
  const compraEfetuada = !!ord && (ord.status === "compra_efetuada" || ord.status === "enviada");
  const podeReceber = !!ord && (compraEfetuada || ord.status === "aprovada" || ord.status === "recebida_parcial" || ord.status === "recebida");
  // Reaprovar = reenviar o PDF de uma ordem que já foi efetuada ou falhou no envio.
  const reaprovar = !!ord && (compraEfetuada || ord.status === "aprovada");
  const total = itens.reduce((s, it) => s + (Number(it.qtd) || 0) * (Number(it.preco) || 0), 0);

  function setItem(i: number, patch: Partial<OrdemCompraItemRow>) {
    setItens((arr) => arr.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  }
  function removerItem(i: number) { setItens((arr) => arr.filter((_, k) => k !== i)); }

  async function salvar(): Promise<boolean> {
    if (!ord) return false;
    try {
      const r = await api.editarOrdemCompra(ord.id, {
        obs, forma_pagamento: formaPag, data_entrega: dataEntrega,
        itens: itens.map((it) => ({ material_id: it.material_id, nome: it.nome || "", codigo: it.codigo, tamanho: it.tamanho, cor: it.cor, unidade: it.unidade, saldo: it.saldo, minimo: it.minimo, qtd: Number(it.qtd) || 0, preco: Number(it.preco) || 0 })),
      });
      setOrd(r.ordem); setItens(r.ordem.itens || []);
      return true;
    } catch (e) { alert((e as Error).message); return false; }
  }

  // Salva as alterações SEM reenviar o PDF (ex.: só ajustar a data de entrega).
  async function salvarSo() {
    setBusy(true);
    try { if (await salvar()) { onMudou(); alert("💾 Alterações salvas (sem reenviar)."); } }
    finally { setBusy(false); }
  }

  async function excluirAqui() {
    if (!ord) return;
    if (!confirm(`Excluir a ordem ${ord.numero}? Esta ação não pode ser desfeita.`)) return;
    setBusy(true);
    try { await api.excluirOrdemCompra(ord.id); onMudou(); onFechar(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  async function verPdf() {
    if (!ord) return;
    setBusy(true);
    try {
      const blob = await api.ordemCompraPdf(ord.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  async function cotar() {
    if (!ord) return;
    setBusy(true);
    try {
      if (editavel) { if (!(await salvar())) { setBusy(false); return; } }
      const r = await api.cotarOrdemCompra(ord.id);
      setOrd(r.ordem); setItens(r.ordem.itens || []); onMudou();
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  async function aprovar() {
    if (!ord) return;
    const itensValidos = itens.filter((it) => (Number(it.qtd) || 0) > 0);
    if (!itensValidos.length) { alert("A ordem precisa de ao menos um item com quantidade."); return; }
    const msg = reaprovar
      ? `REENVIAR o PDF da ordem ${ord.numero} no WhatsApp do fornecedor?`
      : `APROVAR a compra da ordem ${ord.numero}? Isso marca como COMPRA EFETUADA e envia o PDF no WhatsApp do fornecedor.`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      if (editavel) { if (!(await salvar())) { setBusy(false); return; } }
      const r = await api.aprovarOrdemCompra(ord.id);
      onMudou();
      if (r.ok) { alert(reaprovar ? `✅ Ordem ${ord.numero} reenviada no WhatsApp.` : `✅ Compra efetuada — ordem ${ord.numero} enviada no WhatsApp.`); onFechar(); }
      else if (r.status === "aprovada") { alert(`A compra foi APROVADA, mas o envio no WhatsApp falhou (${r.motivo || "falha"}). Confira o número do gestor e a conexão, e tente reenviar.`); const o = await api.obterOrdemCompra(ord.id); setOrd(o); }
      else alert(`⚠️ ${r.motivo || "Não foi possível aprovar a compra."}`);
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  async function recusar() {
    if (!ord) return;
    const motivo = prompt("Recusar esta ordem? (opcional: diga o motivo)");
    if (motivo === null) return;
    setBusy(true);
    try { await api.recusarOrdemCompra(ord.id, motivo || undefined); onMudou(); onFechar(); }
    catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onFechar(); }}>
      <div className="card pad" style={{ maxWidth: 1180, width: "97%", maxHeight: "92vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        {!ord && !erro && <p className="muted">Carregando…</p>}
        {erro && <p style={{ color: "#b91c1c" }}>{erro}</p>}
        {ord && (
          <>
            <div className="row-gap" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ margin: 0 }}>{ord.numero}</h2>
              <Selo s={ord.status} />
              <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={onFechar}>✕ Fechar</button>
            </div>
            <div className="muted" style={{ fontSize: 13, margin: "6px 0 2px" }}>
              🚛 <strong>{ord.fornecedor_nome || ord.fornecedor?.nome || "—"}</strong>
              {ord.fornecedor?.telefone ? ` · ${ord.fornecedor.telefone}` : ""}
              {ord.fornecedor?.cnpj ? ` · CNPJ ${ord.fornecedor.cnpj}` : ""}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Criada por {ord.criado_por_nome || "—"} em {dataHora(ord.criado_em)}
              {ord.aprovado_por_nome ? ` · Aprovada por ${ord.aprovado_por_nome} em ${dataHora(ord.aprovado_em)}` : ""}
              {ord.enviado_em ? ` · Compra efetuada em ${dataHora(ord.enviado_em)}` : ""}
            </div>
            {ord.erro && <div style={{ background: "#fef2f2", color: "#991b1b", borderRadius: 8, padding: "6px 10px", fontSize: 12, margin: "8px 0" }}>⚠️ {ord.erro}</div>}

            <table className="table" style={{ marginTop: 10 }}>
              <thead><tr>
                <th>Cód.</th><th>Material</th><th className="num">Estoque</th><th className="num">Mín.</th><th className="num">Comprar</th><th className="num">Recebido</th><th>Un</th><th className="num">Vl unit.</th><th className="num">Total</th>{editavel && <th></th>}
              </tr></thead>
              <tbody>
                {itens.map((it, i) => {
                  const baixo = it.saldo != null && it.minimo != null && Number(it.saldo) < Number(it.minimo);
                  return (
                  <tr key={it.id || i}>
                    <td className="strong">{it.codigo || it.mat_codigo || "—"}</td>
                    <td>{it.nome}{(it.tamanho || it.mat_tamanho) ? ` · ${it.tamanho || it.mat_tamanho}` : ""}{(it.cor || it.mat_cor) ? ` · ${it.cor || it.mat_cor}` : ""}</td>
                    <td className="num" style={baixo ? { color: "#b91c1c", fontWeight: 700 } : undefined}>{it.saldo != null ? nBR(Number(it.saldo)) : "—"}</td>
                    <td className="num muted">{it.minimo != null ? nBR(Number(it.minimo)) : "—"}</td>
                    <td className="num">
                      {editavel
                        ? <input value={String(it.qtd ?? 0)} inputMode="decimal" style={{ width: 70, textAlign: "right" }} onChange={(e) => setItem(i, { qtd: Number(e.target.value.replace(",", ".")) || 0 })} />
                        : nBR(it.qtd)}
                    </td>
                    <td className="num">{(() => {
                      const rec = Number(it.recebido) || 0, comp = Number(it.qtd) || 0;
                      if (rec <= 0) return <span className="muted">—</span>;
                      const dif = rec - comp;
                      const cor = dif >= 0 ? "#166534" : "#92400e";
                      return (
                        <span style={{ color: cor, fontWeight: 700, display: "inline-block", lineHeight: 1.2 }}>
                          {dif >= 0 ? "✓ " : ""}{nBR(rec)}
                          {dif !== 0 && (
                            <div style={{ fontSize: 11, fontWeight: 600 }}>
                              {dif > 0 ? `+${nBR(dif)} a mais` : `faltam ${nBR(-dif)}`}
                            </div>
                          )}
                        </span>
                      );
                    })()}</td>
                    <td className="muted">{it.unidade || ""}</td>
                    <td className="num">
                      {editavel
                        ? <input value={String(it.preco ?? 0)} inputMode="decimal" style={{ width: 80, textAlign: "right" }} onChange={(e) => setItem(i, { preco: Number(e.target.value.replace(",", ".")) || 0 })} />
                        : (it.preco ? rBR(it.preco) : "—")}
                    </td>
                    <td className="num">{it.preco ? rBR((Number(it.qtd) || 0) * (Number(it.preco) || 0)) : "—"}</td>
                    {editavel && <td><button className="btn btn-soft" title="Remover item" style={{ fontSize: 12 }} onClick={() => removerItem(i)}>🗑</button></td>}
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ textAlign: "right", fontWeight: 700, margin: "8px 2px" }}>Total estimado: {rBR(total)}</div>

            <div style={{ marginTop: 8 }}>
              <label className="muted" style={{ fontSize: 12 }}>Data de entrega <span style={{ opacity: .7 }}>(sai no PDF)</span></label>
              <input type="date" value={dataEntrega} disabled={!editavel} style={{ marginTop: 4 }}
                onChange={(e) => setDataEntrega(e.target.value)} />
            </div>

            <div style={{ marginTop: 8 }}>
              <label className="muted" style={{ fontSize: 12 }}>Forma de pagamento <span style={{ opacity: .7 }}>(sai no PDF)</span></label>
              <input list="formas-pag-sugestoes" value={formaPag} disabled={!editavel} style={{ width: "100%", marginTop: 4 }}
                placeholder={editavel ? "ex.: Boleto 30 dias · PIX à vista · 30/60/90…" : "—"} onChange={(e) => setFormaPag(e.target.value)} />
              <datalist id="formas-pag-sugestoes">
                {formas.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>

            <div style={{ marginTop: 8 }}>
              <label className="muted" style={{ fontSize: 12 }}>Observação <span style={{ opacity: .7 }}>(sai no PDF)</span></label>
              <textarea value={obs} disabled={!editavel} rows={2} style={{ width: "100%", marginTop: 4 }}
                placeholder={editavel ? "ex.: prazo de entrega, condições…" : ""} onChange={(e) => setObs(e.target.value)} />
            </div>

            <div className="row-gap" style={{ marginTop: 14, gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {ehMaster && <button className="btn btn-soft" disabled={busy} style={{ color: "#b91c1c", marginRight: "auto" }} onClick={excluirAqui}>🗑 Excluir</button>}
              {podeReceber && <button className="btn btn-soft" disabled={busy} style={{ color: "#166534" }} onClick={() => setReceberOpen(true)}>📥 Receber no estoque</button>}
              <button className="btn btn-soft" disabled={busy} onClick={verPdf}>👁 Ver PDF</button>
              <button className="btn btn-soft" disabled={busy} style={{ color: "#166534" }} onClick={() => setWaOpen(true)}>📱 Enviar WhatsApp</button>
              {editavel && <button className="btn btn-soft" disabled={busy} onClick={salvarSo}>💾 Salvar alterações</button>}
              {/* 1ª etapa — Aguardando: só COTAR (confere) e Recusar. Sem aprovar direto. */}
              {podeAprovar && ord.status === "aguardando_aprovacao" && (
                <>
                  <button className="btn btn-soft" disabled={busy} style={{ color: "#b91c1c" }} onClick={recusar}>✖ Recusar</button>
                  <button className="btn btn-primary" disabled={busy} style={{ background: "#1e40af", borderColor: "#1e40af" }} onClick={cotar}>{busy ? "Processando…" : "🔵 Cotar"}</button>
                </>
              )}
              {/* 2ª etapa — Cotando: some o Cotar, aparece APROVAR COMPRA (+ Recusar). */}
              {podeAprovar && ord.status === "cotando" && (
                <>
                  <button className="btn btn-soft" disabled={busy} style={{ color: "#b91c1c" }} onClick={recusar}>✖ Recusar</button>
                  <button className="btn btn-primary" disabled={busy} style={{ background: "#166534", borderColor: "#166534" }} onClick={aprovar}>{busy ? "Processando…" : "🟢 Aprovar compra"}</button>
                </>
              )}
              {/* Com falha no envio: permite tentar reenviar (reaprovar). */}
              {podeAprovar && ord.status === "aprovada" && (
                <button className="btn btn-primary" disabled={busy} style={{ background: "#166534", borderColor: "#166534" }} onClick={aprovar}>{busy ? "Enviando…" : "📲 Reenviar (aprovar compra)"}</button>
              )}
            </div>
          </>
        )}
      </div>
      {receberOpen && ord && (
        <ReceberModal ordem={ord} itens={itens} onFechar={() => setReceberOpen(false)}
          onRecebido={(o) => { setReceberOpen(false); setOrd(o); setItens(o.itens || []); onMudou(); }} />
      )}
      {waOpen && ord && <WhatsAppModal ordemId={ord.id} onFechar={() => setWaOpen(false)} />}
    </div>
  );
}

// Enviar a ordem pelo WhatsApp: pega o link PÚBLICO do PDF + telefone do fornecedor,
// deixa confirmar/trocar o número e abre o WhatsApp com a mensagem pronta.
function WhatsAppModal({ ordemId, onFechar }: { ordemId: string; onFechar: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [tel, setTel] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [okMsg, setOkMsg] = useState("");
  const [dados, setDados] = useState<{ numero: string; fornecedor_nome: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    api.ordemCompartilhar(ordemId)
      .then((d) => { if (!vivo) return; setDados({ numero: d.numero, fornecedor_nome: d.fornecedor_nome }); setTel(d.fornecedor_telefone || ""); })
      .catch((e) => { if (vivo) setErro((e as Error).message || "Não consegui preparar o envio."); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [ordemId]);
  async function enviar() {
    if (!dados || enviando) return;
    const d = (tel || "").replace(/\D+/g, "");
    if (d.length < 10) { setErro("Digite um número com DDD (ex.: 35 99999-9999)."); return; }
    setEnviando(true); setErro("");
    try {
      const r = await api.ordemEnviarFornecedor(ordemId, tel);
      if (r.ok) { setOkMsg("✅ PDF enviado no WhatsApp!"); setTimeout(onFechar, 1400); }
      else { setErro("Não consegui enviar (" + (r.motivo || r.error || "falha") + "). Confira o número e a conexão do WhatsApp."); setEnviando(false); }
    } catch (e) { setErro((e as Error).message || "Falha no envio."); setEnviando(false); }
  }
  return (
    <div className="modal-bg" onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120, padding: 16 }}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 460, width: "100%", padding: 22 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>📱 Enviar ordem no WhatsApp</div>
        {carregando ? (
          <div style={{ color: "#64748b", padding: "16px 0" }}>Preparando…</div>
        ) : !dados ? (
          <div style={{ color: "#b91c1c", padding: "14px 0" }}>{erro || "Não consegui preparar o envio."}
            <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}><button className="btn btn-soft" onClick={onFechar}>Fechar</button></div>
          </div>
        ) : (
          <>
            <div style={{ color: "#64748b", fontSize: 13.5, margin: "6px 0 14px" }}>
              O fornecedor recebe o <b>PDF da ordem no WhatsApp</b> — o mesmo documento que você recebe hoje.
            </div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Número do WhatsApp (com DDD)</label>
            <input value={tel} onChange={(e) => { setTel(e.target.value); setErro(""); }} placeholder="35 99999-9999" disabled={enviando}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 15, marginTop: 4 }} />
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>Vem o número do fornecedor; você pode trocar por outro.</div>
            {erro && <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 10 }}>{erro}</div>}
            {okMsg && <div style={{ color: "#166534", fontSize: 14, fontWeight: 700, marginTop: 10 }}>{okMsg}</div>}
            <div className="row-gap" style={{ justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button className="btn btn-soft" onClick={onFechar} disabled={enviando}>Cancelar</button>
              <button className="btn btn-primary" onClick={enviar} disabled={enviando || !!okMsg} style={{ background: "#16a34a", borderColor: "#16a34a" }}>{enviando ? "Enviando…" : "📱 Enviar PDF no WhatsApp"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Recebimento da ordem no estoque (aceita parcial): por item, quanto chegou agora.
function ReceberModal({ ordem, itens, onFechar, onRecebido }: { ordem: OrdemCompraDetalhe; itens: OrdemCompraItemRow[]; onFechar: () => void; onRecebido: (o: OrdemCompraDetalhe) => void }) {
  const restante = (it: OrdemCompraItemRow) => Math.max(0, (Number(it.qtd) || 0) - (Number(it.recebido) || 0));
  const [qtd, setQtd] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const it of itens) m[it.id] = String(restante(it));
    return m;
  });
  const [busy, setBusy] = useState(false);
  // Não limita ao comprado: se chegou mais que o pedido, recebe o que veio de verdade.
  const totalReceber = itens.reduce((s, it) => s + (Number((qtd[it.id] || "0").replace(",", ".")) || 0), 0);

  async function confirmar() {
    const lista = itens
      .map((it) => ({ id: it.id, qtd: Number((qtd[it.id] || "0").replace(",", ".")) || 0 }))
      .filter((x) => x.qtd > 0);
    if (!lista.length) { alert("Informe a quantidade recebida de ao menos um item."); return; }
    setBusy(true);
    try {
      const r = await api.receberOrdemCompra(ordem.id, lista);
      if (r.ok && r.ordem) { alert(`✅ Entrada no estoque feita (${nBR(r.recebidos || 0)} un no total).`); onRecebido(r.ordem); }
      else alert(`⚠️ ${r.motivo === "nada_a_receber" ? "Nada a receber." : "Não foi possível receber."}`);
    } catch (e) { alert((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onFechar(); }}>
      <div className="card pad" style={{ maxWidth: 860, width: "96%", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="row-gap" style={{ alignItems: "center", gap: 8 }}>
          <h2 style={{ margin: 0 }}>📥 Receber no estoque</h2>
          <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={onFechar}>✕ Fechar</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          Informe quanto chegou de cada item. Pode receber <strong>parcial</strong> — o que faltar continua pendente pra receber depois.
          A quantidade entra no estoque do material.
        </p>
        <table className="table" style={{ marginTop: 8 }}>
          <thead><tr>
            <th>Cód.</th><th>Material</th><th className="num">Estoque</th><th className="num">Comprar</th><th className="num">Já recebido</th><th className="num">Falta</th><th className="num">Receber agora</th>
          </tr></thead>
          <tbody>
            {itens.map((it) => {
              const falta = restante(it);
              return (
                <tr key={it.id} style={falta <= 0 ? { opacity: 0.5 } : undefined}>
                  <td className="strong">{it.codigo || it.mat_codigo || "—"}</td>
                  <td>{it.nome}{(it.tamanho || it.mat_tamanho) ? ` · ${it.tamanho || it.mat_tamanho}` : ""}{(it.cor || it.mat_cor) ? ` · ${it.cor || it.mat_cor}` : ""} <span className="muted">{it.unidade || ""}</span></td>
                  <td className="num muted">{it.saldo != null ? nBR(Number(it.saldo)) : "—"}</td>
                  <td className="num">{nBR(Number(it.qtd) || 0)}</td>
                  <td className="num muted">{nBR(Number(it.recebido) || 0)}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{nBR(falta)}</td>
                  <td className="num">
                    <input value={qtd[it.id] ?? "0"} inputMode="decimal" disabled={falta <= 0} style={{ width: 80, textAlign: "right" }}
                      onChange={(e) => setQtd((q) => ({ ...q, [it.id]: e.target.value }))} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="row-gap" style={{ marginTop: 14, gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          <span className="muted">Total a receber agora: <strong>{nBR(totalReceber)}</strong></span>
          <button className="btn btn-soft" disabled={busy} onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy} onClick={confirmar}>{busy ? "Recebendo…" : "📥 Confirmar entrada"}</button>
        </div>
      </div>
    </div>
  );
}
