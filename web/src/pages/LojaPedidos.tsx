import { Fragment, useEffect, useState } from "react";
import { api, type LojaPedido, type LojaPedidoItem } from "../api";

const brl = (v: number | null) => "R$ " + (Number(v) || 0).toFixed(2).replace(".", ",");
// O banco guarda os horários em UTC ("YYYY-MM-DD HH:MM:SS", sem fuso). Aqui convertemos
// pro horário de Brasília (America/Sao_Paulo) pra não mostrar 3h adiantado.
const dataHora = (em: string | null) => {
  const s = String(em || "").trim();
  if (!s) return "—";
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + "Z");
  if (isNaN(d.getTime())) return s.replace("T", " ").slice(0, 16);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// No modo AUTOMÁTICO ("on"), pedido de cliente direto (sem vendedor) vai sozinho pela
// ponte — não precisa liberar. Só pedido de REPRESENTANTE (tem vendedor) ainda espera
// a liberação. Isso decide tanto o texto da situação quanto se aparece o botão "Liberar".
function precisaLiberar(p: LojaPedido, modo: string): boolean {
  if (p.erp_sync_status !== "pendente" || Number(p.erp_liberado) === 1) return false;
  if (modo === "on") return !!String(p.vendedor || "").trim();   // só representante
  return true;                                                    // teste/off: sempre
}

function statusTxt(p: LojaPedido, modo: string): { txt: string; cor: string } {
  if (p.erp_sync_status === "enviado") return { txt: "✓ No Syntech" + (p.erp_numero ? " (nº " + p.erp_numero + ")" : ""), cor: "#166534" };
  if (p.erp_sync_status === "erro") return { txt: "⚠ Erro ao enviar", cor: "#b91c1c" };
  if (Number(p.erp_liberado) === 1) return { txt: "Liberado — a ponte envia em ~2 min", cor: "#92610a" };
  if (modo === "on" && !precisaLiberar(p, modo)) return { txt: "Automático — a ponte envia em ~2 min", cor: "#92610a" };
  return { txt: "Aguardando liberação", cor: "#555" };
}

