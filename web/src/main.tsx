import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Pedidos } from "./pages/Pedidos";
import { NovoPedido } from "./pages/NovoPedido";
import { PedidoDetalhe } from "./pages/PedidoDetalhe";
import { Cadastros } from "./pages/Cadastros";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/pedidos" replace />} />
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/pedidos/novo" element={<NovoPedido />} />
          <Route path="/pedidos/:id" element={<PedidoDetalhe />} />
          <Route path="/cadastros" element={<Cadastros />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
