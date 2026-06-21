import { Quadro, type QuadroCfg } from "../components/Quadro";

const REVISAO: QuadroCfg = {
  setor: "revisao",
  titulo: "Revisão",
  fazerLabel: "Revisar",
  fazendoLabel: "Revisando",
  proxSetor: "expedicao",
  pedeMaquina: false,
  recursoLabel: "Revisadora",
  recursoTotal: 4,
  statRecursoLabel: "Revisadoras",
  statFila: "Aguardando",
  statFazendo: "Revisando",
  statPronto: "Revisados",
  mostrarMaquinas: false,
  nota: "Use ★ Passar na frente para os pedidos que precisam sair primeiro (clientes urgentes / atrasados).",
  colunas: [
    { cor: "prioridade", titulo: "Passar na frente", sub: "Urgentes / clientes atrasados", status: "aguardando", acao: "fazer", somentePrioridade: true },
    { cor: "aguardando", titulo: "Aguardando", sub: "Para revisar", status: "aguardando", acao: "fazer" },
    { cor: "fazendo", titulo: "Revisando", sub: "Em revisão", status: "fazendo", acao: "finalizar" },
    { cor: "pronto", titulo: "Revisados", sub: "Prontos p/ expedição", status: "pronto", acao: "enviar" },
  ],
};

export function Revisao() {
  return <Quadro cfg={REVISAO} />;
}
