import { NavLink, Outlet, Link } from "react-router-dom";
import { Logo } from "./Logo";

const NAV = [
  { to: "/pedidos", icon: "📦", label: "Pedidos" },
  { to: "/producao", icon: "🏭", label: "Produção", disabled: true },
  { to: "/romaneios", icon: "📋", label: "Romaneios", disabled: true },
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
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
