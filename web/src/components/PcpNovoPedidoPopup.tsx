// ETAPA 5 — POP-UP DO PCP ("Para conferir").
// Mostra, SEM recarregar a página, um aviso automático quando um pedido do ERP entra na fila de
// conferência. É só informativo: NÃO aprova, não explode e não mexe nos botões do PCP. Fica
// disponível quando a responsável volta (consulta ao entrar + a cada 25s + ao focar a aba).
// O Syntech é um PROGRAMA (desktop), não site — então o aviso só LEMBRA de aprovar lá; não há
// botão que "abre o Syntech". "Fechar" marca como tratado (não repete). Fica CENTRALIZADO.
import { useCallback, useEffect, useRef, useState } from "react";
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

  function fechar() {
    const id = n.id;
    setFila((xs) => xs.filter((x) => x.id !== id)); // tira da tela na hora
    api.pcpNotificacaoVista(id).catch(() => { /* best-effort */ });
  }

  return (
    // Overlay CENTRALIZADO (escurece a tela e põe o aviso no meio).
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(20,16,12,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div style={{ width: 460, maxWidth: "94vw", background: "#fff", borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,.34)", overflow: "hidden" }}>
        <div style={{ background: "#2c3e50", color: "#fff", padding: "16px 22px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🔔</span>
          <span style={{ fontSize: 18, fontWeight: 800 }}>Aprovar pedido no Syntech</span>
          {fila.length > 1 && <span style={{ marginLeft: "auto", background: "rgba(255,255,255,.2)", borderRadius: 999, padding: "2px 10px", fontSize: 13, fontWeight: 700 }}>+{fila.length - 1}</span>}
        </div>
        <div style={{ padding: "20px 22px" }}>
          {/* AVISO GRANDE: o que fazer */}
          <div style={{ background: "#fff7ed", border: "2px solid #ea7a3c", borderRadius: 12, padding: "14px 16px", marginBottom: 16, color: "#9a3412", fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>
            ➡️ Entre no <b>Syntech</b> e <b>aprove este pedido</b>.
            <div style={{ fontSize: 13, fontWeight: 500, color: "#b45309", marginTop: 4 }}>Enquanto não for aprovado lá, o pedido não segue.</div>
          </div>
          <div style={{ color: "#2c2721", lineHeight: 1.7, fontSize: 15 }}>
            <div>Pedido <b style={{ fontSize: 18 }}>nº {n.numero_erp}</b></div>
            <div>Cliente: <b>{n.cliente_nome || "—"}</b></div>
            {n.vendedor ? <div>Representante: <b>{n.vendedor}</b></div> : null}
            <div>Peças: <b>{Number(n.pecas) || 0}</b></div>
            <div style={{ color: "#6b6358", fontSize: 12.5, marginTop: 4 }}>Chegou às {horaChegada(n.criado_em)} · aguardando conferência</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, padding: "0 22px 20px" }}>
          <button className="btn btn-ok" style={{ flex: 1, padding: "12px 10px", fontSize: 15, fontWeight: 700 }} onClick={fechar}>Já vou aprovar</button>
        </div>
      </div>
    </div>
  );
}
