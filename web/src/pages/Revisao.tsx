import { useEffect, useState } from "react";
import { Quadro, type QuadroCfg, type ColCfg } from "../components/Quadro";
import { api } from "../api";

// Revisão é organizada por REVISADORA: cada coluna é uma revisadora (cadastro de
// Operadores, setor Revisão). Mantém "Passar na frente" e "Aguardando para enviar".
const BASE: Omit<QuadroCfg, "colunas"> = {
  setor: "revisao",
  titulo: "Revisão",
  fazerLabel: "Revisar",
  fazendoLabel: "Revisando",
  proxSetor: "expedicao",
  pedeMaquina: false,
  recursoLabel: "Revisadora",
  recursoTotal: 6,
  statRecursoLabel: "Revisadoras",
  statFila: "Aguardando",
  statFazendo: "Revisando",
  statPronto: "—",
  mostrarMaquinas: false,
  enviarLabel: "Enviar p/ expedição ▶",
  nota: "Cada coluna é uma revisadora. Em 'Aguardando para enviar', toque em Revisar e escolha a revisadora; no card dela, Enviar p/ expedição.",
};

export function Revisao() {
  const [revisadoras, setRevisadoras] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    api.listarOperadores("revisao").then(setRevisadoras).catch(() => {});
  }, []);

  const colunas: ColCfg[] = [
    { cor: "prioridade", titulo: "Passar na frente", sub: "Urgentes / clientes atrasados", status: "aguardando", acao: "fazer", somentePrioridade: true },
    { cor: "aguardando", titulo: "Aguardando para enviar", sub: "Chegou da costura", status: "aguardando", operador: "", acao: "fazer", botaoLabel: "Revisar ▶" },
    ...revisadoras.map<ColCfg>((r) => ({
      cor: "fazendo",
      titulo: r.nome,
      sub: "Revisadora",
      status: "fazendo",
      operador: r.nome,
      acao: "enviar",
    })),
  ];

  return <Quadro cfg={{ ...BASE, colunas }} />;
}
