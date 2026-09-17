// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO EXPERIMENTAL "Navegador CRM" — 1ª versão (web).
// Esquerda (≈72%): navegador embutido (iframe) com barra de navegação.
// Direita (≈28%): painel CRM com dados DEMONSTRATIVOS (sem ligar no banco ainda).
//
// LIMITAÇÃO CONHECIDA (web): sites como Google e WhatsApp Web enviam
// X-Frame-Options / CSP frame-ancestors e NÃO abrem dentro de iframe. Pra esses,
// mostramos um aviso + "abrir em nova aba". O navegador embutido de verdade
// (que abre WhatsApp Web) exige a versão desktop (Electron/WebContentsView).
//
// Este módulo é ADITIVO: não mexe no CRM/atendimento/catálogo/pedidos existentes.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from "react";

const ATALHOS: { label: string; url: string }[] = [
  { label: "Catálogo", url: "https://catalogo.bigtricot.com.br" },
  { label: "Google", url: "https://www.google.com" },
  { label: "WhatsApp Web", url: "https://web.whatsapp.com" },
  { label: "Correios", url: "https://www.correios.com.br/rastreamento" },
  { label: "Consulta CNPJ", url: "https://casadosdados.com.br" },
];
const INICIO = "https://catalogo.bigtricot.com.br";

