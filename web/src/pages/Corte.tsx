import { Quadro, type QuadroCfg } from "../components/Quadro";

const CORTE: QuadroCfg = {
  setor: "corte",
  titulo: "Corte",
  fazerLabel: "Cortar",
  fazendoLabel: "Cortando",
  proxSetor: "costura",
  pedeMaquina: false,
  recursoLabel: "Cortador",
  recursoTotal: 4,
  statRecursoLabel: "Cortadores",
  statFila: "Aguardando",
  statFazendo: "Cortando",
  statPronto: "Cortados",
  mostrarMaquinas: false,
  nota: "Parte 1 e Parte 2 se unem no Corte. Use ★ Passar na frente para clientes urgentes / pedidos atrasados.",
  colunas: [
    { cor: "prioridade", titulo: "Passar na frente", sub: "Urgentes / clientes atrasados", status: "aguardando", acao: "fazer", somentePrioridade: true },
    { cor: "aguardando", titulo: "Aguardando", sub: "Para cortar", status: "aguardando", acao: "fazer" },
    { cor: "fazendo", titulo: "Cortando", sub: "Em produção", status: "fazendo", acao: "finalizar" },
    { cor: "pronto", titulo: "Cortados", sub: "Prontos p/ costura", status: "pronto", acao: "enviar" },
  ],
};

export function Corte() {
  return <Quadro cfg={CORTE} />;
}