export function LojaPedidos() {
  const [modo, setModo] = useState<string>("teste");
  const [pedidos, setPedidos] = useState<LojaPedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<string | null>(null);
  const [itens, setItens] = useState<Record<string, LojaPedidoItem[]>>({});
  const [agindo, setAgindo] = useState<string | null>(null);
  const [ponte, setPonte] = useState<{ status: string; ha_segundos: number | null; ultimo_contato: string | null } | null>(null);

  function carregar() {
    setCarregando(true);
    api.lojaPedidos().then((d) => { setModo(d.modo || "teste"); setPedidos(d.pedidos || []); }).catch(() => setPedidos([])).finally(() => setCarregando(false));
  }
  function carregarPonte() {
    fetch("/api/integracao/ponte-status", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) setPonte(j); })
      .catch(() => { /* offline: mantém último estado */ });
  }
  useEffect(() => {
    carregar(); carregarPonte();
    const t = setInterval(() => { carregar(); carregarPonte(); }, 15000);
    return () => clearInterval(t); /* eslint-disable-next-line */
  }, []);

  function verItens(id: string) {
    if (aberto === id) { setAberto(null); return; }
    setAberto(id);
    if (!itens[id]) api.lojaPedidoDetalhe(id).then((d) => setItens((m) => ({ ...m, [id]: d.itens || [] }))).catch(() => {});
  }
  async function liberar(id: string) {
    if (!confirm("Liberar este pedido para ir ao Syntech? Ele entra como ORÇAMENTO/PENDENTE lá (dá para conferir e excluir no Syntech).")) return;
    setAgindo(id); try { await api.lojaLiberar(id); carregar(); } finally { setAgindo(null); }
  }
  async function reenviar(id: string) {
    setAgindo(id); try { await api.lojaReenviar(id); carregar(); } finally { setAgindo(null); }
  }
  async function reenviarForcado(id: string) {
    if (!confirm("Reenviar este pedido ao Syntech?\n\n⚠️ Use SÓ se você CONFERIU que ele NÃO está no Syntech. Ele vai entrar de novo e ganhar um número novo. Se já estiver lá, vai DUPLICAR.")) return;
    setAgindo(id); try { await api.lojaReenviar(id, true); carregar(); } finally { setAgindo(null); }
  }
  async function excluir(id: string) {
    if (!confirm("Excluir este pedido da loja?\n\nIsso apaga do NOSSO sistema (não apaga do Syntech — se já entrou lá como orçamento, exclua por lá).")) return;
    setAgindo(id); try { await api.lojaExcluir(id); carregar(); } finally { setAgindo(null); }
  }
  async function limparTodos() {
    if (!confirm("Excluir TODOS os pedidos da loja (B2B)?\n\n⚠️ Isso apaga TODOS daqui do sistema — bom pra limpar os testes. NÃO apaga do Syntech. Não dá pra desfazer.")) return;
    if (!confirm("Tem certeza? Vai apagar todos os pedidos da loja de uma vez.")) return;
    setAgindo("todos"); try { await api.lojaLimparTodos(); carregar(); } finally { setAgindo(null); }
  }
  async function trocarModo(m: string) {
    if (m === "on" && !confirm("Ligar o envio AUTOMÁTICO? A partir de agora TODO pedido da loja vai sozinho pro Syntech (como orçamento). Confirme só depois do pedido de teste ter dado certo.")) return;
    try { await api.lojaConfig(m); setModo(m); carregar(); } catch { alert("Não consegui mudar o modo."); }
  }

  const pil = (val: string, txt: string, hint: string) => (
    <button className={"btn " + (modo === val ? "btn-primary" : "btn-soft")} style={{ padding: "8px 12px", flexDirection: "column", alignItems: "flex-start", height: "auto" }} onClick={() => trocarModo(val)} title={hint}>
      <b>{txt}</b><span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>{hint}</span>
    </button>
  );

  return (
    <>
      <div className="page-head"><div><h1>Pedidos da Loja (B2B)</h1><div className="breadcrumb">Gestão › Pedidos vindos do catálogo online</div></div>
        <div style={{ display: "flex", gap: 8 }}>
          {pedidos.length > 0 ? (
            <button className="btn btn-soft" style={{ color: "#b91c1c" }} disabled={agindo === "todos"} onClick={limparTodos}>{agindo === "todos" ? "Excluindo…" : "🗑 Excluir todos"}</button>
          ) : null}
          <button className="btn btn-soft" onClick={carregar}>Atualizar</button>
        </div>
      </div>

      {ponte && ponte.status !== "ativa" ? (() => {
        const s = ponte.ha_segundos;
        const quando = s == null ? "nunca contatou" : s < 90 ? "agora" : s < 3600 ? `há ${Math.round(s / 60)} min` : s < 86400 ? `há ${Math.round(s / 3600)} h` : `há ${Math.round(s / 86400)} dia(s)`;
        const parada = ponte.status === "parada" || ponte.status === "sem_dados";
        const cor = parada ? "#b91c1c" : "#b45309";   // vermelho = parada, âmbar = atrasada
        return (
          <div className="card" style={{ padding: "14px 16px", marginBottom: 14, background: cor + "14", border: `2px solid ${cor}`, color: cor }}>
            <div style={{ fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 20 }}>{parada ? "⛔" : "⚠️"}</span>
              {parada ? "A PONTE ESTÁ PARADA — nenhum pedido está indo para o Syntech" : "A ponte está ATRASADA — os pedidos podem estar demorando a ir"}
            </div>
            <div style={{ fontSize: 13, marginTop: 6, color: cor, opacity: 0.95 }}>
              Último contato da ponte: <b>{quando}</b>{ponte.ultimo_contato ? ` (${new Date(ponte.ultimo_contato).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })})` : ""}.
              {parada ? " Ligue/reinicie a ponte no PC da fábrica (tarefa “TecelagemPonte” ou o start.bat). Assim que ela voltar, os pedidos abaixo vão sozinhos." : " Pode ser que o PC da fábrica tenha dormido ou a internet oscilou."}
            </div>
          </div>
        );
      })() : null}

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Envio para o Syntech</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {pil("off", "Desligado", "Não envia nada")}
          {pil("teste", "Teste", "Só envia os que você LIBERAR, um a um")}
          {pil("on", "Automático", "Envia TODO pedido da loja sozinho")}
        </div>
        <div style={{ fontSize: 12, color: "#777", marginTop: 8 }}>
          Os pedidos entram no Syntech como <b>orçamento/pendente</b> (não vão direto pra produção) — dá pra conferir e, se precisar, excluir lá. Comece no <b>Teste</b>, libere 1 pedido, confira no Syntech, e só então ligue o <b>Automático</b>.
        </div>
      </div>

      {carregando && !pedidos.length ? <div style={{ padding: 20, color: "#777" }}>Carregando…</div> : null}
      {!carregando && !pedidos.length ? <div className="card" style={{ padding: 20, color: "#777" }}>Nenhum pedido da loja ainda. Quando um cliente finalizar um pedido no catálogo online (com o CNPJ), ele aparece aqui.</div> : null}

      {pedidos.length ? (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Quando</th><th>Cliente</th><th>CNPJ</th><th style={{ textAlign: "right" }}>Peças</th><th style={{ textAlign: "right" }}>Total</th><th>Situação</th><th></th></tr></thead>
            <tbody>
              {pedidos.map((p) => {
                const s = statusTxt(p, modo);
                return (
                  <Fragment key={p.id}>
                    <tr>
                      <td>{dataHora(p.created_at || p.data_pedido)}</td>
                      <td>{p.cliente_nome || "—"}</td>
                      <td>{p.cliente_cnpj || "—"}</td>
                      <td style={{ textAlign: "right" }}>{p.pecas ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{brl(p.valor_total)}</td>
                      <td style={{ color: s.cor }}>{s.txt}{p.erp_sync_status === "erro" && p.erp_sync_erro ? <div style={{ fontSize: 11 }}>{p.erp_sync_erro}</div> : null}</td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        <button className="btn btn-soft" style={{ padding: "5px 9px", marginRight: 6 }} onClick={() => verItens(p.id)}>{aberto === p.id ? "Fechar" : "Ver itens"}</button>
                        {precisaLiberar(p, modo) ? (
                          <button className="btn btn-primary" style={{ padding: "5px 9px" }} disabled={agindo === p.id} onClick={() => liberar(p.id)}>{agindo === p.id ? "…" : "Liberar envio"}</button>
                        ) : null}
                        {p.erp_sync_status === "erro" ? (
                          <button className="btn btn-primary" style={{ padding: "5px 9px" }} disabled={agindo === p.id} onClick={() => reenviar(p.id)}>{agindo === p.id ? "…" : "Tentar de novo"}</button>
                        ) : null}
                        {p.erp_sync_status === "enviado" ? (
                          <button className="btn btn-soft" style={{ padding: "5px 9px", color: "#b45309" }} title="Use só se conferiu que o pedido NÃO está no Syntech" disabled={agindo === p.id} onClick={() => reenviarForcado(p.id)}>{agindo === p.id ? "…" : "↻ Reenviar"}</button>
                        ) : null}
                        <button className="btn btn-soft" style={{ padding: "5px 9px", marginLeft: 6, color: "#b91c1c" }} title="Excluir pedido" disabled={agindo === p.id} onClick={() => excluir(p.id)}>🗑</button>
                      </td>
                    </tr>
                    {aberto === p.id ? (
                      <tr><td colSpan={7} style={{ background: "var(--bg-soft)", color: "var(--ink)" }}>
                        {!itens[p.id] ? <div style={{ padding: 8, color: "var(--muted)" }}>Carregando itens…</div> : (
                          <table className="table" style={{ margin: 4 }}>
                            <thead><tr><th>Produto</th><th>Ref</th><th>Cor</th><th>Tamanho</th><th style={{ textAlign: "right" }}>Qtd</th><th style={{ textAlign: "right" }}>Preço</th></tr></thead>
                            <tbody>
                              {itens[p.id].map((it, i) => (
                                <tr key={i}>
                                  <td>{it.produto || "—"}</td>
                                  <td>{it.ref || "—"}</td>
                                  <td>{(it.cor_grade || "—") + (it.cod_cor != null ? " (cód " + it.cod_cor + ")" : "")}</td>
                                  <td>{it.tamanho || it.erp_tamanho || "—"}{it.erp_tamanho && it.erp_tamanho !== it.tamanho ? " [" + it.erp_tamanho + "]" : ""}</td>
                                  <td style={{ textAlign: "right" }}>{it.qtd}</td>
                                  <td style={{ textAlign: "right" }}>{brl(it.valor_unit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td></tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
