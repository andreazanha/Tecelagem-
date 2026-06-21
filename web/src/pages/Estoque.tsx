import { Quadro, type QuadroCfg } from "../components/Quadro";

// Estoque / pronta-entrega: os kits não passam pela produção — entram direto
// para separação. (Outras colunas serão definidas conforme o fluxo.)
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
  statFila: "Para separar",
  statFazendo: "Em separação",
  statPronto: "Separados",
  mostrarMaquinas: false,
  nota: "Pronta-entrega entra direto na separação (mistos: o kit vai à frente). Use ★ Passar na frente p/ priorizar.",
  colunas: [
    { cor: "aguardando", titulo: "Para separar", sub: "Kits / pronta-entrega", status: "aguardando", acao: "fazer" },
    { cor: "fazendo", titulo: "Separação", sub: "Em separação", status: "fazendo", acao: "finalizar" },
    { cor: "pronto", titulo: "Separados", sub: "Prontos p/ expedição", status: "pronto", acao: "enviar" },
  ],
};

export function Estoque() {
  return <Quadro cfg={ESTOQUE} />;
}
