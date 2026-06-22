import { useEffect, useState } from "react";
import { Quadro, type QuadroCfg, type ColCfg } from "../components/Quadro";
import { api } from "../api";

// Revisão é organizada por REVISADORA: cada coluna é uma revisadora (Romaneios ›
// Prestadores, serviço Revisão). Operadores internos (com senha) movimentam.
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
    api
      .listarPrestadores()
      .then((l) => setRevisadoras(l.filter((p) => (p.servico || "") === "revisao").map((p) => p.nome)))
      .catch(() => {});
  }, []);

  const colunas: ColCfg[] = [
    { cor: "prioridade", titulo: "Passar na frente", sub: "Urgentes / clientes atrasados", status: "aguardando", acao: "fazer", somentePrioridade: true },
    { cor: "aguardando", titulo: "Aguardando para enviar", sub: "Chegou da costura", status: "aguardando", operador: "", acao: "fazer", botaoLabel: "Revisar ▶" },
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
  "⚠️ Nenhuma revisadora cadastrada. Cadastre em Romaneios › Prestadores com serviço 'Revisão' — cada revisadora vira uma coluna aqui.";
