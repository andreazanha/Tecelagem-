import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Pedidos } from "./pages/Pedidos";
import { NovoPedido } from "./pages/NovoPedido";
import { PedidoDetalhe } from "./pages/PedidoDetalhe";
import { Cadastros } from "./pages/Cadastros";
import { Romaneios } from "./pages/Romaneios";
import { Producao } from "./pages/Producao";
import { Passadoria } from "./pages/Passadoria";
import { Dashboard } from "./pages/Dashboard";
import { TvTecelagem } from "./pages/TvTecelagem";
import { TvCostura } from "./pages/TvCostura";
import { TvRevisao } from "./pages/TvRevisao";
import { Login } from "./pages/Login";
import { TVFrame } from "./components/TVFrame";
import { getUser, pode, primeiraPagina } from "./auth";
import "./styles.css";

// Protege uma página: exige login e a permissão da tela. Sem permissão, manda
// para a primeira página liberada do usuário.
function Protegido({ page, children }: { page?: string; children: React.ReactNode }) {
  const u = getUser();
  if (!u) return <Navigate to="/login" replace />;
  if (page && !pode(u, page)) return <Navigate to={primeiraPagina(u)} replace />;
  return <>{children}</>;
}

function SemAcesso() {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h2>Sem telas liberadas</h2>
      <p className="muted">Seu usuário ainda não tem nenhuma tela liberada. Fale com o administrador.</p>
    </div>
  );
}

// Protetor de tela: após N min sem uso (config por dispositivo em localStorage
// "ssMin", 0 = desligado), entra no Dashboard em modo TV; qualquer atividade volta.
function Screensaver() {
  const [ativo, setAtivo] = useState(false);
  const loc = useLocation();
  const timer = useRef<number | undefined>(undefined);
  const jaTv = loc.pathname.startsWith("/dashboard") || loc.pathname.startsWith("/tv");
  useEffect(() => {
    function reset() {
      setAtivo(false);
      window.clearTimeout(timer.current);
      const min = Number(localStorage.getItem("ssMin") || "0");
      if (min > 0 && !jaTv) timer.current = window.setTimeout(() => setAtivo(true), min * 60000);
    }
    const evs = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"];
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      evs.forEach((e) => window.removeEventListener(e, reset));
      window.clearTimeout(timer.current);
    };
  }, [jaTv]);
  if (!ativo) return null;
  return <div className="ss-overlay"><TVFrame><Dashboard /></TVFrame></div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Screensaver />
      <Routes>
        <Route path="/dashboard" element={<TVFrame><Dashboard /></TVFrame>} />
        <Route path="/tv/tecelagem" element={<TVFrame><TvTecelagem /></TVFrame>} />
        <Route path="/tv/costura" element={<TVFrame><TvCostura /></TVFrame>} />
        <Route path="/tv/revisao" element={<TVFrame><TvRevisao /></TVFrame>} />
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to={primeiraPagina(getUser())} replace />} />
          <Route path="/sem-acesso" element={<SemAcesso />} />
          <Route path="/pedidos" element={<Protegido page="pedidos"><Pedidos /></Protegido>} />
          <Route path="/pedidos/novo" element={<Protegido page="pedidos"><NovoPedido /></Protegido>} />
          <Route path="/pedidos/:id" element={<Protegido page="pedidos"><PedidoDetalhe /></Protegido>} />
          <Route path="/cadastros" element={<Protegido page="cadastros"><Cadastros /></Protegido>} />
          <Route path="/romaneios" element={<Protegido page="romaneios"><Romaneios /></Protegido>} />
          <Route path="/producao" element={<Protegido page="producao"><Producao /></Protegido>} />
          <Route path="/passadoria" element={<Protegido page="passadoria"><Passadoria /></Protegido>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
