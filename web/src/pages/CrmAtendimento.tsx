import { useState } from "react";
import { Atendimento } from "./Atendimento";
import { Funil } from "./Funil";

// CRM em um lugar só: o FUNIL (pipeline por etapa de venda) é a visão principal,
// e a CAIXA DE ENTRADA são as conversas novas de WhatsApp que ainda não viraram lead.
export function CrmAtendimento() {
  const [tab, setTab] = useState<"funil" | "inbox">("inbox");

  // O toggle Conversas/Funil é renderizado DENTRO de cada tela (ao lado do "Acompanhar"),
  // por isso passamos o estado da aba pra elas.
  return (
    <div>
      {tab === "funil" ? <Funil crmTab={tab} onCrmTab={setTab} /> : <Atendimento crmTab={tab} onCrmTab={setTab} />}
    </div>
  );
}
