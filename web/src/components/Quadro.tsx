import { useEffect, useMemo, useState } from "react";
import { api, type CardProducao, type ItemPedidoEstoque } from "../api";
import { historico } from "../historico";
import { getUser } from "../auth";

const SETOR_LABEL: Record<string, string> = {
  tecelagem: "Tecelagem", passadoria: "Passadoria", corte: "Corte",
  costura: "Costura", revisao: "Revisão", estoque: "Estoque", expedicao: "Expedição",
};
// Ordem dos setores da produção (usada no atalho de master "pular etapa").
const SETORES = ["tecelagem", "passadoria", "corte", "costura", "revisao", "estoque", "expedicao"];

const TIPO: Record<string, { label: string; cls: string }> = {
  "parte-1": { label: "PARTE 1", cls: "p1" },
  "parte-2": { label: "PARTE 2", cls: "p2" },
  "parte-unica": { label: "ÚNICA", cls: "unica" },
  "pronta-entrega": { label: "KIT", cls: "kit" },
};
// Parte "real" ignorando o sufixo "#op" de cards desmembrados (parte-unica#3768).
const basePart = (p: string) => (p || "").split("#")[0];
// Verbo do setor para o selo de prioridade de estoque ("TECER 1º", "CORTAR 1º"…).
const verboSetor = (setor?: string) =>
  setor === "tecelagem" ? "TECER" : setor === "corte" ? "CORTAR" : setor === "costura" ? "COSTURAR"
  : setor === "passadoria" ? "PASSAR" : setor === "revisao" ? "REVISAR" : "FAZER";
