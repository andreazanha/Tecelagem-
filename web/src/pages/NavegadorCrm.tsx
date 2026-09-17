// ─────────────────────────────────────────────────────────────────────────────
// MÓDULO "Navegador CRM".
// Esquerda (≈72%): navegador embutido. Direita (≈28%): painel CRM (dados demo).
//
// DOIS MODOS (mesmo layout):
//  • DESKTOP (Electron): existe window.navcrmDesktop → a área do navegador é um
//    WebContentsView REAL (posicionado pelo processo principal). Abre WhatsApp Web
//    de verdade. A barra controla esse navegador via IPC.
//  • WEB (navegador comum): sem Electron → cai no <iframe> (funciona pra sites que
//    permitem embutir; Google/WhatsApp bloqueiam — mostra aviso + abrir em nova aba).
//
// Aditivo: não mexe no CRM/atendimento/catálogo/pedidos existentes.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";

type Bounds = { x: number; y: number; width: number; height: number };
type EstadoNav = { url: string; podeVoltar: boolean; podeAvancar: boolean; carregando: boolean };
declare global {
  interface Window {
    navcrmDesktop?: {
      versao: number;
      montar: (b: Bounds) => Promise<boolean>;
      bounds: (b: Bounds) => Promise<boolean>;
      desmontar: () => Promise<boolean>;
      navegar: (url: string) => Promise<boolean>;
      voltar: () => Promise<boolean>;
      avancar: () => Promise<boolean>;
      recarregar: () => Promise<boolean>;
      inicio: () => Promise<boolean>;
      onEstado: (cb: (s: EstadoNav) => void) => () => void;
      onPedirBounds: (cb: () => void) => () => void;
      onContato?: (cb: (p: { titulo: string | null }) => void) => () => void;
      definirExtrator?: (code: string) => Promise<boolean>;
    };
  }
}

const ATALHOS: { label: string; url: string }[] = [
  { label: "WhatsApp Web", url: "https://web.whatsapp.com" },
  { label: "Catálogo", url: "https://catalogo.bigtricot.com.br" },
  { label: "Google", url: "https://www.google.com" },
  { label: "Correios", url: "https://www.correios.com.br/rastreamento" },
  { label: "Consulta CNPJ", url: "https://casadosdados.com.br" },
];
const INICIO_WEB = "https://catalogo.bigtricot.com.br";

// Leitor do nome do contato da conversa aberta no WhatsApp Web. Fica AQUI (na web)
// de propósito: assim dá pra afinar os seletores e o app desktop recebe a versão
// nova sozinho, sem reinstalar. Lê SÓ o nome/número do cabeçalho — nunca mensagens.
const EXTRATOR_CONTATO = `(function(){try{
  var m=document.querySelector('#main'); if(!m) return null;
  var h=m.querySelector('header'); if(!h) return null;
  var spans=h.querySelectorAll('span[title]'); var nome='';
  for(var i=0;i<spans.length;i++){
    var t=(spans[i].getAttribute('title')||'').replace(/\\s+/g,' ').trim();
    var txt=(spans[i].textContent||'').replace(/\\s+/g,' ').trim();
    if(t && t===txt){ nome=t; break; }
  }
  if(!nome){ var d=h.querySelector('span[dir="auto"]'); nome=d?(d.textContent||'').replace(/\\s+/g,' ').trim():''; }
  if(!nome) return null;
  if(/clique|clic|toque|dados do contato|click here/i.test(nome)) return null;
  return nome;
}catch(e){ return null; }})()`;

function normaliza(u: string): string {
  let x = (u || "").trim();
  if (!x) return "";
  if (!/^https?:\/\//i.test(x)) {
    if (/\.[a-z]{2,}(\/|$|:)/i.test(x) || x.startsWith("localhost")) x = "https://" + x;
    else return "https://www.google.com/search?q=" + encodeURIComponent(x);
  }
  return x;
}

