import { Quadro, type QuadroCfg } from "../components/Quadro";

// PCP › Pedidos — mesma grade da Tecelagem (Parte 1 · Parte 2 · Únicos · Reposição), mas é aqui que
// o PCP LIBERA os pedidos. Todo pedido nasce bloqueado 🔒; enquanto preso ele aparece com cadeado na
// Tecelagem (sem poder iniciar). O PCP clica em "🔓 Liberar" (senha + função pcp.liberar) e o pedido
// cai na fila da Tecelagem. Lê os mesmos cards do setor tecelagem.
const PCP: QuadroCfg = {
  setor: "tecelagem",
  pcp: true,
  painel: true,
  titulo: "PCP · Pedidos",
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
    "Pedido criado nasce 🔒 bloqueado. Clique em 🔓 Liberar (pede sua senha) quando a Tecelagem puder começar.",
  colunas: [],
};

export function Pcp() {
  return <Quadro cfg={PCP} />;
}
