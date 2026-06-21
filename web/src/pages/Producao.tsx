import { Quadro, type QuadroCfg } from "../components/Quadro";

const TECELAGEM: QuadroCfg = {
  setor: "tecelagem",
  titulo: "Tecelagem",
  fazerLabel: "Tecer",
  fazendoLabel: "Tecendo",
  proxSetor: "passadoria",
  pedeMaquina: false,
  recursoLabel: "Operador",
  recursoTotal: 8,
  statRecursoLabel: "Operadores ativos",
  statFila: "Aguardando",
  statFazendo: "Tecendo",
  statPronto: "Tecidos",
  mostrarMaquinas: false,
  nota:
    "Parte 1 e Parte 2 seguem separadas até o Corte. Use ★ Passar na frente p/ priorizar pedidos urgentes. Clique no card p/ detalhes.",
  colunas: [
    { cor: "prioridade", titulo: "Passar na frente", sub: "Urgentes / clientes atrasados", status: "aguardando", acao: "fazer", somentePrioridade: true },
    { cor: "aguardando", titulo: "Aguardando", sub: "Máquina 3 · Parte 1 / Única", status: "aguardando", tipos: ["parte-1", "parte-unica"], acao: "fazer" },
    { cor: "aguardando", titulo: "Aguardando", sub: "Máquina 7 · Parte 2", status: "aguardando", tipos: ["parte-2"], acao: "fazer" },
    { cor: "fazendo", titulo: "Tecendo", sub: "Em produção", status: "fazendo", acao: "finalizar" },
    { cor: "pronto", titulo: "Tecidos", sub: "Partes prontas", status: "pronto", tipos: ["parte-1", "parte-2", "parte-unica"], acao: "enviar" },
  ],
};

export function Producao() {
  return <Quadro cfg={TECELAGEM} />;
}
