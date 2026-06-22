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
  statPronto: "Enviados",
  mostrarMaquinas: false,
  acaoFazendo: "enviar",
  enviarLabel: "Enviar p/ corte ▶",
  nota: "Parte 1 e Parte 2 permanecem separadas — unem-se apenas no Corte. Ao passar, envie direto p/ o corte.",
  colunas: [
    { cor: "prioridade", titulo: "Passar na frente", sub: "Urgentes / clientes atrasados", status: "aguardando", acao: "fazer", somentePrioridade: true },
    { cor: "aguardando", corCard: "p1", titulo: "Aguardando", sub: "Parte 1", status: "aguardando", tipos: ["parte-1", "parte-unica"], acao: "fazer" },
    { cor: "aguardando", corCard: "p2", titulo: "Aguardando", sub: "Parte 2", status: "aguardando", tipos: ["parte-2"], acao: "fazer" },
    { cor: "aguardando", corCard: "kit", titulo: "Kits aguardando", sub: "Pedidos de estoque", status: "aguardando", tipos: ["pronta-entrega"], acao: "fazer" },
    { cor: "fazendo", titulo: "Passando", sub: "Em produção · enviar p/ corte", status: "fazendo", acao: "enviar", botaoLabel: "Enviar p/ corte ▶" },
  ],
};

export function Passadoria() {
  return <Quadro cfg={PASSADORIA} />;
}
