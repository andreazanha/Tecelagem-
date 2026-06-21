import { Quadro, type QuadroCfg } from "../components/Quadro";

// Estoque / pronta-entrega: os kits não passam pela produção — entram direto
// para separação. Ao separar, seguem para a Revisão (coluna "Pronta entrega").
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
  statFila: "Para separar",
  statFazendo: "Em separação",
  statPronto: "Separados",
  mostrarMaquinas: false,
  acaoFazendo: "enviar",
  enviarLabel: "Separado ▶",
  nota: "Pronta-entrega entra direto na separação. Ao concluir (Separado), segue para a Revisão.",
  colunas: [
    { cor: "prioridade", titulo: "Passar na frente", sub: "Urgentes / clientes atrasados", status: "aguardando", acao: "fazer", somentePrioridade: true },
    { cor: "aguardando", titulo: "Para separar", sub: "Kits / pronta-entrega", status: "aguardando", acao: "fazer" },
    { cor: "fazendo", titulo: "Separação", sub: "Em separação", status: "fazendo", acao: "enviar", botaoLabel: "Separado ▶" },
  ],
};

export function Estoque() {
  return <Quadro cfg={ESTOQUE} />;
}
