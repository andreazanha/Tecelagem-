import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type CompraSugestao } from "../api";
import { getUser, podeFuncao } from "../auth";

// Popup de AVISO DE ESTOQUE BAIXO para o PCP: ao abrir a tela, se houver material
// abaixo do mínimo, mostra um popup no meio da tela com a lista e um atalho pra
// Compras. Fecha por sessão (reaparece no próximo acesso enquanto houver baixo).
export function AvisoEstoqueBaixo() {
  const nav = useNavigate();
  const [itens, setItens] = useState<CompraSugestao[] | null>(null);
  const [fechado, setFechado] = useState(false);

  useEffect(() => {
    if (!podeFuncao(getUser(), "compras.ordem")) return; // só quem pode fazer ordem de compra (PCP)
    try { if (sessionStorage.getItem("avisoEstoqueBaixo") === "1") { setFechado(true); return; } } catch { /* ok */ }
    api.comprasMateriais().then(setItens).catch(() => {});
  }, []);

  if (fechado || !itens || itens.length === 0) return null;
  function fechar() { try { sessionStorage.setItem("avisoEstoqueBaixo", "1"); } catch { /* ok */ } setFechado(true); }
  const lista = itens as CompraSugestao[];
  const topo = lista.slice(0, 8);
  const un = (u: string | null | undefined) => (u ? ` ${u}` : "");

  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
      <div className="aviso-pop" style={{ borderTopColor: "#dc2626", maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="aviso-pop-ic">📦</div>
        <h2 className="aviso-pop-tit" style={{ color: "#b91c1c" }}>Estoque baixo</h2>
        <div className="aviso-pop-sub">{lista.length} material(is) abaixo do mínimo — gere a ordem de compra</div>
        <div className="aviso-pop-body" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
          {topo.map((m, i) => (
            <div key={i} className="aviso-pop-item">• {m.nome}{m.tamanho ? ` ${m.tamanho}` : ""}{m.cor ? ` (${m.cor})` : ""} — {m.saldo || 0}{un(m.unidade)} / mín {m.minimo || 0}</div>
          ))}
          {lista.length > topo.length && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>+ {lista.length - topo.length} outro(s)…</div>}
        </div>
        <div className="aviso-pop-acts">
          <button className="btn btn-soft" onClick={fechar}>Fechar</button>
          <button className="btn btn-primary" onClick={() => { fechar(); nav("/compras"); }}>🛒 Ver compras</button>
        </div>
      </div>
    </div>
  );
}
