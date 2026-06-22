import { useEffect, useState } from "react";
import { Quadro, type QuadroCfg, type ColCfg } from "../components/Quadro";
import { api } from "../api";

// Revisão é organizada por REVISADORA: cada coluna é uma revisadora interna
// (Cadastros › Operadores, setor Revisão). Operadores de "Todos os setores" não
// viram coluna (ficam só como quem opera/confirma a senha).
const BASE: Omit<QuadroCfg, "colunas"> = {
  setor: "revisao",
  titulo: "Revisão",
  fazerLabel: "Revisar",
  fazendoLabel: "Revisando",
  proxSetor: "expedicao",
  pedeMaquina: false,
  recursoLabel: "Revisadora",
  recursoTotal: 6,
  statRecursoLabel: "Revisadoras",
  statFila: "Aguardando",
  statFazendo: "Revisando",
  statPronto: "—",
  mostrarMaquinas: false,
  enviarLabel: "Enviar p/ expedição ▶",
  setorDefeito: "costura", // "Voltou com defeito" devolve à costureira que fez
  nota: "Cada coluna é uma revisadora. Revisar → coluna dela → Enviar p/ expedição. Com defeito, devolve para a costureira que fez.",
};

export function Revisao() {
  const [revisadoras, setRevisadoras] = useState<string[]>([]);

  useEffect(() => {
    // Só operadores do setor EXATO "revisao" (exclui os de "Todos os setores").
    api
      .listarOperadores("revisao")
      .then((l) => setRevisadoras(l.filter((o) => (o.setor || "") === "revisao").map((o) => o.nome)))
      .catch(() => {});
  }, []);

  const colunas: ColCfg[] = [
    { cor: "prioridade", titulo: "Passar na frente", sub: "Urgentes / clientes atrasados", status: "aguardando", acao: "fazer", somentePrioridade: true },
    { cor: "aguardando", titulo: "Aguardando para revisar", sub: "Chegou da costura", status: "aguardando", operador: "", acao: "fazer", botaoLabel: "Revisar ▶" },
    ...revisadoras.map<ColCfg>((nome) => ({
      cor: "fazendo",
      titulo: nome,
      sub: "Revisadora",
      status: "fazendo",
      operador: nome,
      acao: "enviar",
      acaoExtra: "devolverDefeito",
    })),
  ];

  return <Quadro cfg={{ ...BASE, nota: revisadoras.length ? BASE.nota : SEM, colunas }} />;
}

const SEM =
  "⚠️ Nenhuma revisadora cadastrada. Cadastre em Cadastros › Operadores com setor 'Revisão' — cada revisadora vira uma coluna aqui. (Operadores de 'Todos os setores' não viram coluna.)";
