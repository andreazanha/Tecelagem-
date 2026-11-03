// ETAPA 6 — POP-UP INDIVIDUAL NO CRM ("Seu cliente fez um pedido!").
// Aparece só para o VENDEDOR INTERNO dono da carteira do cliente (o servidor filtra pelo usuário
// logado; o CRM nunca confia só no visual). Só informativo: NÃO aprova/recusa/altera pedidos.
// Fica salvo se o CRM estava fechado (consulta ao entrar + a cada 25s + ao focar). Não repete.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type CrmNotificacao } from "../api";

function brl(v?: number | null): string {
  if (v == null) return "—";
  try { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); } catch { return `R$ ${v}`; }
}
function dataHora(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso.replace(" ", "T") + "Z");
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch { return ""; }
}

export function CrmPedidoPopup() {
  const [fila, setFila] = useState<CrmNotificacao[]>([]);
  const [hist, setHist] = useState<CrmNotificacao[] | null>(null);
  const nav = useNavigate();
  const ocupado = useRef(false);

  const carregar = useCallback(() => {
    if (ocupado.current) return;
    ocupado.current = true;
    api.crmNotificacoes(false)
      .then((r) => setFila(r.notificacoes || []))
      .catch(() => { /* sem sessão/offline → nada */ })
      .finally(() => { ocupado.current = false; });
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(() => { if (!document.hidden) carregar(); }, 25000);
    const onFoco = () => { if (!document.hidden) carregar(); };
    window.addEventListener("focus", onFoco);
    document.addEventListener("visibilitychange", onFoco);
    return () => { clearInterval(t); window.removeEventListener("focus", onFoco); document.removeEventListener("visibilitychange", onFoco); };
  }, [carregar]);

  function marcar(n: CrmNotificacao, ir: boolean) {
    setFila((xs) => xs.filter((x) => x.id !== n.id));
    api.crmNotificacaoVista(n.id).catch(() => {});
    if (ir && n.cliente_id) nav(`/clientes/${n.cliente_id}`);
  }

  const abrirHist = () => api.crmNotificacoes(true).then((r) => setHist(r.notificacoes || [])).catch(() => setHist([]));

  if (!fila.length && hist == null) return null;
  const n = fila[0];

  return (
    <>
      {n && (
        <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 9000, width: 360, maxWidth: "92vw",
          background: "#fff", border: "1px solid #e3ddd2", borderRadius: 14, boxShadow: "0 16px 44px rgba(0,0,0,.22)", overflow: "hidden", fontSize: 14 }}>
          <div style={{ background: "#3730a3", color: "#fff", padding: "10px 14px", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <span>🎉 Seu cliente fez um pedido!</span>
            {fila.length > 1 && <span style={{ marginLeft: "auto", background: "rgba(255,255,255,.2)", borderRadius: 999, padding: "1px 8px", fontSize: 12 }}>{fila.length}</span>}
          </div>
          <div style={{ padding: "12px 14px", color: "#2c2721", lineHeight: 1.55 }}>
            <div>Cliente: <b>{n.cliente_nome || "—"}</b></div>
            <div>Pedido nº <b>{n.numero_erp || "—"}</b></div>
            {n.valor_total != null && <div>Valor total: <b>{brl(n.valor_total)}</b></div>}
            <div>Peças: <b>{Number(n.pecas) || 0}</b></div>
            <div>Recebido em: <b>{dataHora(n.recebido_em || n.criado_em)}</b></div>
            {n.representante ? <div>Representante: <b>{n.representante}</b></div> : null}
            <div style={{ marginTop: 4, color: "#166534", fontWeight: 700 }}>Status: Pedido recebido</div>
          </div>
          <div style={{ display: "flex", gap: 8, padding: "0 14px 12px", alignItems: "center" }}>
            <button className="btn btn-ok" style={{ flex: 1, padding: "9px 10px" }} onClick={() => marcar(n, true)}>Ver pedido</button>
            <button className="btn btn-soft" style={{ flex: 1, padding: "9px 10px" }} onClick={() => marcar(n, false)}>Fechar</button>
            <button className="btn" style={{ padding: "9px 10px", background: "transparent" }} title="Histórico de avisos" onClick={abrirHist}>🕑</button>
          </div>
        </div>
      )}
      {hist != null && (
        <div onClick={() => setHist(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 9100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "94vw", maxHeight: "80vh", overflow: "auto", background: "#fff", borderRadius: 14, padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>🕑 Meus avisos de pedidos</h3>
            {hist.length === 0 ? <div className="muted2">Nenhum aviso ainda.</div> : (
              <table className="crm" style={{ width: "100%", fontSize: 13 }}>
                <thead><tr><th>Cliente</th><th>Pedido</th><th>Peças</th><th>Recebido</th><th></th></tr></thead>
                <tbody>
                  {hist.map((h) => (
                    <tr key={h.id}>
                      <td>{h.cliente_nome || "—"}{h.visto_em ? "" : " 🔵"}</td>
                      <td>{h.numero_erp || "—"}</td>
                      <td style={{ textAlign: "center" }}>{Number(h.pecas) || 0}</td>
                      <td>{dataHora(h.recebido_em || h.criado_em)}</td>
                      <td>{h.cliente_id ? <button className="btn btn-soft" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => { setHist(null); nav(`/clientes/${h.cliente_id}`); }}>ver</button> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ textAlign: "right", marginTop: 12 }}><button className="btn btn-soft" onClick={() => setHist(null)}>Fechar</button></div>
          </div>
        </div>
      )}
    </>
  );
}