const opCodigo = (c: CardProducao) => {
  const kit = basePart(c.parte) === "pronta-entrega";
  // Card desmembrado mostra a OP de origem (número do pedido original).
  if (c.op) return (kit ? "KIT " : "OP ") + c.op;
  return (kit ? "KIT " : "OP ") + (c.codigo_pai || c.numero_erp || c.pedido_id.slice(0, 6));
};
// Card que ainda é uma OP consolidada inteira (pode ser desmembrado).
const ehConsolidada = (c: CardProducao) => !!c.codigo_pai && (c.numero_erp || "").includes(",") && !c.op;
const br = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : d;
};
const brLong = (d?: string | null) => {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
};
const SETOR_INFO: Record<string, { nome: string; ic: string; cor: string }> = {
  tecelagem: { nome: "Tecelagem", ic: "🧶", cor: "#6366f1" },
  passadoria: { nome: "Passadoria", ic: "🔥", cor: "#f97316" },
  corte: { nome: "Corte", ic: "✂️", cor: "#06b6d4" },
  costura: { nome: "Costura", ic: "🪡", cor: "#ec4899" },
  revisao: { nome: "Revisão", ic: "🔍", cor: "#eab308" },
  expedicao: { nome: "Expedição", ic: "📦", cor: "#22c55e" },
};
const dur = (min: number) => {
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d}d ${hh}h` : `${d}d`;
};
// Vendedor às vezes vem poluído do PDF ("PEDRO HENRIQUE 35992103017 EMITENTE Entrega:…").
// Mostra só o nome: corta no 1º número longo ou nas palavras de ruído.
const limparVendedor = (v?: string | null) => {
  if (!v) return "—";
  let s = v.split(/\s+\d{4,}/)[0];
  s = s.split(/\s*\b(EMITENTE|ENTREGA|TRANSPORTADOR|FONES?|OBS|ADICION|CNPJ|CPF|RG|INSCR)/i)[0];
  s = s.replace(/[-–·,;:]+\s*$/, "").trim();
  return s || "—";
};
const brDT = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s.replace(" ", "T") + (s.includes("Z") ? "" : "Z"));
  return isNaN(+d) ? "—" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

export type Acao = "fazer" | "finalizar" | "enviar" | "defeito" | "voltar" | "devolverDefeito";
export interface ColCfg {
  cor: "aguardando" | "fazendo" | "pronto" | "prioridade" | "defeito";
  titulo: string;
  sub: string;
  status: "aguardando" | "fazendo" | "pronto" | "defeito";
  tipos?: string[];
  acao: Acao;
  corCard?: "p1" | "p2" | "unica" | "kit"; // pinta o cabeçalho com a cor do card (tipo da peça)
  operador?: string; // filtra cards por costureira/operador (coluna por pessoa)
  botaoLabel?: string; // sobrescreve o texto do botão da coluna
  acaoExtra?: Acao; // botão secundário no card (ex.: "Defeito")
  somentePrioridade?: boolean; // coluna "passar na frente"
}
export interface QuadroCfg {
  setor: string;
  titulo: string;
  fazerLabel: string;
  fazendoLabel: string;
  proxSetor: string | null;
  pedeMaquina: boolean;
  recursoLabel: string;
  recursoTotal: number;
  statRecursoLabel: string;
  statFila: string;
  statFazendo: string;
  statPronto: string;
  mostrarMaquinas: boolean;
  nota: string;
  colunas: ColCfg[];
  acaoFazendo?: "finalizar" | "enviar"; // o que o card "fazendo" faz no modal (default finalizar)
  enviarLabel?: string; // texto do botão "enviar" (default "Enviar ▶")
  enviarLabelKit?: string; // texto do botão "enviar" quando o card é kit (pronta-entrega)
  defeito?: boolean; // mostra botão "Defeito" no modal
  semPrioridade?: boolean; // esconde o "passar na frente" (ex.: Costura)
  proxSetorKit?: string | null; // destino dos kits (pronta-entrega) ao enviar, se diferente
  setorDefeito?: string; // setor para onde "Voltou com defeito" devolve a peça (ex.: Revisão → Costura)
  enviarSemPessoa?: boolean; // enviar para a FILA do próximo setor (aguardando), sem escolher pessoa
  agruparPorPedido?: boolean; // junta as partes do mesmo pedido num card só (ex.: Revisão, pedido misto)
  entradaEstoque?: boolean; // mostra "📥 Dar entrada no estoque" em cards de reposição (setor Estoque)
  desmembrar?: boolean; // mostra "🔀 Desmembrar OP" em cards de OP consolidada (setor Corte)
  painel?: boolean; // habilita o modo "Painel" (Tecelagem: filas por galga + em produção)
}

// Galga (máquina) de um card: usa o valor calculado pelo backend (por produto);
// se faltar, cai no padrão parte-1 → 3, o resto → 7.
function galgaDe(c: CardProducao): 3 | 7 {
  if (c.galga === 3 || c.galga === 7) return c.galga;
  return basePart(c.parte) === "parte-1" ? 3 : 7;
}
// Ordena a fila: prioridade (★) primeiro, depois urgência de estoque (rank) e entrega.
function ordenarFila(a: CardProducao, b: CardProducao): number {
  if (!!b.prioridade !== !!a.prioridade) return b.prioridade ? 1 : -1;
  const ra = a.est_rank ?? 9999, rb = b.est_rank ?? 9999;
  if (ra !== rb) return ra - rb;
  const da = a.data_entrega || "9999", db = b.data_entrega || "9999";
  return da < db ? -1 : da > db ? 1 : 0;
}
// "há Xh" desde o início da tecelagem (para os cards em produção).
function desde(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (isNaN(+d)) return "";
  const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  return "há " + dur(min);
}

// Setores cujas colunas são PESSOAS. Costura = costureiras terceirizadas
// (Romaneios › Prestadores, serviço costura). Revisão = revisadoras internas
// (Cadastros › Operadores, setor EXATO "revisao" — não as de "Todos os setores").
type FontePessoas = { tipo: "prestadores"; servico: string } | { tipo: "operadores"; setor: string };
interface DestinoPessoa { setor: string; fonte: FontePessoas; label: string }
const FONTE_PESSOAS: Record<string, FontePessoas> = {
  costura: { tipo: "prestadores", servico: "costura" },
  revisao: { tipo: "operadores", setor: "revisao" },
};
function pessoasDeSetor(s: string): FontePessoas | null {
  return FONTE_PESSOAS[s] ?? null;
}
// Junta as partes do mesmo pedido (pedido_id) num grupo só, mantendo a ordem.
function agruparPorPedido(cards: CardProducao[]): CardProducao[][] {
  const m = new Map<string, CardProducao[]>();
  for (const c of cards) {
    // Cards desmembrados: agrupa por pedido + OP (cada OP é um card à parte).
    const chave = c.pedido_id + "|" + (c.op || "");
    const g = m.get(chave);
    if (g) g.push(c);
    else m.set(chave, [c]);
  }
  return [...m.values()];
}
function tituloSetor(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Quadro({ cfg }: { cfg: QuadroCfg }) {
  const [cards, setCards] = useState<CardProducao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<CardProducao | null>(null);
  const [acaoModal, setAcaoModal] = useState<{ cards: CardProducao[]; acao: Acao } | null>(null);
  const [entradaPed, setEntradaPed] = useState<CardProducao | null>(null);
  const [busca, setBusca] = useState("");
  // Modo de visualização (só onde cfg.painel): "painel" (novo) x "kanban" (antigo).
  const [modo, setModo] = useState<"painel" | "kanban">(() =>
    cfg.painel && localStorage.getItem("tec-modo") !== "kanban" ? "painel" : "kanban"
  );
  function trocarModo(m: "painel" | "kanban") {
    setModo(m);
    localStorage.setItem("tec-modo", m);
  }
  // Fila aberta pelo botão grande: por galga (Tecer) ou envio p/ passadoria.
  const [fila, setFila] = useState<{ galga?: 3 | 7; envio?: boolean } | null>(null);

  function recarregar() {
    api
      .listarProducao(cfg.setor)
      // Só atualiza com uma lista válida — nunca esvazia a tela por erro/resposta ruim.
      .then((d) => { if (Array.isArray(d)) setCards(d); })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }
  useEffect(() => {
    setCarregando(true);
    recarregar();
  }, [cfg.setor]);

  // Recarrega quando uma ação é desfeita/refeita em qualquer tela.
  useEffect(() => {
    const h = () => recarregar();
    window.addEventListener("historico:mudou", h);
    return () => window.removeEventListener("historico:mudou", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.setor]);

  // Aplica a MESMA mudança a 1+ cards (pedido misto agrupado = várias partes).
  async function mudarGrupo(cards: CardProducao[], body: { status: string; setor?: string; maquina?: string; operador?: string }) {
    const antes = cards.map((c) => ({ pedido_id: c.pedido_id, parte: c.parte, status: c.status, setor: c.setor, operador: c.operador ?? "" }));
    try {
      await Promise.all(cards.map((c) => api.atualizarProducao(c.pedido_id, c.parte, body)));
      historico.registrar({
        label: opCodigo(cards[0]) + (cards.length > 1 ? ` +${cards.length - 1}` : ""),
        desfazer: () => Promise.all(antes.map((a) => api.atualizarProducao(a.pedido_id, a.parte, { status: a.status, setor: a.setor, operador: a.operador }))).then(() => {}),
        refazer: () => Promise.all(cards.map((c) => api.atualizarProducao(c.pedido_id, c.parte, body))).then(() => {}),
      });
    } catch {
      alert("Não foi possível atualizar o card. Tente novamente.");
    } finally {
      setAberto(null);
      recarregar();
    }
  }
  const mudar = (c: CardProducao, body: { status: string; setor?: string; maquina?: string; operador?: string }) => mudarGrupo([c], body);

  // Desmembra uma OP consolidada em um card por pedido de origem.
  async function desmembrar(c: CardProducao) {
    if (!confirm(`Desmembrar a OP consolidada ${c.codigo_pai || ""} em um card separado por pedido (${c.numero_erp || ""})?`)) return;
    try {
      const r = await api.desmembrarProducao(c.pedido_id, c.parte);
      recarregar();
      if (r.criados) alert(`OP desmembrada em ${r.criados} cards.`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  // Toda ação passa pelo modal (senha do operador interno + destino quando aplicável).
  function acaoCard(cards: CardProducao[], acao: Acao) {
    setAcaoModal({ cards, acao });
  }

  // Executa de fato, já com o operador validado e (se houver) a pessoa de destino.
  function executarAcao(cards: CardProducao[], acao: Acao, opInterno: string, pessoaDestino?: string) {
    const rep = cards[0];
    if (acao === "fazer") {
      // Em setor por pessoa (Costura/Revisão) o "dono" é a costureira/revisadora; senão, o operador.
      const op = pessoasDeSetor(cfg.setor) ? pessoaDestino || "" : opInterno;
      mudarGrupo(cards, { status: "fazendo", operador: op });
    } else if (acao === "finalizar") mudarGrupo(cards, { status: "pronto" });
    else if (acao === "defeito") mudarGrupo(cards, { status: "defeito" });
    else if (acao === "voltar")
      mudarGrupo(cards, { status: rep.operador ? "fazendo" : "aguardando", operador: rep.operador || "" });
    else if (acao === "devolverDefeito") cards.forEach(devolverComDefeito);
    else {
      const destino = destinoDe(rep);
      if (!destino) return;
      if (pessoasDeSetor(destino) && !cfg.enviarSemPessoa) mudarGrupo(cards, { setor: destino, status: "fazendo", operador: pessoaDestino || "" });
      else mudarGrupo(cards, { setor: destino, status: "aguardando" }); // vai para a fila (sem dono)
    }
  }

  // Pessoa (costureira/revisadora) a escolher no modal, se a ação leva a um setor por pessoa.
  function destinoPessoa(card: CardProducao, acao: Acao): DestinoPessoa | null {
    if (acao === "enviar") {
      if (cfg.enviarSemPessoa) return null; // vai para a fila, sem escolher pessoa
      const d = destinoDe(card);
      const f = d ? pessoasDeSetor(d) : null;
      return d && f ? { setor: d, fonte: f, label: tituloSetor(d) } : null;
    }
    if (acao === "fazer") {
      const f = pessoasDeSetor(cfg.setor);
      return f ? { setor: cfg.setor, fonte: f, label: tituloSetor(cfg.setor) } : null;
    }
    return null;
  }

  // Próximo setor de um card (kits podem ter destino diferente, ex.: Costura → Estoque).
  function destinoDe(c: CardProducao) {
    return c.parte === "pronta-entrega" && cfg.proxSetorKit !== undefined ? cfg.proxSetorKit : cfg.proxSetor;
  }

  // "Voltou com defeito" (ex.: na Revisão): devolve a peça ao setor de defeito,
  // já endereçada à pessoa que a fez (último operador naquele setor).
  async function devolverComDefeito(c: CardProducao) {
    const destino = cfg.setorDefeito;
    if (!destino) return;
    let operador = "";
    try {
      const h = await api.historicoProducao(c.pedido_id, c.parte);
      const ult = [...h.passagens].reverse().find((p) => p.setor === destino && p.operador);
      operador = ult?.operador || "";
    } catch {
      /* sem histórico: cai na coluna de defeito sem dono */
    }
    mudar(c, { setor: destino, status: "defeito", operador });
  }

  // "Passar na frente": liga/desliga a prioridade da parte (com desfazer).
  async function alternarPrioridade(c: CardProducao) {
    const novo = c.prioridade ? 0 : 1;
    await api.definirPrioridade(c.pedido_id, c.parte, novo);
    historico.registrar({
      label: opCodigo(c) + (novo ? " ▶ passar na frente" : " · tirar prioridade"),
      desfazer: () => api.definirPrioridade(c.pedido_id, c.parte, novo ? 0 : 1),
      refazer: () => api.definirPrioridade(c.pedido_id, c.parte, novo),
    });
    setAberto((a) => (a && a.pedido_id === c.pedido_id && a.parte === c.parte ? { ...a, prioridade: novo } : a));
    recarregar();
  }

  const stLabel = (s: string) =>
    s === "fazendo" ? cfg.fazendoLabel : s === "pronto" ? "Pronto" : s === "defeito" ? "Com defeito" : "Aguardando";
  const ativos = useMemo(() => cards.filter((c) => c.status === "fazendo"), [cards]);
  const maquinas = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of ativos) if (c.maquina) m.set(c.maquina, opCodigo(c));
    return Array.from({ length: 8 }, (_, i) => ({ nome: `Máq ${i + 1}`, op: m.get(`Máq ${i + 1}`) || null }));
  }, [ativos]);
  const hoje = new Date().toISOString().slice(0, 10);
  const noPrazo = cards.filter((c) => !c.data_entrega || c.data_entrega >= hoje).length;
  const pct = cards.length ? Math.round((noPrazo / cards.length) * 100) : 100;
  const aguard = cards.filter((c) => c.status === "aguardando").length;
  const prontos = cards.filter((c) => c.status === "pronto").length;
  const recursoAtivo = cfg.mostrarMaquinas
    ? maquinas.filter((m) => m.op).length
    : new Set(ativos.map((c) => c.operador).filter(Boolean)).size;

  const temColPrioridade = cfg.colunas.some((c) => c.somentePrioridade);
  const q = busca.trim().toLowerCase();
  const filtrados = q
    ? cards.filter(
        (c) =>
          (c.numero_erp || "").toLowerCase().includes(q) ||
          (c.codigo_pai || "").toLowerCase().includes(q) ||
          (c.cliente_nome || "").toLowerCase().includes(q) ||
          (c.codigo_terceiro || "").toLowerCase().includes(q)
      )
    : cards;

  return (
    <div className="quadro-page">
      <div className="page-head">
        <div>
          <h1>{cfg.titulo}</h1>
          <div className="breadcrumb">Produção › {cfg.titulo}</div>
        </div>
        <div className="row-gap">
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              className="busca-ped"
              type="search"
              name="busca-producao"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              placeholder="🔎 Pedido, código pai, terceiro ou cliente…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {busca && (
              <button
                type="button"
                title="Limpar busca"
                onClick={() => setBusca("")}
                style={{ position: "absolute", right: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 16, color: "#94a3b8" }}
              >
                ✕
              </button>
            )}
          </div>
          {cfg.painel && (
            <div className="modo-seg" role="tablist" aria-label="Modo de visualização">
              <button className={"modo-seg-b" + (modo === "painel" ? " on" : "")} onClick={() => trocarModo("painel")}>▦ Painel</button>
              <button className={"modo-seg-b" + (modo === "kanban" ? " on" : "")} onClick={() => trocarModo("kanban")}>☰ Kanban</button>
            </div>
          )}
          <button className="btn" onClick={recarregar}>↻ Atualizar</button>
        </div>
      </div>

      <div className="stats">
        <Stat n={aguard} l={cfg.statFila} />
        <Stat n={ativos.length} l={cfg.statFazendo} />
        <Stat n={prontos} l={cfg.statPronto} />
        <Stat n={`${pct}%`} l="No prazo" />
        <Stat n={`${recursoAtivo} / ${cfg.recursoTotal}`} l={cfg.statRecursoLabel} />
      </div>

      {cfg.mostrarMaquinas && (
        <div className="maqstrip">
          {maquinas.map((m) => (
            <span key={m.nome} className={"maqchip" + (m.op ? "" : " livre")}>
              {m.nome} · {m.op || "livre"}
            </span>
          ))}
        </div>
      )}

      {carregando ? (
        <div className="card pad">Carregando…</div>
      ) : cfg.painel && modo === "painel" ? (
        <PainelTec cards={filtrados} onAbrir={setAberto} onAbrirFila={setFila} />
      ) : (
        <>
          <div className="kanban">
            {cfg.colunas.map((col, i) => {
              const lista = filtrados.filter((c) => {
                if (c.status !== col.status) return false;
                if (col.operador !== undefined && (c.operador || "") !== col.operador) return false;
                if (col.tipos && !col.tipos.includes(c.parte)) return false;
                if (col.somentePrioridade) return !!c.prioridade;
                // Numa coluna normal de "aguardando", os prioritários saem para a
                // coluna "passar na frente" (sem duplicar).
                if (temColPrioridade && col.status === "aguardando" && c.prioridade) return false;
                return true;
              });
              return (
                <Coluna
                  key={i}
                  col={col}
                  cards={lista}
                  cfg={cfg}
                  stLabel={stLabel}
                  onAbrir={setAberto}
                  onAcao={acaoCard}
                  onPrioridade={alternarPrioridade}
                  onEntradaEstoque={cfg.entradaEstoque ? setEntradaPed : undefined}
                  onDesmembrar={cfg.desmembrar ? desmembrar : undefined}
                />
              );
            })}
          </div>
        </>
      )}

      {aberto && (
        <CardModal card={aberto} cfg={cfg} stLabel={stLabel} onFechar={() => setAberto(null)} onAcao={acaoCard} onPrioridade={alternarPrioridade} onPular={(c, setor) => mudarGrupo([c], { status: "aguardando", setor })} onRecarregar={recarregar} />
      )}

      {entradaPed && (
        <EntradaEstoqueModal card={entradaPed} onFechar={() => setEntradaPed(null)} onFeito={() => { setEntradaPed(null); recarregar(); }} />
      )}

      {fila && (
        <FilaModal
          cfg={cfg}
          galga={fila.galga}
          envio={fila.envio}
          cards={cards}
          onFechar={() => setFila(null)}
          onAbrir={(c) => { setFila(null); setAberto(c); }}
          onAcao={(c, acao) => { setFila(null); acaoCard([c], acao); }}
          onPrioridade={alternarPrioridade}
        />
      )}

      {acaoModal && (
        <AcaoModal
          card={acaoModal.cards[0]}
          qtdGrupo={acaoModal.cards.length}
          acao={acaoModal.acao}
          cfg={cfg}
          destino={destinoPessoa(acaoModal.cards[0], acaoModal.acao)}
          onFechar={() => setAcaoModal(null)}
          onConfirmar={(opInterno, pessoaDestino) => {
            const { cards, acao } = acaoModal;
            setAcaoModal(null);
            setAberto(null);
            executarAcao(cards, acao, opInterno, pessoaDestino);
          }}
        />
      )}
    </div>
  );
}

// Etiqueta de origem do card (OP consolidada / kit de reposição) para o Painel.
function TagCard({ c }: { c: CardProducao }) {
  if (basePart(c.parte) === "pronta-entrega") return <span className="tp-tag kit">kit</span>;
  if (ehConsolidada(c)) return <span className="tp-tag cons">consolidada</span>;
  return null;
}

// ── PAINEL da Tecelagem ───────────────────────────────────────────────────────
// Topo: 3 botões grandes (fila galga 3, fila galga 7, enviar p/ passadoria).
// Abaixo: 2 colunas com os pedidos JÁ INICIADOS (tecendo agora) em cada galga.
function PainelTec({
  cards,
  onAbrir,
  onAbrirFila,
}: {
  cards: CardProducao[];
  onAbrir: (c: CardProducao) => void;
  onAbrirFila: (f: { galga?: 3 | 7; envio?: boolean }) => void;
}) {
  const aguardando = cards.filter((c) => c.status === "aguardando");
  const fazendo = cards.filter((c) => c.status === "fazendo");
  const prontos = cards.filter((c) => c.status === "pronto");
  const filaG3 = aguardando.filter((c) => galgaDe(c) === 3);
  const filaG7 = aguardando.filter((c) => galgaDe(c) === 7);
  const crit = (arr: CardProducao[]) => arr.filter((c) => c.est_urgencia === "critico").length;
  const colG3 = fazendo.filter((c) => galgaDe(c) === 3).sort(ordenarFila);
  const colG7 = fazendo.filter((c) => galgaDe(c) === 7).sort(ordenarFila);
  const subFila = (arr: CardProducao[]) => {
    const n = crit(arr);
    return (n ? `${n} crítico${n > 1 ? "s" : ""} · ` : "") + "na fila p/ tecer";
  };
  return (
    <div className="painel">
      <div className="tp-tiles">
        <button className="tp-tile g3" onClick={() => onAbrirFila({ galga: 3 })}>
          <span className="tp-ic">🧵</span>
          <span className="tp-body">
            <span className="tp-n">{filaG3.length}</span>
            <span className="tp-l">Pedidos galga 3</span>
            <span className="tp-sub">{subFila(filaG3)}</span>
          </span>
          <span className="tp-go">ver fila ›</span>
        </button>
        <button className="tp-tile g7" onClick={() => onAbrirFila({ galga: 7 })}>
          <span className="tp-ic">🧶</span>
          <span className="tp-body">
            <span className="tp-n">{filaG7.length}</span>
            <span className="tp-l">Pedidos galga 7</span>
            <span className="tp-sub">{subFila(filaG7)}</span>
          </span>
          <span className="tp-go">ver fila ›</span>
        </button>
        <button className="tp-tile go" onClick={() => onAbrirFila({ envio: true })}>
          <span className="tp-ic">➡️</span>
          <span className="tp-body">
            <span className="tp-n">{prontos.length}</span>
            <span className="tp-l">Enviar p/ passadoria</span>
            <span className="tp-sub">tecidos, prontos p/ seguir</span>
          </span>
          <span className="tp-go">enviar ›</span>
        </button>
      </div>
      <div className="tp-sec">Tecendo agora</div>
      <div className="tp-cols">
        <PainelCol titulo="Galga 3" cls="g3" cards={colG3} onAbrir={onAbrir} />
        <PainelCol titulo="Galga 7" cls="g7" cards={colG7} onAbrir={onAbrir} />
      </div>
    </div>
  );
}

function PainelCol({
  titulo,
  cls,
  cards,
  onAbrir,
}: {
  titulo: string;
  cls: string;
  cards: CardProducao[];
  onAbrir: (c: CardProducao) => void;
}) {
  return (
    <div className="tp-col">
      <div className={"tp-colh " + cls}>
        <span className="tp-colic">🧵</span>
        <span className="tp-colt">{titulo}</span>
        <span className="tp-colc">{cards.length} tecendo</span>
      </div>
      <div className="tp-colbody">
        {!cards.length ? (
          <div className="tp-vaz">nenhum pedido em produção nesta máquina</div>
        ) : (
          cards.map((c) => (
            <div key={c.pedido_id + c.parte} className="tp-card" onClick={() => onAbrir(c)} title="clique p/ ver o pedido">
              <div className="tp-ctop">
                <b>{opCodigo(c)}</b>
                <TagCard c={c} />
                {!!c.prioridade && <span className="tp-live prio">★ na frente</span>}
                <span className="tp-live">● tecendo</span>
              </div>
              <div className="tp-ccli">{c.cliente_nome}</div>
              <div className="tp-cmeta">
                {c.pecas} pç · 👤 {c.operador || "—"}{desde(c.iniciado_em) ? " · " + desde(c.iniciado_em) : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Fila aberta pelos botões grandes: por galga (Tecer) ou envio p/ passadoria.
function FilaModal({
  cfg,
  galga,
  envio,
  cards,
  onFechar,
  onAbrir,
  onAcao,
  onPrioridade,
}: {
  cfg: QuadroCfg;
  galga?: 3 | 7;
  envio?: boolean;
  cards: CardProducao[];
  onFechar: () => void;
  onAbrir: (c: CardProducao) => void;
  onAcao: (c: CardProducao, acao: Acao) => void;
  onPrioridade: (c: CardProducao) => void;
}) {
  const lista = (
    envio
      ? cards.filter((c) => c.status === "pronto")
      : cards.filter((c) => c.status === "aguardando" && galgaDe(c) === galga)
  ).sort(ordenarFila);
  const titulo = envio ? "Enviar para Passadoria" : `Fila da Galga ${galga}`;
  const sub = envio
    ? `${lista.length} pedido(s) tecido(s) · prontos p/ seguir`
    : `${lista.length} pedido(s) esperando · ordenados por prioridade`;
  const cls = envio ? "go" : galga === 3 ? "g3" : "g7";
  const btnLabel = envio ? "Enviar ▸" : "Tecer ▸";
  const acao: Acao = envio ? "enviar" : "fazer";
  const temUrg = !envio && lista.some((c) => c.est_urgencia === "critico" || c.est_urgencia === "baixo");
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card fila-modal" onClick={(e) => e.stopPropagation()}>
        <div className={"fila-hd " + cls}>
          <div className="fila-hd-l">
            <span className="fila-ic">{envio ? "➡️" : "🧵"}</span>
            <div>
              <div className="fila-t">{titulo}</div>
              <div className="fila-s">{sub}</div>
            </div>
          </div>
          <button className="modal-x" onClick={onFechar}>✕</button>
        </div>
        <div className="fila-bd">
          {temUrg && (
            <div className="fila-hint">💡 Ordem sugerida: primeiro os de estoque abaixo do mínimo e entregas mais próximas.</div>
          )}
          {!lista.length ? (
            <div className="fila-vaz">Nada na fila.</div>
          ) : (
            lista.map((c, i) => {
              const urg = c.est_urgencia === "critico" ? "crit" : c.est_urgencia === "baixo" ? "baixo" : "";
              return (
                <div key={c.pedido_id + c.parte} className={"fila-row" + (urg ? " " + urg : "")}>
                  <div className="fila-k">{i + 1}</div>
                  <div className="fila-main" onClick={() => onAbrir(c)}>
                    <div className="fila-top">
                      <b>{opCodigo(c)}</b>
                      <TagCard c={c} />
                      {urg === "crit" && <span className="fila-selo crit">CRÍTICO</span>}
                      {urg === "baixo" && <span className="fila-selo baixo">BAIXO</span>}
                    </div>
                    <div className="fila-cli">{c.cliente_nome}</div>
                    <div className="fila-meta">
                      {c.pecas} pç · entrega {br(c.data_entrega)}
                      {c.est_min ? ` · estoque ${c.est_estoque ?? 0}/${c.est_min}` : ""}
                    </div>
                  </div>
                  {!envio && !cfg.semPrioridade && (
                    <button
                      className={"fila-star" + (c.prioridade ? " on" : "")}
                      title={c.prioridade ? "Tirar da frente" : "Passar na frente"}
                      onClick={() => onPrioridade(c)}
                    >
                      {c.prioridade ? "★" : "☆"}
                    </button>
                  )}
                  <button className={"fila-btn " + cls} onClick={() => onAcao(c, acao)}>{btnLabel}</button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// Modal único de ação. Sempre pede o OPERADOR INTERNO + senha (de quem está
// manipulando o card). Quando a ação leva a um setor por pessoa (Costura →
// costureira, Revisão → revisadora), também escolhe essa pessoa.
function AcaoModal({
  card,
  qtdGrupo,
  acao,
  cfg,
  destino,
  onFechar,
  onConfirmar,
}: {
  card: CardProducao;
  qtdGrupo: number;
  acao: Acao;
  cfg: QuadroCfg;
  destino: DestinoPessoa | null;
  onFechar: () => void;
  onConfirmar: (opInterno: string, pessoaDestino?: string) => void;
}) {
  const [ops, setOps] = useState<{ id: string; nome: string }[]>([]);
  const [opId, setOpId] = useState("");
  const [senha, setSenha] = useState("");
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [pessoa, setPessoa] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const tarefas: Promise<unknown>[] = [
      api.listarOperadores(cfg.setor).then((o) => {
        setOps(o);
        if (o[0]) setOpId(o[0].id);
      }),
    ];
    if (destino) {
      const f = destino.fonte;
      const p =
        f.tipo === "prestadores"
          ? api.listarPrestadores().then((l) => l.filter((x) => (x.servico || "") === f.servico).map((x) => x.nome))
          // operadores do setor EXATO (exclui "Todos os setores")
          : api.listarOperadores(f.setor).then((l) => l.filter((x) => (x.setor || "") === f.setor).map((x) => x.nome));
      tarefas.push(
        p.then((list) => {
          setPessoas(list);
          if (list[0]) setPessoa(list[0]);
        })
      );
    }
    Promise.all(tarefas).catch(() => {}).finally(() => setCarregando(false));
  }, [cfg.setor, destino?.setor]);

  async function confirmar() {
    setErro("");
    if (destino && !pessoa) return setErro(`Escolha quem recebe em ${destino.label}.`);
    if (!opId) return setErro("Selecione o operador.");
    if (!senha) return setErro("Digite a senha.");
    setEnviando(true);
    try {
      const r = await api.validarOperador(opId, senha);
      if (!r.ok || !r.nome) {
        setErro("Senha incorreta.");
        setEnviando(false);
        return;
      }
      onConfirmar(r.nome, destino ? pessoa : undefined);
    } catch {
      setErro("Erro ao validar. Tente de novo.");
      setEnviando(false);
    }
  }

  const semOperadores = !carregando && ops.length === 0;
  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">{opCodigo(card)}</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-row">
            <span className="modal-cli">{rotulo(acao, card, cfg)}{qtdGrupo > 1 ? ` · ${qtdGrupo} partes` : ""}</span>
          </div>
        </div>

        <div className="modal-bd">
          {carregando ? (
            <div className="muted">Carregando…</div>
          ) : semOperadores ? (
            <div className="muted" style={{ fontSize: 14 }}>
              Nenhum operador no setor <strong>{tituloSetor(cfg.setor)}</strong>. Cadastre em <strong>Cadastros › Operadores</strong>.
            </div>
          ) : (
            <>
              {destino && (
                <>
                  <label className="campo-l" htmlFor="ac-pessoa">QUEM VAI RECEBER · {destino.label}</label>
                  {pessoas.length === 0 ? (
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      {destino.fonte.tipo === "prestadores"
                        ? <>Ninguém em Romaneios › Prestadores (serviço <strong>{destino.label}</strong>).</>
                        : <>Ninguém em Cadastros › Operadores no setor <strong>{destino.label}</strong>.</>}
                    </div>
                  ) : (
                    <select
                      id="ac-pessoa"
                      value={pessoa}
                      onChange={(e) => setPessoa(e.target.value)}
                      style={{ width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 4, marginBottom: 14 }}
                    >
                      {pessoas.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  )}
                </>
              )}

              <label className="campo-l" htmlFor="ac-op">OPERADOR (você)</label>
              <select
                id="ac-op"
                value={opId}
                onChange={(e) => setOpId(e.target.value)}
                style={{ width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 4 }}
              >
                {ops.map((o) => (
                  <option key={o.id} value={o.id}>{o.nome}</option>
                ))}
              </select>

              <label className="campo-l" htmlFor="ac-senha" style={{ marginTop: 14, display: "block" }}>SENHA</label>
              <input
                id="ac-senha"
                name="ac-senha-operador"
                type="password"
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                value={senha}
                autoFocus
                onChange={(e) => setSenha(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmar()}
                placeholder="••••"
                style={{ width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 10, border: "1px solid #e2e8f0", marginTop: 4 }}
              />
              {erro && <div style={{ color: "#b91c1c", fontWeight: 700, fontSize: 13, marginTop: 10 }}>{erro}</div>}
            </>
          )}
        </div>

        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Cancelar</button>
          <button className="kbtn tecer" disabled={enviando || carregando || semOperadores} onClick={confirmar}>
            {enviando ? "Validando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="stat">
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}

function btnDe(acao: Acao, cfg: QuadroCfg) {
  if (acao === "fazer") return { cls: "tecer", label: cfg.fazerLabel };
  if (acao === "finalizar") return { cls: "final", label: "Finalizar" };
  if (acao === "defeito") return { cls: "defeito", label: "⚠ Defeito" };
  if (acao === "devolverDefeito") return { cls: "defeito", label: "⚠ Voltou com defeito" };
  if (acao === "voltar") return { cls: "tecer", label: "↩ Refazer" };
  return { cls: "enviar", label: cfg.enviarLabel || "Enviar ▶" };
}
// Texto de um botão para um card — "enviar" muda conforme kit/normal.
function rotulo(acao: Acao, c: CardProducao, cfg: QuadroCfg): string {
  if (acao === "enviar" && c.parte === "pronta-entrega" && cfg.enviarLabelKit) return cfg.enviarLabelKit;
  return btnDe(acao, cfg).label;
}

function Coluna({
  col,
  cards,
  cfg,
  stLabel,
  onAbrir,
  onAcao,
  onPrioridade,
  onEntradaEstoque,
  onDesmembrar,
}: {
  col: ColCfg;
  cards: CardProducao[];
  cfg: QuadroCfg;
  stLabel: (s: string) => string;
  onAbrir: (c: CardProducao) => void;
  onAcao: (cards: CardProducao[], acao: ColCfg["acao"]) => void;
  onPrioridade: (c: CardProducao) => void;
  onEntradaEstoque?: (c: CardProducao) => void;
  onDesmembrar?: (c: CardProducao) => void;
}) {
  const btn = btnDe(col.acao, cfg);
  // Pedido misto: agrupa as partes do mesmo pedido num card só (ex.: na Revisão).
  const grupos = cfg.agruparPorPedido ? agruparPorPedido(cards) : cards.map((c) => [c]);
  return (
    <div className={"kcol" + (col.somentePrioridade ? " prio" : "") + (col.cor === "defeito" ? " defeito" : "")}>
      <div className={"kcol-head " + (col.corCard ? "card-" + col.corCard : col.cor)}>
        <div>
          <div className="kcol-title">
            <span className={"kdot " + col.cor} /> {col.somentePrioridade ? "🔥 " : ""}{col.titulo}
          </div>
          <div className="kcol-sub">{col.sub}</div>
        </div>
        <span className={"kcol-count " + col.cor}>{grupos.length}</span>
      </div>
      <div className="kcol-body">
        {grupos.map((g) => {
          const c = g[0];
          const combinado = g.length > 1;
          const t = TIPO[basePart(c.parte)] || { label: basePart(c.parte), cls: "" };
          const hdCls = combinado ? "misto" : t.cls;
          const pecas = g.reduce((s, x) => s + (x.pecas || 0), 0);
          return (
            <div key={c.pedido_id + (combinado ? "-misto" : c.parte)} className={"kcard" + (c.prioridade ? " prio" : "")} onClick={() => onAbrir(c)} style={{ cursor: "pointer" }}>
              <div className={"kcard-hd " + hdCls}>
                <span className="kcard-op">{opCodigo(c)}</span>
                {!cfg.semPrioridade && (
                  <button
                    className={"kcard-prio" + (c.prioridade ? " on" : "")}
                    title={c.prioridade ? "Tirar da frente" : "Passar na frente"}
                    onClick={(e) => { e.stopPropagation(); onPrioridade(c); }}
                  >
                    {c.prioridade ? "★" : "☆"}
                  </button>
                )}
                <span className="kcard-badge">{combinado ? "MISTO" : t.label}</span>
              </div>
              <div className="kcard-bd">
                <div className="kcard-row1">
                  <span className="kcard-cli">{c.cliente_nome}</span>
                  <span className={"kstatus " + c.status}>{stLabel(c.status)}</span>
                </div>
                {c.op && (
                  <div className="kcard-consol" title={`Card gerado do desmembramento da OP consolidada ${c.codigo_pai || ""}`}>
                    ⚠ Desmembrada de OP consolidada{c.codigo_pai ? ` ${c.codigo_pai}` : ""}
                  </div>
                )}
                {combinado && (
                  <div className="kcard-partes">
                    {g.map((x) => {
                      const tt = TIPO[basePart(x.parte)] || { label: basePart(x.parte), cls: "" };
                      return <span key={x.parte} className={"kparte " + tt.cls}>{tt.label}</span>;
                    })}
                  </div>
                )}
                <div className="kcard-prod">
                  {pecas} pç{combinado ? ` · ${g.length} partes` : c.resumo ? ` · ${c.resumo}` : ""}
                </div>
                {!!c.reposicao && c.est_rank ? (
                  <div className={"kcard-estoque urg-" + (c.est_urgencia || "ok")}>
                    <span className="ke-rank">{c.est_rank === 1 ? `${verboSetor(cfg.setor)} 1º` : `${c.est_rank}º`}</span>
                    <span className="ke-info">
                      Estoque {c.est_estoque}/{c.est_min}
                      {c.est_min ? ` · ${Math.round(((c.est_estoque || 0) / c.est_min) * 100)}%` : ""}
                    </span>
                  </div>
                ) : null}
                {c.observacao && <div className="kcard-obs">📝 {c.observacao}</div>}
                <div className="kcard-boxes">
                  <div className="kbox ped">
                    <div className="kbox-l">PEDIDO</div>
                    <div className="kbox-v">{br(c.data_pedido)}</div>
                  </div>
                  <div className="kbox ent">
                    <div className="kbox-l">{cfg.setor === "tecelagem" ? "PRAZO TEAR" : "ENTREGA"}</div>
                    <div className="kbox-v">{br(cfg.setor === "tecelagem" ? c.data_tecelagem || c.data_entrega : c.data_entrega)}</div>
                  </div>
                </div>
                <div className="kcard-foot">
                  <span className="kcard-hint">
                    {c.status === "fazendo"
                      ? `${c.maquina ? c.maquina + " · " : ""}${c.operador || "—"}`
                      : "toque p/ detalhes"}
                  </span>
                  <div className="kcard-acoes">
                    {onDesmembrar && ehConsolidada(c) && (
                      <button
                        className="kbtn tecer"
                        title="Separar esta OP consolidada em um card por pedido (segue a produção independente)"
                        onClick={(e) => { e.stopPropagation(); onDesmembrar(c); }}
                      >
                        🔀 Desmembrar OP
                      </button>
                    )}
                    {onEntradaEstoque && c.reposicao && (
                      <button
                        className="kbtn final"
                        title="Dar entrada destas peças no estoque de produtos (quantidade editável)"
                        onClick={(e) => { e.stopPropagation(); onEntradaEstoque(c); }}
                      >
                        📥 Entrada no estoque
                      </button>
                    )}
                    {col.acaoExtra && (
                      <button
                        className={"kbtn " + btnDe(col.acaoExtra, cfg).cls}
                        onClick={(e) => { e.stopPropagation(); onAcao(g, col.acaoExtra!); }}
                      >
                        {rotulo(col.acaoExtra, c, cfg)}
                      </button>
                    )}
                    <button
                      className={"kbtn " + btn.cls}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAcao(g, col.acao);
                      }}
                    >
                      {col.botaoLabel || rotulo(col.acao, c, cfg)}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {grupos.length === 0 && (
          <div style={{ flex: 1, minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span
              style={{
                border: "1.5px dashed #e2e8f0",
                borderRadius: 999,
                padding: "6px 16px",
                color: "#cbd5e1",
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: ".5px",
              }}
            >
              vazio
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <div className="campo-l">{l}</div>
      <div className="campo-v">{v}</div>
    </div>
  );
}

function CardModal({
  card,
  cfg,
  stLabel,
  onFechar,
  onAcao,
  onPrioridade,
  onPular,
  onRecarregar,
}: {
  card: CardProducao;
  cfg: QuadroCfg;
  stLabel: (s: string) => string;
  onFechar: () => void;
  onAcao: (cards: CardProducao[], acao: ColCfg["acao"]) => void;
  onPrioridade: (c: CardProducao) => void;
  onPular?: (c: CardProducao, setor: string) => void;
  onRecarregar?: () => void;
}) {
  const ehMaster = !!getUser()?.admin;
  const [pularSetor, setPularSetor] = useState(cfg.proxSetor || "revisao");
  const [det, setDet] = useState<Awaited<ReturnType<typeof api.detalheProducao>> | null>(null);
  const [hist, setHist] = useState<Awaited<ReturnType<typeof api.historicoProducao>> | null>(null);
  const [verHist, setVerHist] = useState(false);
  // Edição do cliente do card (cards desmembrados de OP consolidada — 1 cliente por OP).
  const [editCli, setEditCli] = useState<string | null>(null);
  const [salvandoCli, setSalvandoCli] = useState(false);
  async function salvarCliente() {
    if (editCli === null) return;
    setSalvandoCli(true);
    try {
      await api.definirClienteCard(card.pedido_id, card.parte, editCli.trim());
      card.cliente_nome = editCli.trim() || card.cliente_nome;
      setEditCli(null);
      onRecarregar?.();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSalvandoCli(false);
    }
  }
  useEffect(() => {
    api.detalheProducao(card.pedido_id, card.parte).then(setDet).catch(() => {});
    api.historicoProducao(card.pedido_id, card.parte).then(setHist).catch(() => {});
  }, [card.pedido_id, card.parte]);

  const t = TIPO[basePart(card.parte)] || { label: card.parte, cls: "" };
  // Na Tecelagem o "tipo" vira a galga (máquina) definida pelo produto.
  const tipoLabel = cfg.setor === "tecelagem" ? "GALGA " + galgaDe(card) : t.label;
  const origem =
    card.status === "fazendo" ? `${cfg.titulo} · ${card.maquina || card.operador || "—"}` : cfg.titulo;

  let faltam = "";
  if (card.data_entrega) {
    const h = new Date();
    h.setHours(0, 0, 0, 0);
    const e = new Date(card.data_entrega + "T00:00:00");
    const d = Math.round((e.getTime() - h.getTime()) / 86400000);
    faltam = d < 0 ? `${-d} dia(s) atrasado` : d === 0 ? "entrega hoje" : `faltam ${d} dia(s)`;
  }
  const acaoAtual: Acao =
    card.status === "aguardando"
      ? "fazer"
      : card.status === "fazendo"
        ? cfg.acaoFazendo || "finalizar"
        : card.status === "defeito"
          ? "voltar"
          : "enviar";
  const btn = btnDe(acaoAtual, cfg);
  const btnLabel = rotulo(acaoAtual, card, cfg);
  const emTrabalho = card.status === "fazendo" || card.status === "pronto";
  // "Defeito" no próprio setor (Costura) ou "Voltou com defeito" devolvendo a
  // peça ao setor de origem (Revisão → Costura).
  const mostrarDefeito = cfg.defeito && emTrabalho;
  const mostrarDevolver = !!cfg.setorDefeito && emTrabalho;

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className={"modal-hd " + t.cls}>
          <div className="modal-hd-top">
            <span className="modal-pills">
              <span className="modal-pill">{opCodigo(card)}</span>
              <span className="modal-pill">{tipoLabel}</span>
            </span>
            <button className="modal-x" onClick={onFechar}>
              ✕
            </button>
          </div>
          <div className="modal-hd-row">
            {editCli !== null ? (
              <span style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
                <input
                  className="busca-ped"
                  style={{ minWidth: 0, flex: 1, padding: "6px 10px", color: "#0f172a" }}
                  value={editCli}
                  autoFocus
                  placeholder="Nome do cliente desta OP"
                  onChange={(e) => setEditCli(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") salvarCliente(); if (e.key === "Escape") setEditCli(null); }}
                />
                <button className="btn btn-soft" style={{ padding: "6px 10px", fontSize: 12 }} disabled={salvandoCli} onClick={salvarCliente}>{salvandoCli ? "…" : "Salvar"}</button>
                <button className="btn btn-soft" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => setEditCli(null)}>✕</button>
              </span>
            ) : (
              <span className="modal-cli">
                {card.cliente_nome}
                {card.op && (
                  <button
                    className="modal-cli-edit"
                    title="Corrigir o cliente desta OP (cards desmembrados são de clientes diferentes)"
                    onClick={() => setEditCli(card.cliente_nome === `OP CONSOLIDADA` || /CONSOLIDADA/i.test(card.cliente_nome) ? "" : card.cliente_nome)}
                    style={{ marginLeft: 8, background: "transparent", border: "none", cursor: "pointer", fontSize: 14, opacity: 0.85 }}
                  >
                    ✏️
                  </button>
                )}
              </span>
            )}
            <span className={"kstatus " + card.status}>
              {cfg.titulo} · {stLabel(card.status)}
            </span>
          </div>
        </div>

        <div className="modal-bd">
          <div className="modal-boxes">
            <div className="kbox ped" style={{ padding: "12px 14px" }}>
              <div className="kbox-l">DATA DO PEDIDO</div>
              <div className="kbox-v" style={{ fontSize: 20 }}>{brLong(card.data_pedido)}</div>
            </div>
            <div className="kbox ent" style={{ padding: "12px 14px" }}>
              <div className="kbox-l">DATA DE ENTREGA</div>
              <div className="kbox-v" style={{ fontSize: 20 }}>{brLong(card.data_entrega)}</div>
              {faltam && (
                <div style={{ fontSize: 11, color: "#b91c1c", fontWeight: 700, marginTop: 2 }}>⚠ {faltam}</div>
              )}
            </div>
          </div>

          <div className="modal-grid">
            <Campo l="TIPO" v={tipoLabel} />
            <Campo l="QUANTIDADE" v={`${card.pecas} peças`} />
            <Campo l="RESPONSÁVEL" v={card.operador || "—"} />
            <Campo l="VENDEDOR" v={limparVendedor(det?.vendedor)} />
            {card.codigo_pai && <Campo l="PEDIDOS" v={card.numero_erp || "—"} />}
            <Campo l="CÓDIGO DE TERCEIRO" v={det?.codigo_terceiro || "—"} />
            <Campo l="ORIGEM" v={origem} />
          </div>

          {det?.observacao && (
            <div style={{ marginTop: 14 }}>
              <div className="campo-l">OBSERVAÇÃO</div>
              <div
                style={{
                  marginTop: 4, padding: "10px 12px", background: "#fef2f2",
                  border: "1px solid #fecaca", borderRadius: 10, color: "#b91c1c",
                  fontWeight: 600, fontSize: 14, whiteSpace: "pre-wrap",
                }}
              >
                {det.observacao}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="campo-l">LINHA DO TEMPO</div>
            <button className="btn btn-soft" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setVerHist(true)}>
              🕓 Histórico completo
            </button>
          </div>
          <div className="tl">
            {!hist ? (
              <div className="muted" style={{ fontSize: 13 }}>Carregando…</div>
            ) : (
              hist.passagens.map((p, i) => {
                const s = SETOR_INFO[p.setor] || { nome: p.setor, ic: "•", cor: "#94a3b8" };
                return (
                  <div className="tl-row" key={i}>
                    <span className="tl-dot" style={{ background: s.cor }}>{s.ic}</span>
                    {i < hist.passagens.length - 1 && <span className="tl-line" />}
                    <div className="tl-body">
                      <div className="tl-top">
                        <strong>{s.nome}</strong>
                        {p.atual ? <span className="tl-badge agora">aqui agora</span> : <span className="tl-dur">{dur(p.duracaoMin)}</span>}
                      </div>
                      <div className="tl-meta">
                        👤 {p.operador || "—"} · entrou {brDT(p.entrouEm)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="modal-ft">
          {ehMaster && onPular && (
            <div className="master-pular" title="Atalho de teste (só master): move o card direto para o setor escolhido, sem passar por cada etapa">
              <span className="master-tag">🧪 Master · pular p/</span>
              <select value={pularSetor} onChange={(e) => setPularSetor(e.target.value)}>
                {SETORES.map((s) => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
              </select>
              <button className="btn btn-soft" onClick={() => { onPular(card, pularSetor); onFechar(); }}>Ir ▶</button>
            </div>
          )}
          <button className="btn" onClick={onFechar}>
            Fechar
          </button>
          {!cfg.semPrioridade && (
            <button
              className={"btn btn-prio" + (card.prioridade ? " on" : "")}
              onClick={() => onPrioridade(card)}
              title="Faz o pedido passar na frente nos próximos setores"
            >
              {card.prioridade ? "★ Na frente" : "☆ Passar na frente"}
            </button>
          )}
          {mostrarDefeito && (
            <button className="kbtn defeito" onClick={() => onAcao([card], "defeito")}>
              ⚠ Defeito
            </button>
          )}
          {mostrarDevolver && (
            <button className="kbtn defeito" onClick={() => onAcao([card], "devolverDefeito")}>
              ⚠ Voltou com defeito
            </button>
          )}
          <button className={"kbtn " + btn.cls} onClick={() => onAcao([card], acaoAtual)}>
            {btnLabel}
          </button>
        </div>
      </div>

      {verHist && hist && (
        <HistoricoModal hist={hist} titulo={opCodigo(card)} cliente={card.cliente_nome} onFechar={() => setVerHist(false)} />
      )}
    </div>
  );
}

function HistoricoModal({
  hist,
  titulo,
  cliente,
  onFechar,
}: {
  hist: NonNullable<Awaited<ReturnType<typeof api.historicoProducao>>>;
  titulo: string;
  cliente: string;
  onFechar: () => void;
}) {
  return (
    <div className="modal-bg" onClick={(e) => { e.stopPropagation(); onFechar(); }}>
      <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="modal-hd-top">
            <span className="modal-pills">
              <span className="modal-pill">{titulo}</span>
            </span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
          <div className="modal-hd-row">
            <span className="modal-cli">Histórico do pedido</span>
            <span className="kstatus fazendo">{dur(hist.totalMin)} no total</span>
          </div>
        </div>

        <div className="modal-bd">
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
            {cliente} · criado em {brDT(hist.criadoEm)}
          </div>
          <div className="tl">
            {hist.passagens.map((p, i) => {
              const s = SETOR_INFO[p.setor] || { nome: p.setor, ic: "•", cor: "#94a3b8" };
              return (
                <div className="tl-row big" key={i}>
                  <span className="tl-dot" style={{ background: s.cor }}>{s.ic}</span>
                  {i < hist.passagens.length - 1 && <span className="tl-line" />}
                  <div className="tl-body">
                    <div className="tl-top">
                      <strong>{s.nome}</strong>
                      {p.atual ? <span className="tl-badge agora">aqui agora</span> : <span className="tl-badge">{dur(p.duracaoMin)}</span>}
                    </div>
                    <div className="tl-meta">👤 Operador: <strong>{p.operador || "—"}</strong></div>
                    <div className="tl-meta">
                      Entrou {brDT(p.entrouEm)}{p.saiuEm ? ` · saiu ${brDT(p.saiuEm)}` : " · ainda neste setor"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-ft">
          <button className="btn" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// Modal "Dar entrada no estoque" (pedido de reposição, no setor Estoque).
// Casa os itens do pedido aos produtos e permite EDITAR a quantidade (defeitos etc.).
// Itens sem produto vinculado são listados com a localização na produção.
function EntradaEstoqueModal({ card, onFechar, onFeito }: { card: CardProducao; onFechar: () => void; onFeito: () => void }) {
  const [itens, setItens] = useState<(ItemPedidoEstoque & { usar: boolean; qtdEdit: number })[]>([]);
  const [numero, setNumero] = useState("");
  const [producao, setProducao] = useState<{ parte: string; setor: string; status: string }[]>([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [cadastrando, setCadastrando] = useState(false);
  function carregar() {
    api
      .itensPedidoParaEstoque(card.pedido_id)
      .then((r) => {
        setNumero(r.pedido.numero);
        setItens(r.itens.map((it) => ({ ...it, usar: !!it.produto_id, qtdEdit: it.qtd })));
        setProducao(r.producao || []);
      })
      .catch((e) => setErro((e as Error).message));
  }
  useEffect(carregar, [card.pedido_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setIt = (i: number, patch: Partial<{ usar: boolean; qtdEdit: number }>) =>
    setItens((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const semVinculo = itens.filter((it) => !it.produto_id);
  async function cadastrarFaltantes() {
    setCadastrando(true);
    try {
      await api.cadastrarProdutosDoPedido(card.pedido_id);
      carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCadastrando(false);
    }
  }

  async function confirmar() {
    const escolhidos = itens
      .filter((it) => it.usar && it.produto_id && it.qtdEdit > 0)
      .map((it) => ({ produto_id: it.produto_id!, qtd: it.qtdEdit }));
    if (!escolhidos.length) return setErro("Selecione ao menos um item com produto vinculado e quantidade.");
    setSalvando(true);
    setErro("");
    try {
      await api.entradaPorPedido({ pedido_id: card.pedido_id, pedido_numero: numero, itens: escolhidos });
      // Peças entraram no estoque → o card já cumpriu seu papel: remove do quadro.
      await api.concluirProducao(card.pedido_id, card.parte).catch(() => {});
      onFeito();
    } catch (e) {
      setErro((e as Error).message);
      setSalvando(false);
    }
  }

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">📥 Entrada no estoque — {numero}</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
        </div>
        <div className="pad">
          {erro && <p className="erro">{erro}</p>}
          <p className="muted" style={{ marginTop: 0 }}>
            Confira e <strong>ajuste a quantidade</strong> (ex.: peça com defeito) antes de dar entrada no estoque de produtos.
          </p>
          <table className="table">
            <thead><tr><th></th><th>Item do pedido</th><th>Produto no estoque</th><th className="num">Qtd</th></tr></thead>
            <tbody>
              {itens.map((it, i) => (
                <tr key={i} style={{ opacity: it.produto_id ? 1 : 0.55 }}>
                  <td><input type="checkbox" disabled={!it.produto_id} checked={it.usar} onChange={(e) => setIt(i, { usar: e.target.checked })} /></td>
                  <td>{it.produto}{it.ref ? ` · ${it.ref}` : ""}{it.cor ? ` · ${it.cor}` : ""}{it.tamanho ? ` · ${it.tamanho}` : ""}</td>
                  <td>{it.produto_nome ? <span className="strong">{it.produto_nome}</span> : <span className="muted">sem vínculo</span>}</td>
                  <td className="num"><input type="number" min={0} step="any" value={it.qtdEdit} disabled={!it.produto_id} onChange={(e) => setIt(i, { qtdEdit: Number(e.target.value) })} className="w-xs num" /></td>
                </tr>
              ))}
              {itens.length === 0 && <tr><td colSpan={4} className="empty pad">Sem itens.</td></tr>}
            </tbody>
          </table>
          {semVinculo.length > 0 && (
            <div style={{ marginTop: 10, padding: 10, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10 }}>
              <strong style={{ fontSize: 13 }}>⚠ {semVinculo.length} item(ns) sem produto cadastrado</strong>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                {producao.length > 0 && (
                  <>Onde está na produção: {producao.map((p) => `${p.parte} → ${SETOR_LABEL[p.setor] || p.setor} (${p.status})`).join(" · ")}. </>
                )}
              </div>
              <button className="btn btn-soft" style={{ marginTop: 8 }} disabled={cadastrando} onClick={cadastrarFaltantes}>
                {cadastrando ? "Cadastrando…" : `＋ Cadastrar ${semVinculo.length} produto(s) automaticamente`}
              </button>
            </div>
          )}
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button className="btn" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={confirmar}>{salvando ? "…" : "Dar entrada no estoque"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
