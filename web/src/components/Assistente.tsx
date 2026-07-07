import { useEffect, useRef, useState } from "react";
import { api } from "../api";

interface Msg { de: "voce" | "ia"; texto: string }

const SUGESTOES = [
  "Quais pedidos estão atrasados?",
  "Quais produtos estão em falta?",
  "Quanto cada representante vendeu esse mês?",
  "O que devo produzir primeiro?",
];

// Assistente (copiloto) do Big Tricot — chat flutuante que responde com dados reais.
export function Assistente() {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => { fim.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, carregando]);

  async function enviar(pergunta?: string) {
    const q = (pergunta ?? texto).trim();
    if (!q || carregando) return;
    setMsgs((m) => [...m, { de: "voce", texto: q }]);
    setTexto("");
    setCarregando(true);
    try {
      const r = await api.perguntarAssistente(q);
      setMsgs((m) => [...m, { de: "ia", texto: r.resposta }]);
    } catch (e) {
      setMsgs((m) => [...m, { de: "ia", texto: "⚠️ " + (e as Error).message }]);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <>
      <button className={"ia-fab" + (aberto ? " on" : "")} onClick={() => setAberto((o) => !o)} title="Assistente Big Tricot (IA)">
        {aberto ? "✕" : "🤖"}
      </button>
      {aberto && (
        <div className="ia-panel">
          <div className="ia-hd">
            <span>🤖 Assistente Big Tricot</span>
            <button className="ia-x" onClick={() => setAberto(false)}>✕</button>
          </div>
          <div className="ia-body">
            {msgs.length === 0 && (
              <div className="ia-vazio">
                <p>Pergunte sobre produção, estoque, atrasos e vendas — respondo com os dados reais do sistema.</p>
                <div className="ia-sug">
                  {SUGESTOES.map((s) => <button key={s} onClick={() => enviar(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={"ia-msg " + m.de}>{m.texto}</div>
            ))}
            {carregando && <div className="ia-msg ia pensando">pensando…</div>}
            <div ref={fim} />
          </div>
          <div className="ia-foot">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") enviar(); }}
              placeholder="Digite sua pergunta…"
              disabled={carregando}
            />
            <button className="btn btn-primary" onClick={() => enviar()} disabled={carregando || !texto.trim()}>Enviar</button>
          </div>
          <div className="ia-nota">A IA interpreta os dados do sistema. Para valores críticos, confira também a tela.</div>
        </div>
      )}
    </>
  );
}
