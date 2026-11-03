// ETAPA 5 — POP-UP DO PCP ("Para conferir").
// Mostra, SEM recarregar a página, um aviso automático quando um pedido do ERP entra na fila de
// conferência. É só informativo: NÃO aprova, não explode e não mexe nos botões do PCP. Fica
// disponível quando a responsável volta (consulta ao entrar + a cada 25s + ao focar a aba).
// "Ver pedido" leva à tela Pedidos do ERP; "Fechar" marca como tratado (não repete).
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type PcpNotificacao } from "../api";

function horaChegada(iso: string): string {
  // criado_em vem em UTC ('YYYY-MM-DD HH:MM:SS'); mostra no horário de Brasília.
  try {
    const d = new Date(iso.replace(" ", "T") + "Z");
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch { return ""; }
}

export function PcpNovoPedidoPopup() {
  const [fila, setFila] = useState<PcpNotificacao[]>([]);
  const nav = useNavigate();
  const ocupado = useRef(false);

  const carregar = useCallback(() => {
    if (ocupado.current) return;
    ocupado.current = true;
    api.pcpNotificacoes()
      .then((r) => setFila(r.notificacoes || []))
      .catch(() => { /* sem permissão / offline → não mostra nada */ })
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

  if (!fila.length) return null;
  const n = fila[0]; // mostra um de cada vez (o mais recente); os demais aparecem em seguida

  function marcarTratada(ir: boolean) {
    const id = n.id;
    setFila((xs) => xs.filter((x) => x.id !== id)); // tira da tela na hora
    api.pcpNotificacaoVista(id).catch(() => { /* best-effort */ });
    if (ir) nav("/pedidos-erp");
  }

  return (
    <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 9000, width: 340, maxWidth: "92vw",
      background: "#fff", border: "1px solid #e3ddd2", borderRadius: 14, boxShadow: "0 16px 44px rgba(0,0,0,.22)", overflow: "hidden", fontSize: 14 }}>
      <div style={{ background: "#2c3e50", color: "#fff", padding: "10px 14px", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
        <span>🔔 Novo pedido para conferir</span>
        {fila.length > 1 && <span style={{ marginLeft: "auto", background: "rgba(255,255,255,.2)", borderRadius: 999, padding: "1px 8px", fontSize: 12 }}>{fila.length}</span>}
      </div>
      <div style={{ padding: "12px 14px", color: "#2c2721", lineHeight: 1.5 }}>
        <div>Pedido <b>nº {n.numero_erp}</b></div>
        <div>Cliente: <b>{n.cliente_nome || "—"}</b></div>
        {n.vendedor ? <div>Representante: <b>{n.vendedor}</b></div> : null}
        <div>Peças: <b>{Number(n.pecas) || 0}</b></div>
        <div style={{ color: "#6b6358", fontSize: 12.5, marginTop: 2 }}>Chegou às {horaChegada(n.criado_em)} · aguardando conferência</div>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "0 14px 14px" }}>
        <button className="btn btn-ok" style={{ flex: 1, padding: "9px 10px" }} onClick={() => marcarTratada(true)}>Ver pedido</button>
        <button className="btn btn-soft" style={{ flex: 1, padding: "9px 10px" }} onClick={() => marcarTratada(false)}>Fechar</button>
      </div>
    </div>
  );
}
