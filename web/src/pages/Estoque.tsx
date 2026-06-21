import { Quadro, type QuadroCfg } from "../components/Quadro";

// Estoque: os kits (pronta-entrega) chegam aqui depois da Costura, na coluna
// "Entrada", são separados e ficam disponíveis. (Outras colunas a definir.)
const ESTOQUE: QuadroCfg = {
  setor: "estoque",
  titulo: "Estoque",
  fazerLabel: "Separar",
  fazendoLabel: "Separando",
  proxSetor: "expedicao",
  pedeMaquina: false,
  recursoLabel: "Estoquista",
  recursoTotal: 3,
  statRecursoLabel: "Estoquistas",
  statFila: "Entrada",
  statFazendo: "Em separação",
  statPronto: "Disponível",
  mostrarMaquinas: false,
  nota: "Os kits chegam da Costura na coluna Entrada. Separe e deixe disponível no estoque.",
  colunas: [
    { cor: "prioridade", titulo: "Passar na frente", sub: "Urgentes / clientes atrasados", status: "aguardando", acao: "fazer", somentePrioridade: true },
    { cor: "aguardando", titulo: "Entrada", sub: "Kits vindos da costura", status: "aguardando", acao: "fazer" },
    { cor: "fazendo", titulo: "Separação", sub: "Em separação", status: "fazendo", acao: "finalizar", botaoLabel: "Separado ▶" },
    { cor: "pronto", titulo: "Disponível", sub: "Pronto no estoque", status: "pronto", acao: "enviar" },
  ],
};

export function Estoque() {
  return <Quadro cfg={ESTOQUE} />;
}
