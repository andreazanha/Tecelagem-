import { useEffect, useState } from "react";
import { Quadro, type QuadroCfg, type ColCfg } from "../components/Quadro";
import { api } from "../api";

// Costura é organizada por COSTUREIRA (terceirizada): cada coluna é uma
// costureira, vinda de Romaneios › Prestadores (serviço Costura). Quem movimenta
// os cards são operadores internos (com senha). Coluna fixa: "Voltou com defeito".
const BASE: Omit<QuadroCfg, "colunas"> = {
  setor: "costura",
  titulo: "Costura",
  painel: true,
  painelPessoas: true,
  painelIcone: "🪡",
  fazerLabel: "Pegar costura",
  fazendoLabel: "Costurando",
  proxSetor: "revisao",
  proxSetorKit: "estoque",
  pedeMaquina: false,
  recursoLabel: "Costureira",
  recursoTotal: 8,
  statRecursoLabel: "Costureiras",
  statFila: "A distribuir",
  statFazendo: "Em costura",
  statPronto: "—",
  mostrarMaquinas: false,
  semPrioridade: true,
  defeito: true,
  enviarLabel: "Enviar p/ revisão ▶",
  enviarLabelKit: "Enviar p/ estoque ▶",
  nota: "Cada coluna é uma costureira (Prestadores). O Corte já manda o card para a costureira escolhida; aqui o operador interno movimenta (Enviar / ⚠ Defeito) com sua senha.",
};

export function Costura() {
  const [costureiras, setCostureiras] = useState<string[]>([]);

  useEffect(() => {
    api
      .listarPrestadores()
      .then((l) => setCostureiras(l.filter((p) => (p.servico || "") === "costura").map((p) => p.nome)))
      .catch(() => {});
  }, []);

  const colunas: ColCfg[] = [
    ...costureiras.map<ColCfg>((nome) => ({
      cor: "fazendo",
      titulo: nome,
      sub: "Costureira",
      status: "fazendo",
      operador: nome,
      acao: "enviar",
      acaoExtra: "defeito",
    })),
    { cor: "defeito", titulo: "⚠ Voltou com defeito", sub: "Refazer ou enviar direto", status: "defeito", acao: "voltar", acaoExtra: "enviar" },
  ];

  return <Quadro cfg={{ ...BASE, nota: costureiras.length ? BASE.nota : SEM, colunas }} />;
}

const SEM =
  "⚠️ Nenhuma costureira cadastrada. Cadastre em Romaneios › Prestadores com serviço 'Costura' — cada costureira vira uma coluna aqui.";
