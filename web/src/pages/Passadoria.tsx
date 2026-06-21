import { Quadro, type QuadroCfg } from "../components/Quadro";

const PASSADORIA: QuadroCfg = {
  setor: "passadoria",
  titulo: "Passadoria",
  fazerLabel: "Passar",
  fazendoLabel: "Passando",
  proxSetor: "corte",
  pedeMaquina: false,
  recursoLabel: "Passadeira",
  recursoTotal: 4,
  statRecursoLabel: "Passadeiras",
  statFila: "Em fila",
  statFazendo: "Passando",
  statPronto: "Finalizados hoje",
  mostrarMaquinas: false,
  nota: "Parte 1 e Parte 2 permanecem separadas — unem-se apenas no Corte. Use ★ Passar na frente p/ priorizar.",
  colunas: [
    { cor: "prioridade", titulo: "Passar na frente", sub: "Urgentes / clientes atrasados", status: "aguardando", acao: "fazer", somentePrioridade: true },
    { cor: "aguardando", titulo: "Aguardando", sub: "Parte 1", status: "aguardando", tipos: ["parte-1", "parte-unica"], acao: "fazer" },
    { cor: "aguardando", titulo: "Aguardando", sub: "Parte 2", status: "aguardando", tipos: ["parte-2"], acao: "fazer" },
    { cor: "fazendo", titulo: "Passando", sub: "Em produção", status: "fazendo", acao: "finalizar" },
    { cor: "pronto", titulo: "Finalizados", sub: "Parte 1", status: "pronto", tipos: ["parte-1", "parte-unica"], acao: "enviar" },
    { cor: "pronto", titulo: "Finalizados", sub: "Parte 2", status: "pronto", tipos: ["parte-2"], acao: "enviar" },
  ],
};

export function Passadoria() {
  return <Quadro cfg={PASSADORIA} />;
}
