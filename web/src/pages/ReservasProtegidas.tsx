// ETAPA 7 — RESERVAS PROTEGIDAS (conferência manual).
// Pedidos da loja RECEBIDOS no Syntech ('enviado') que ainda seguram estoque. A reserva NÃO
// expira sozinha; só uma liberação MANUAL por usuário autorizado (com motivo, registrado) a
// encerra — enquanto a ponte não detectar cancelamentos de verdade. Não aprova nem produz nada.
import { useCallback, useEffect, useState } from "react";
import { api, type ReservaProtegida } from "../api";

function dataHora(iso?: string | null): string {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso.replace(" ", "T") + "Z")); } catch { return iso; }
}

export function ReservasProtegidas() {
  const [lista, setLista] = useState<ReservaProtegida[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState("");
  const [liberar, setLiberar] = useState<ReservaProtegida | null>(null);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    api.reservasProtegidas().then((r) => setLista(r.reservas || [])).catch(() => setLista([])).finally(() => setCarregando(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function confirmar() {
    if (!liberar) return;
    if (motivo.trim().length < 3) { setMsg("Escreva o motivo da liberação."); return; }
    setBusy(true);
    try {
      const r = await api.reservaLiberar(liberar.id, motivo.trim());
      if (r.error) setMsg(r.msg || "Não consegui liberar (sem permissão?).");
      else { setMsg(`✓ Reserva do pedido nº ${liberar.erp_numero ?? "—"} liberada (${r.liberadas ?? 0} peça(s)). Registrado no histórico.`); setLiberar(null); setMotivo(""); carregar(); }
    } catch { setMsg("Falha ao liberar. Tente de novo."); } finally { setBusy(false); }
  }

  return (
    <div className="quadro-page">
      <div className="page-head">
        <div><h1>Reservas protegidas</h1><div className="breadcrumb">PCP › Estoque reservado de pedidos recebidos no Syntech</div></div>
        <button className="btn" onClick={carregar}>↻ Atualizar</button>
      </div>
      <div className="card pad" style={{ background: "#fbf0e3", border: "1px solid #eadcc6", color: "#8a5a2b", marginBottom: 12, fontSize: 13.5, lineHeight: 1.5 }}>
        Estes pedidos já foram <b>recebidos no Syntech</b> e seguem <b>aguardando aprovação</b>. O estoque fica
        <b> protegido indefinidamente</b> — não expira por tempo. Só libere a reserva se confirmar que o pedido foi
        <b> cancelado/excluído no Syntech</b> ou que o estoque já foi devolvido. A liberação pede um <b>motivo</b> e fica registrada.
      </div>
      {msg && <div className="card pad" style={{ marginBottom: 12 }}>{msg}</div>}
      {carregando ? <div className="card pad">Carregando…</div> : !lista.length ? (
        <div className="card pad muted">Nenhuma reserva protegida no momento. 👍</div>
      ) : (
        <div className="crm-card"><div className="crm-scroll">
          <table className="crm">
            <thead><tr><th>Pedido (Syntech)</th><th>Cliente</th><th>Representante</th><th style={{ textAlign: "center" }}>Peças reservadas</th><th>Recebido em</th><th></th></tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id}>
                  <td><b>nº {r.erp_numero ?? "—"}</b></td>
                  <td>{r.cliente_nome || "—"}</td>
                  <td>{r.vendedor ? <span className="rep-cli">🧑‍💼 {r.vendedor}</span> : <span className="muted2">—</span>}</td>
                  <td style={{ textAlign: "center" }}>{Number(r.pecas) || 0}</td>
                  <td>{dataHora(r.erp_sync_em)}</td>
                  <td><button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => { setLiberar(r); setMotivo(""); setMsg(""); }}>Liberar reserva…</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
      {liberar && (
        <div onClick={() => !busy && setLiberar(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} className="card pad" style={{ width: 460, maxWidth: "94vw", background: "#fff", borderRadius: 14 }}>
            <h3 style={{ marginTop: 0 }}>Liberar reserva — pedido nº {liberar.erp_numero ?? "—"}</h3>
            <div className="muted2" style={{ marginBottom: 8 }}>
              Cliente: <b>{liberar.cliente_nome || "—"}</b> · {Number(liberar.pecas) || 0} peça(s). Isto <b>solta o estoque</b> reservado
              por este pedido. Use só com confirmação de cancelamento/exclusão no Syntech.
            </div>
            <textarea className="inp" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obrigatório) — ex.: pedido cancelado no Syntech pelo cliente" rows={3} style={{ width: "100%", padding: 10 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn btn-soft" disabled={busy} onClick={() => setLiberar(null)}>Cancelar</button>
              <button className="btn btn-danger" disabled={busy} onClick={confirmar}>{busy ? "Liberando…" : "Confirmar liberação"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
