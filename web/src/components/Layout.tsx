import { useEffect, useReducer, useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { Logo } from "./Logo";
import { VERSION } from "../version";
import { historico } from "../historico";

function UndoRedo() {
  const [, forcar] = useReducer((x) => x + 1, 0);
  useEffect(() => historico.subscribe(forcar), []);
  useEffect(() => {
    function k(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        historico.desfazer().catch((err) => alert((err as Error).message));
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        historico.refazer().catch((err) => alert((err as Error).message));
      }
    }
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <div className="undoredo">
      <button
        className="ur-btn"
        disabled={!historico.podeDesfazer()}
        title={historico.podeDesfazer() ? `Desfazer ${historico.rotuloDesfazer()} (Ctrl+Z)` : "Nada para desfazer"}
        onClick={() => historico.desfazer().catch((e) => alert((e as Error).message))}
      >
        ↶ Desfazer
      </button>
      <button
        className="ur-btn"
        disabled={!historico.podeRefazer()}
        title={historico.podeRefazer() ? `Refazer ${historico.rotuloRefazer()} (Ctrl+Y)` : "Nada para refazer"}
        onClick={() => historico.refazer().catch((e) => alert((e as Error).message))}
      >
        ↷ Refazer
      </button>
    </div>
  );
}

const NAV = [
  { to: "/pedidos", icon: "📦", label: "Pedidos" },
  { to: "/producao", icon: "🧶", label: "Tecelagem" },
  { to: "/passadoria", icon: "🔥", label: "Passadoria" },
  { to: "/cadastros", icon: "🏷️", label: "Cadastros" },
  { to: "/romaneios", icon: "📋", label: "Romaneios" },
  { to: "/estoque", icon: "🗃️", label: "Estoque", disabled: true },
  { to: "/relatorios", icon: "📊", label: "Relatórios", disabled: true },
];

export function Layout() {
  const [ssMin, setSsMin] = useState(() => Number(localStorage.getItem("ssMin") || "0"));
  function mudarSs(v: number) {
    const n = Math.max(0, Math.min(240, Math.floor(v) || 0));
    setSsMin(n);
    localStorage.setItem("ssMin", String(n));
  }
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <Logo h={30} color="#ffffff" />
          <span className="brand-sub">Rolagem de Fase</span>
        </Link>
        <div className="topbar-right">
          <UndoRedo />
          <a className="painel-link" href="/dashboard" target="_blank" rel="noopener noreferrer" title="Abrir painel de TV">
            📺 Painel TV
          </a>
          <a className="painel-link tcl-link" href="/tv/tecelagem" target="_blank" rel="noopener noreferrer" title="TV Tecelagem">
            🧵 TV Tecelagem
          </a>
          <a className="painel-link tcl-link" href="/tv/costura" target="_blank" rel="noopener noreferrer" title="TV Costura">
            🪡 TV Costura
          </a>
          <a className="painel-link tcl-link" href="/tv/revisao" target="_blank" rel="noopener noreferrer" title="TV Revisão">
            🔍 TV Revisão
          </a>
          <span className="user">Ana Paula</span>
          <span className="avatar">AP</span>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-title">Big Tricot</div>
        <div className="sidebar-kicker">Cadastro &amp; Produção</div>
        <nav>
          {NAV.map((n) =>
            n.disabled ? (
              <span key={n.to} className="nav-item disabled" title="Em breve">
                <span className="nav-ic">{n.icon}</span>
                {n.label}
                <span className="soon">em breve</span>
              </span>
            ) : (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
              >
                <span className="nav-ic">{n.icon}</span>
                {n.label}
              </NavLink>
            )
          )}
        </nav>
        <div className="ss-cfg" title="Após esse tempo sem uso, entra em modo TV (Dashboard). 0 = desligado.">
          💤 Protetor (min)
          <input type="number" min={0} max={240} value={ssMin} onChange={(e) => mudarSs(Number(e.target.value))} />
        </div>
        <div className="sidebar-version">{VERSION}</div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
