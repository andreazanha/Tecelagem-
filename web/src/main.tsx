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
import "./styles.css";

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
  return <div className="ss-overlay"><Dashboard /></div>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Screensaver />
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/tv/tecelagem" element={<TvTecelagem />} />
        <Route path="/tv/costura" element={<TvCostura />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/pedidos" replace />} />
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/pedidos/novo" element={<NovoPedido />} />
          <Route path="/pedidos/:id" element={<PedidoDetalhe />} />
          <Route path="/cadastros" element={<Cadastros />} />
          <Route path="/romaneios" element={<Romaneios />} />
          <Route path="/producao" element={<Producao />} />
          <Route path="/passadoria" element={<Passadoria />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