export function NavegadorCrm() {
  const [campo, setCampo] = useState(INICIO);
  const [hist, setHist] = useState<string[]>([INICIO]); // pilha de endereços visitados
  const [idx, setIdx] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const url = hist[idx];

  function normaliza(u: string): string {
    let x = (u || "").trim();
    if (!x) return "";
    // busca no Google se não parecer um endereço
    if (!/^https?:\/\//i.test(x)) {
      if (/\.[a-z]{2,}(\/|$|:)/i.test(x) || x.startsWith("localhost")) x = "https://" + x;
      else return "https://www.google.com/search?q=" + encodeURIComponent(x);
    }
    return x;
  }
  function irPara(u: string) {
    const x = normaliza(u);
    if (!x) return;
    const nova = [...hist.slice(0, idx + 1), x];
    setHist(nova); setIdx(nova.length - 1); setCampo(x); setCarregando(true);
  }
  function voltar() { if (idx > 0) { const i = idx - 1; setIdx(i); setCampo(hist[i]); setCarregando(true); } }
  function avancar() { if (idx < hist.length - 1) { const i = idx + 1; setIdx(i); setCampo(hist[i]); setCarregando(true); } }
  function recarregar() { setCarregando(true); if (iframeRef.current) iframeRef.current.src = url; }

  return (
    <div className="quadro-page navcrm" style={{ maxWidth: "none" }}>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div><h1 style={{ margin: 0, fontSize: 20 }}>🌐 Navegador CRM</h1>
          <div className="breadcrumb">Módulo experimental — navegador + CRM lado a lado</div></div>
      </div>

      <div className="navcrm-split">
        {/* ── ESQUERDA: navegador ── */}
        <section className="navcrm-web">
          <div className="navcrm-bar">
            <button className="navcrm-ic" onClick={voltar} disabled={idx <= 0} title="Voltar">‹</button>
            <button className="navcrm-ic" onClick={avancar} disabled={idx >= hist.length - 1} title="Avançar">›</button>
            <button className="navcrm-ic" onClick={recarregar} title="Recarregar">⟳</button>
            <button className="navcrm-ic" onClick={() => irPara(INICIO)} title="Início">⌂</button>
            <form className="navcrm-addr" onSubmit={(e) => { e.preventDefault(); irPara(campo); }}>
              <input value={campo} onChange={(e) => setCampo(e.target.value)} spellCheck={false}
                placeholder="Digite um endereço ou uma busca…" />
            </form>
            {carregando && <span className="navcrm-load" title="Carregando">carregando…</span>}
            <a className="navcrm-ic navcrm-ext" href={url} target="_blank" rel="noreferrer" title="Abrir em nova aba">↗</a>
          </div>
          <div className="navcrm-atalhos">
            <span className="navcrm-atalhos-lbl">Atalhos:</span>
            {ATALHOS.map((a) => (
              <button key={a.url} className={"navcrm-chip" + (a.url === url ? " on" : "")} onClick={() => irPara(a.url)}>{a.label}</button>
            ))}
          </div>
          <div className="navcrm-frame">
            <div className="navcrm-aviso">
              ⚠️ Alguns sites (Google, WhatsApp Web, bancos) <b>não abrem embutidos</b> por segurança — se ficar em branco, use <b>↗ abrir em nova aba</b>. O navegador completo (WhatsApp Web) vem na versão desktop.
            </div>
            <iframe
              ref={iframeRef}
              src={url}
              title="Navegador embutido"
              onLoad={() => setCarregando(false)}
              referrerPolicy="no-referrer"
              sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
            />
          </div>
        </section>

        {/* ── DIREITA: painel CRM (dados demonstrativos) ── */}
        <aside className="navcrm-crm">
          <div className="navcrm-crm-scroll">
            <div className="navcrm-cli">
              <div className="navcrm-cli-av">CC</div>
              <div>
                <div className="navcrm-cli-nm">Casa Conceito</div>
                <div className="navcrm-cli-sub">Casa Conceito Home Decor</div>
                <span className="navcrm-badge ok">● Cliente ativo</span>
              </div>
            </div>

            <div className="navcrm-sec">
              <div className="navcrm-sec-h">Dados do cliente</div>
              <div className="navcrm-kv"><span>Telefone</span><b>(31) 99123-4567</b></div>
              <div className="navcrm-kv"><span>Cidade</span><b>Sete Lagoas / MG</b></div>
              <div className="navcrm-kv"><span>CNPJ</span><b>12.345.678/0001-90</b></div>
              <div className="navcrm-kv"><span>Representante</span><b>Beatriz (SP)</b></div>
            </div>

            <div className="navcrm-sec">
              <div className="navcrm-sec-h">Status comercial</div>
              <div className="navcrm-status">
                {["Novo lead", "Em atendimento", "Orçamento", "Pedido", "Follow-up", "Sem resposta"].map((s, i) => (
                  <span key={s} className={"navcrm-st" + (i === 2 ? " on" : "")}>{s}</span>
                ))}
              </div>
            </div>

            <div className="navcrm-sec">
              <div className="navcrm-sec-h">Resumo</div>
              <div className="navcrm-kv"><span>Último pedido</span><b>#5847 · 12/08/2025</b></div>
              <div className="navcrm-kv"><span>Valor do último</span><b>R$ 4.850,00</b></div>
              <div className="navcrm-kv"><span>Total comprado</span><b>R$ 38.900,00</b></div>
              <div className="navcrm-kv"><span>Ticket médio</span><b>R$ 3.850,00</b></div>
              <div className="navcrm-kv"><span>Pagamento</span><b>Boleto / Cartão</b></div>
            </div>

            <div className="navcrm-sec">
              <div className="navcrm-sec-h">Ações rápidas</div>
              <div className="navcrm-acoes">
                {["Criar pedido", "Gerar orçamento", "Abrir cliente", "Consultar estoque", "Adicionar observação", "Criar follow-up"].map((a) => (
                  <button key={a} className="navcrm-acao" onClick={() => alert(`"${a}" — vai ligar no sistema numa próxima versão.`)}>{a}</button>
                ))}
              </div>
            </div>

            <div className="navcrm-sec">
              <div className="navcrm-sec-h">Histórico</div>
              <div className="navcrm-hist"><b>#5847</b> · 12/08/2025 · R$ 4.850,00 <span className="navcrm-pill">Entregue</span></div>
              <div className="navcrm-hist"><b>#5721</b> · 03/06/2025 · R$ 3.120,00 <span className="navcrm-pill">Entregue</span></div>
              <div className="navcrm-hist obs">📝 Cliente trabalha com decoração de alto padrão.</div>
              <div className="navcrm-hist obs">💬 Última interação: pediu orçamento do kit Linea.</div>
            </div>

            <div className="navcrm-nota">Dados de exemplo. Nesta 1ª versão o painel ainda não está ligado ao banco — é a prova do layout.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
