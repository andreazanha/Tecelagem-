import { NavLink, Outlet, Link } from "react-router-dom";
import { Logo } from "./Logo";
import { VERSION } from "../version";

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
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <Logo h={30} color="#ffffff" />
          <span className="brand-sub">Rolagem de Fase</span>
        </Link>
        <div className="topbar-right">
          <a className="painel-link" href="/dashboard" target="_blank" rel="noopener noreferrer" title="Abrir painel de TV">
            📺 Painel TV
          </a>
          <a className="painel-link tcl-link" href="/tv/tecelagem" target="_blank" rel="noopener noreferrer" title="TV Tecelagem">
            🧵 TV Tecelagem
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
        <div className="sidebar-version">{VERSION}</div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
