import { useEffect, useState } from "react";
import { Quadro, type QuadroCfg, type ColCfg } from "../components/Quadro";
import { api } from "../api";

// Costura é organizada por COSTUREIRA: cada coluna é uma costureira (vêm do
// cadastro de Operadores, setor Costura). Quem "pega" a peça vira a dona da
// coluna. Sem "passar na frente"; a única coluna fixa é "Voltou com defeito".
const BASE: Omit<QuadroCfg, "colunas"> = {
  setor: "costura",
  titulo: "Costura",
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
  nota: "Cada coluna é uma costureira. Em 'A distribuir', toque em Pegar e escolha a costureira. No card: Enviar (revisão / estoque para kit) ou ⚠ Defeito.",
};

export function Costura() {
  const [costureiras, setCostureiras] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    api.listarOperadores("costura").then(setCostureiras).catch(() => {});
  }, []);

  const colunas: ColCfg[] = [
    { cor: "aguardando", titulo: "A distribuir", sub: "Chegou do corte", status: "aguardando", acao: "fazer", botaoLabel: "Pegar ▶" },
    ...costureiras.map<ColCfg>((c) => ({
      cor: "fazendo",
      titulo: c.nome,
      sub: "Costureira",
      status: "fazendo",
      operador: c.nome,
      acao: "enviar",
      acaoExtra: "defeito",
    })),
    { cor: "defeito", titulo: "⚠ Voltou com defeito", sub: "Refazer ou enviar direto", status: "defeito", acao: "voltar", acaoExtra: "enviar" },
  ];

  return <Quadro cfg={{ ...BASE, colunas }} />;
}
