import { Quadro, type QuadroCfg } from "../components/Quadro";

const COSTURA: QuadroCfg = {
  setor: "costura",
  titulo: "Costura",
  fazerLabel: "Costurar",
  fazendoLabel: "Costurando",
  proxSetor: "revisao",
  proxSetorKit: "estoque", // kits costurados vão direto para o Estoque (Entrada)
  pedeMaquina: false,
  recursoLabel: "Costureira",
  recursoTotal: 8,
  statRecursoLabel: "Costureiras",
  statFila: "Aguardando",
  statFazendo: "Costurando",
  statPronto: "Finalizados",
  mostrarMaquinas: false,
  enviarLabel: "Enviar p/ revisão ▶",
  defeito: true,
  nota: "Peça com problema: use ⚠ Defeito (vai para 'Voltou com defeito'). Pronta: Enviar p/ revisão.",
  colunas: [
    { cor: "prioridade", titulo: "Passar na frente", sub: "Urgentes / clientes atrasados", status: "aguardando", acao: "fazer", somentePrioridade: true },
    { cor: "aguardando", titulo: "Aguardando", sub: "Para costurar", status: "aguardando", tipos: ["parte-1", "parte-2", "parte-unica"], acao: "fazer" },
    { cor: "aguardando", titulo: "Kits aguardando", sub: "Kits para costurar", status: "aguardando", tipos: ["pronta-entrega"], acao: "fazer" },
    { cor: "fazendo", titulo: "Costurando", sub: "Em produção", status: "fazendo", acao: "finalizar", acaoExtra: "defeito" },
    { cor: "pronto", titulo: "Finalizados", sub: "Prontos p/ revisão", status: "pronto", tipos: ["parte-1", "parte-2", "parte-unica"], acao: "enviar", botaoLabel: "Enviar p/ revisão ▶", acaoExtra: "defeito" },
    { cor: "pronto", titulo: "Kits finalizados", sub: "Seguir p/ estoque", status: "pronto", tipos: ["pronta-entrega"], acao: "enviar", botaoLabel: "Enviar p/ estoque ▶" },
    { cor: "defeito", titulo: "Voltou com defeito", sub: "Refazer e reenviar", status: "defeito", acao: "voltar" },
  ],
};

export function Costura() {
  return <Quadro cfg={COSTURA} />;
}