type Pedido = { id: string; numero: string | null; data: string | null; valor: number; situacao: string };
type ClienteFicha = {
  id: string; nome: string; whatsapp: string | null; cidade: string | null; uf: string | null;
  cnpj: string | null; representante: string | null; observacao: string | null; bloqueado?: number | boolean | null;
  kpis: { total: number; pedidos: number; ticket: number; ultima: string | null };
  historico: Pedido[];
};

const brl = (n: number) => "R$ " + (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function dataBR(s: string | null): string {
  if (!s) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
function iniciais(nome: string): string {
  const p = (nome || "").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}

export function NavegadorCrm() {
  const dk = typeof window !== "undefined" ? window.navcrmDesktop : undefined;

  // Estado do modo WEB (iframe): histórico próprio de endereços.
  const [hist, setHist] = useState<string[]>([INICIO_WEB]);
  const [idx, setIdx] = useState(0);
  const [campo, setCampo] = useState(INICIO_WEB);
  const [carregando, setCarregando] = useState(true);
  // Estado extra do modo DESKTOP (vem do navegador real).
  const [dkPodeVoltar, setDkPodeVoltar] = useState(false);
  const [dkPodeAvancar, setDkPodeAvancar] = useState(false);
  // Fase 2: contato lido da conversa aberta no WhatsApp → cliente real do sistema.
  const [contatoTitulo, setContatoTitulo] = useState<string | null>(null);
  const [clienteReal, setClienteReal] = useState<ClienteFicha | null>(null);
  const [buscandoCli, setBuscandoCli] = useState(false);
  const [naoAchou, setNaoAchou] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const urlWeb = hist[idx];

  // ── DESKTOP: posiciona o navegador real sobre a área e escuta o estado ──
  useEffect(() => {
    const d = dk; const el = holderRef.current;
    if (!d || !el) return;
    const rect = (): Bounds => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; };
    d.montar(rect());
    if (d.definirExtrator) d.definirExtrator(EXTRATOR_CONTATO); // afina o leitor sem reinstalar
    const reenviar = () => d.bounds(rect());
    const ro = new ResizeObserver(reenviar); ro.observe(el);
    window.addEventListener("resize", reenviar);
    const offBounds = d.onPedirBounds(reenviar);
    const offEstado = d.onEstado((s) => { setCampo(s.url); setCarregando(s.carregando); setDkPodeVoltar(s.podeVoltar); setDkPodeAvancar(s.podeAvancar); });
    const offContato = d.onContato ? d.onContato((p) => setContatoTitulo(p && p.titulo ? p.titulo : null)) : () => {};
    const iv = window.setInterval(reenviar, 800); // segurança p/ mudanças de layout
    return () => { ro.disconnect(); window.removeEventListener("resize", reenviar); offBounds(); offEstado(); offContato(); window.clearInterval(iv); d.desmontar(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fase 2: quando muda o contato da conversa aberta, busca o cliente real.
  useEffect(() => {
    if (!dk) return;
    if (!contatoTitulo) { setClienteReal(null); setNaoAchou(false); setBuscandoCli(false); return; }
    let cancel = false;
    setBuscandoCli(true); setNaoAchou(false);
    fetch("/api/clientes/resolver?q=" + encodeURIComponent(contatoTitulo), { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (j && j.cliente) { setClienteReal(j.cliente as ClienteFicha); setNaoAchou(false); }
        else { setClienteReal(null); setNaoAchou(true); }
      })
      .catch(() => { if (!cancel) { setClienteReal(null); setNaoAchou(true); } })
      .finally(() => { if (!cancel) setBuscandoCli(false); });
    return () => { cancel = true; };
  }, [contatoTitulo, dk]);

  function irPara(u: string) {
    const x = normaliza(u); if (!x) return;
    if (dk) { setCampo(x); dk.navegar(x); return; }
    const nova = [...hist.slice(0, idx + 1), x]; setHist(nova); setIdx(nova.length - 1); setCampo(x); setCarregando(true);
  }
  function voltar() { if (dk) { dk.voltar(); return; } if (idx > 0) { const i = idx - 1; setIdx(i); setCampo(hist[i]); setCarregando(true); } }
  function avancar() { if (dk) { dk.avancar(); return; } if (idx < hist.length - 1) { const i = idx + 1; setIdx(i); setCampo(hist[i]); setCarregando(true); } }
  function recarregar() { if (dk) { dk.recarregar(); return; } setCarregando(true); if (iframeRef.current) iframeRef.current.src = urlWeb; }
  function inicio() { if (dk) { dk.inicio(); return; } irPara(INICIO_WEB); }

  const podeVoltar = dk ? dkPodeVoltar : idx > 0;
  const podeAvancar = dk ? dkPodeAvancar : idx < hist.length - 1;
  const urlAtual = dk ? campo : urlWeb; // pro "abrir em nova aba"

  return (
    <div className="quadro-page navcrm" style={{ maxWidth: "none" }}>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div><h1 style={{ margin: 0, fontSize: 20 }}>🌐 Navegador CRM</h1>
          <div className="breadcrumb">Módulo experimental — navegador + CRM lado a lado{dk ? " · modo desktop (navegador real)" : ""}</div></div>
      </div>

      <div className="navcrm-split">
        {/* ── ESQUERDA: navegador ── */}
        <section className="navcrm-web">
          <div className="navcrm-bar">
            <button className="navcrm-ic" onClick={voltar} disabled={!podeVoltar} title="Voltar">‹</button>
            <button className="navcrm-ic" onClick={avancar} disabled={!podeAvancar} title="Avançar">›</button>
            <button className="navcrm-ic" onClick={recarregar} title="Recarregar">⟳</button>
            <button className="navcrm-ic" onClick={inicio} title="Início">⌂</button>
            <form className="navcrm-addr" onSubmit={(e) => { e.preventDefault(); irPara(campo); }}>
              <input value={campo} onChange={(e) => setCampo(e.target.value)} spellCheck={false} placeholder="Digite um endereço ou uma busca…" />
            </form>
            {carregando && <span className="navcrm-load" title="Carregando">carregando…</span>}
            <a className="navcrm-ic navcrm-ext" href={urlAtual} target="_blank" rel="noreferrer" title="Abrir em nova aba">↗</a>
          </div>
          <div className="navcrm-atalhos">
            <span className="navcrm-atalhos-lbl">Atalhos:</span>
            {ATALHOS.map((a) => (
              <button key={a.url} className="navcrm-chip" onClick={() => irPara(a.url)}>{a.label}</button>
            ))}
          </div>
          <div className="navcrm-frame">
            {dk ? (
              // Modo DESKTOP: espaço reservado — o navegador real (Electron) fica por cima daqui.
              <div ref={holderRef} className="navcrm-holder" />
            ) : (<>
              <div className="navcrm-aviso">
                ⚠️ Alguns sites (Google, WhatsApp Web, bancos) <b>não abrem embutidos</b> por segurança — se ficar em branco, use <b>↗ abrir em nova aba</b>. O navegador completo (WhatsApp Web) vem na versão desktop.
              </div>
              <iframe ref={iframeRef} src={urlWeb} title="Navegador embutido" onLoad={() => setCarregando(false)}
                referrerPolicy="no-referrer"
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads" />
            </>)}
          </div>
        </section>

        {/* ── DIREITA: painel CRM. No desktop, mostra o CLIENTE REAL da conversa
             aberta no WhatsApp; na web (sem detecção), mostra o exemplo. ── */}
        <aside className="navcrm-crm">
          <div className="navcrm-crm-scroll">
            {dk ? (
              clienteReal ? (
                <>
                  <div className="navcrm-cli">
                    <div className="navcrm-cli-av">{iniciais(clienteReal.nome)}</div>
                    <div>
                      <div className="navcrm-cli-nm">{clienteReal.nome}</div>
                      {contatoTitulo && <div className="navcrm-cli-sub">Conversa: {contatoTitulo}</div>}
                      {clienteReal.bloqueado
                        ? <span className="navcrm-badge bloq">● Bloqueado</span>
                        : <span className="navcrm-badge ok">● Cliente no sistema</span>}
                    </div>
                  </div>
                  <div className="navcrm-sec">
                    <div className="navcrm-sec-h">Dados do cliente</div>
                    <div className="navcrm-kv"><span>Telefone</span><b>{clienteReal.whatsapp || "—"}</b></div>
                    <div className="navcrm-kv"><span>Cidade</span><b>{[clienteReal.cidade, clienteReal.uf].filter(Boolean).join(" / ") || "—"}</b></div>
                    <div className="navcrm-kv"><span>CNPJ</span><b>{clienteReal.cnpj || "—"}</b></div>
                    <div className="navcrm-kv"><span>Representante</span><b>{clienteReal.representante || "—"}</b></div>
                  </div>
                  <div className="navcrm-sec">
                    <div className="navcrm-sec-h">Resumo</div>
                    <div className="navcrm-kv"><span>Último pedido</span><b>{clienteReal.historico[0] ? `${clienteReal.historico[0].numero ? "#" + clienteReal.historico[0].numero + " · " : ""}${dataBR(clienteReal.kpis.ultima)}` : "—"}</b></div>
                    <div className="navcrm-kv"><span>Valor do último</span><b>{clienteReal.historico[0] ? brl(clienteReal.historico[0].valor) : "—"}</b></div>
                    <div className="navcrm-kv"><span>Total comprado</span><b>{brl(clienteReal.kpis.total)}</b></div>
                    <div className="navcrm-kv"><span>Ticket médio</span><b>{brl(clienteReal.kpis.ticket)}</b></div>
                    <div className="navcrm-kv"><span>Pedidos</span><b>{clienteReal.kpis.pedidos}</b></div>
                  </div>
                  <div className="navcrm-sec">
                    <div className="navcrm-sec-h">Ações rápidas</div>
                    <div className="navcrm-acoes">
                      {["Criar pedido", "Gerar orçamento", "Abrir cliente", "Consultar estoque", "Adicionar observação", "Criar follow-up"].map((a) => (
                        <button key={a} className="navcrm-acao" onClick={() => alert(`"${a}" para ${clienteReal.nome} — vai ligar no sistema numa próxima versão.`)}>{a}</button>
                      ))}
                    </div>
                  </div>
                  <div className="navcrm-sec">
                    <div className="navcrm-sec-h">Histórico</div>
                    {clienteReal.historico.length
                      ? clienteReal.historico.slice(0, 10).map((p) => (
                          <div className="navcrm-hist" key={p.id}><b>{p.numero ? "#" + p.numero : "—"}</b> · {dataBR(p.data)} · {brl(p.valor)} <span className={"navcrm-pill" + (p.situacao === "entregue" ? "" : " prod")}>{p.situacao}</span></div>
                        ))
                      : <div className="navcrm-hist obs">Sem pedidos registrados.</div>}
                    {clienteReal.observacao && <div className="navcrm-hist obs">📝 {clienteReal.observacao}</div>}
                  </div>
                  <div className="navcrm-nota">Cliente carregado automaticamente da conversa aberta. Dados reais do sistema.</div>
                </>
              ) : (
                <div className="navcrm-vazio">
                  <div className="navcrm-vazio-ic">{buscandoCli ? "⏳" : "👤"}</div>
                  {buscandoCli ? (
                    <div className="navcrm-vazio-t">Procurando cliente…</div>
                  ) : contatoTitulo ? (
                    <>
                      <div className="navcrm-vazio-t">Conversa aberta</div>
                      <div className="navcrm-vazio-nome">{contatoTitulo}</div>
                      <div className="navcrm-vazio-sub">Esse contato ainda não está no seu cadastro de clientes. Quando você cadastrar (com esse nome ou telefone), os dados aparecem aqui sozinhos.</div>
                    </>
                  ) : (
                    <>
                      <div className="navcrm-vazio-t">Abra uma conversa</div>
                      <div className="navcrm-vazio-sub">Clique numa conversa no WhatsApp ao lado que os dados do cliente aparecem aqui automaticamente.</div>
                    </>
                  )}
                </div>
              )
            ) : (
            <>
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
            <div className="navcrm-nota">Dados de exemplo (versão web). No app desktop, aqui aparece o cliente real da conversa aberta no WhatsApp.</div>
            </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
