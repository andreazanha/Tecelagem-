import { Quadro, type QuadroCfg } from "../components/Quadro";

const CORTE: QuadroCfg = {
  setor: "corte",
  titulo: "Corte",
  fazerLabel: "Cortar",
  fazendoLabel: "Cortando",
  proxSetor: "costura",
  escolherOperadorAoEnviar: true, // ao enviar, escolhe a costureira que vai receber
  enviarLabel: "Enviar p/ costura ▶",
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
    { cor: "aguardando", titulo: "Aguardando", sub: "Para cortar", status: "aguardando", tipos: ["parte-1", "parte-2", "parte-unica"], acao: "fazer" },
    { cor: "aguardando", corCard: "kit", titulo: "Aguardando kits", sub: "Kits para cortar", status: "aguardando", tipos: ["pronta-entrega"], acao: "fazer" },
    { cor: "fazendo", titulo: "Cortando", sub: "Em produção", status: "fazendo", acao: "finalizar" },
    { cor: "pronto", titulo: "Cortados", sub: "Prontos p/ costura", status: "pronto", tipos: ["parte-1", "parte-2", "parte-unica"], acao: "enviar" },
    { cor: "pronto", corCard: "kit", titulo: "Kits cortados", sub: "Seguir p/ costura", status: "pronto", tipos: ["pronta-entrega"], acao: "enviar" },
  ],
};

export function Corte() {
  return <Quadro cfg={CORTE} />;
}
