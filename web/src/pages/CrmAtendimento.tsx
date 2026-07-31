import { useState } from "react";
import { Atendimento } from "./Atendimento";
import { Funil } from "./Funil";

// CRM em um lugar só: o FUNIL (pipeline por etapa de venda) é a visão principal,
// e a CAIXA DE ENTRADA são as conversas novas de WhatsApp que ainda não viraram lead.
export function CrmAtendimento() {
  const [tab, setTab] = useState<"funil" | "inbox">("funil");
  return (
    <div>
      <div className="crm-tabs">
        <button className={"crm-tab" + (tab === "funil" ? " on" : "")} onClick={() => setTab("funil")}>🎯 Funil de Vendas</button>
        <button className={"crm-tab" + (tab === "inbox" ? " on" : "")} onClick={() => setTab("inbox")}>📥 Caixa de entrada</button>
      </div>
      {tab === "funil" ? <Funil /> : <Atendimento />}
    </div>
  );
}
