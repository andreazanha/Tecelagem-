import { useEffect, useState } from "react";
import { Atendimento } from "./Atendimento";
import { Funil } from "./Funil";
import { ComunicacaoInterna } from "./ComunicacaoInterna";
import { api } from "../api";
import { getUser } from "../auth";

// CRM em um lugar só: o FUNIL (pipeline por etapa de venda) é a visão principal,
// e a CAIXA DE ENTRADA são as conversas novas de WhatsApp que ainda não viraram lead.
// A COMUNICAÇÃO INTERNA é o chat da equipe (idêntico ao WhatsApp, o cliente não vê).
export function CrmAtendimento() {
  const inicial = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("crm") === "interna" ? "interna" : "inbox";
  const [tab, setTab] = useState<"funil" | "inbox" | "interna">(inicial);
  const eu = getUser()?.nome || "";
  const [temInterna, setTemInterna] = useState(false);

  // Bolinha piscando na aba "Comunicação interna" quando chega mensagem da equipe.
  useEffect(() => {
    if (!eu) return;
    const checar = () => api.dmResumoChat(eu).then((rs) => setTemInterna(rs.some((r) => r.nao_lido))).catch(() => {});
    checar(); const t = setInterval(checar, 8000); return () => clearInterval(t);
  }, [eu]);
  useEffect(() => { if (tab === "interna") setTemInterna(false); }, [tab]);

  return (
    <div>
      <div className="crm-tabs">
        <button className={"crm-tab" + (tab === "inbox" ? " on" : "")} onClick={() => setTab("inbox")}>💬 WhatsApp</button>
        <button className={"crm-tab" + (tab === "funil" ? " on" : "")} onClick={() => setTab("funil")}>🎯 Funil de Vendas</button>
        <button className={"crm-tab" + (tab === "interna" ? " on" : "")} onClick={() => setTab("interna")}>
          🗨️ Comunicação interna{temInterna && <span className="crm-tab-dot" />}
        </button>
      </div>
      {tab === "funil" ? <Funil /> : tab === "interna" ? <ComunicacaoInterna /> : <Atendimento />}
    </div>
  );
}
