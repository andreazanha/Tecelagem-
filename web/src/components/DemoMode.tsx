import { useEffect, useState } from "react";
import { isDemo, setDemo } from "../demo";

// Passos sugeridos para o teste guiado (só orientação; nada é salvo no modo demo).
const PASSOS: { t: string; d: string }[] = [
  { t: "Cadastre um produto", d: "Cadastros › Produtos › Novo produto. Preencha nome, tamanhos, cores…" },
  { t: "Monte a ficha", d: "Nas seções do produto: Zíper, Encarte, Tag, Tassel — veja como cada uma funciona." },
  { t: "Cadastre um material", d: "Cadastros › Materiais. Experimente colar em massa e alterar em massa." },
  { t: "Gere uma ordem de compra", d: "Cadastros › Materiais › Compras — escolha itens e gere a ordem." },
  { t: "Abra um pedido", d: "Comercial › Novo pedido. Veja o fluxo até a produção." },
  { t: "Passe pela produção", d: "Produção › Tecelagem/Costura/Revisão — veja os painéis." },
];

// Widget do MODO DEMONSTRAÇÃO:
//  • desligado → um botão discreto para ligar;
//  • ligado → uma faixa fixa no topo + guia de passos + aviso quando algo é
//    "salvo" (na verdade nada é gravado — só um toast).
export function DemoMode() {
  const [on, setOn] = useState(isDemo());
  const [guia, setGuia] = useState(true);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    const mudou = () => setOn(isDemo());
    const bloqueou = () => { setToast(true); window.clearTimeout((bloqueou as unknown as { _t?: number })._t); (bloqueou as unknown as { _t?: number })._t = window.setTimeout(() => setToast(false), 2200); };
    window.addEventListener("demo-change", mudou);
    window.addEventListener("demo-block", bloqueou);
    return () => { window.removeEventListener("demo-change", mudou); window.removeEventListener("demo-block", bloqueou); };
  }, []);

  function ligar() { setDemo(true); setGuia(true); }
  function desligar() { setDemo(false); }

  if (!on) {
    return (
      <button className="demo-enter" onClick={ligar} title="Testar o sistema sem gravar nada">
        🎭 Testar (demo)
      </button>
    );
  }

  return (
    <>
      <div className="demo-bar">
        <span className="demo-bar-t">🎭 MODO DEMONSTRAÇÃO — nada é salvo de verdade</span>
        <button className="demo-bar-b" onClick={() => setGuia((g) => !g)}>{guia ? "Ocultar guia" : "Mostrar guia"}</button>
        <button className="demo-bar-x" onClick={desligar}>Sair do modo teste</button>
      </div>

      {guia && (
        <div className="demo-guia">
          <div className="demo-guia-h">
            <strong>Teste guiado</strong>
            <button onClick={() => setGuia(false)} className="demo-guia-close">✕</button>
          </div>
          <p className="demo-guia-sub">Explore à vontade — pode clicar em salvar que <strong>nada é gravado</strong>.</p>
          <ol className="demo-guia-ol">
            {PASSOS.map((p) => (
              <li key={p.t}><strong>{p.t}</strong><br /><span>{p.d}</span></li>
            ))}
          </ol>
        </div>
      )}

      {toast && <div className="demo-toast">🎭 Isso <strong>não foi salvo</strong> — modo demonstração.</div>}
    </>
  );
}
