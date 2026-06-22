import { Quadro, type QuadroCfg } from "../components/Quadro";

// Estoque: os kits (pronta-entrega) chegam aqui depois da Costura, na coluna
// "Entrada", são separados e ficam disponíveis. (Outras colunas a definir.)
const ESTOQUE: QuadroCfg = {
  setor: "estoque",
  titulo: "Estoque",
  fazerLabel: "Separar",
  fazendoLabel: "Separando",
  proxSetor: "revisao",
  pedeMaquina: false,
  recursoLabel: "Estoquista",
  recursoTotal: 3,
  statRecursoLabel: "Estoquistas",
  statFila: "Entrada",
  statFazendo: "Em separação",
  statPronto: "Pronta entrega",
  mostrarMaquinas: false,
  enviarLabel: "Enviar p/ revisão ▶",
  enviarSemPessoa: true, // vai p/ "Aguardando para revisar" (sem escolher revisadora)
  nota: "Kits chegam na Entrada e são separados. Em 'Pronta entrega com produção' ficam os kits de pedidos mistos — ao enviar, vão para a Revisão encontrar a Parte 1/2 (ou Única) do mesmo pedido.",
  colunas: [
    { cor: "prioridade", titulo: "Passar na frente", sub: "Urgentes / clientes atrasados", status: "aguardando", acao: "fazer", somentePrioridade: true },
    { cor: "aguardando", corCard: "kit", titulo: "Entrada", sub: "Kits vindos da costura", status: "aguardando", acao: "fazer" },
    { cor: "fazendo", corCard: "kit", titulo: "Separação", sub: "Em separação", status: "fazendo", acao: "finalizar", botaoLabel: "Separado ▶" },
    { cor: "pronto", corCard: "kit", titulo: "Pronta entrega com produção", sub: "Mistos · enviar p/ revisão", status: "pronto", acao: "enviar", botaoLabel: "Enviar p/ revisão ▶" },
  ],
};

export function Estoque() {
  return <Quadro cfg={ESTOQUE} />;
}
