import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { setUser, primeiraPagina } from "../auth";
import { Logo } from "../components/Logo";

export function Login() {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const nav = useNavigate();

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const r = await api.login(usuario.trim(), senha);
      if (!r.ok || !("user" in r)) {
        setErro("Usuário ou senha incorretos.");
        setCarregando(false);
        return;
      }
      setUser(r.user);
      nav(primeiraPagina(r.user), { replace: true });
    } catch {
      setErro("Erro ao entrar. Tente de novo.");
      setCarregando(false);
    }
  }

  return (
    <div className="login-bg">
      <form className="login-card" onSubmit={entrar}>
        <div className="login-logo"><Logo h={34} color="#1e293b" /></div>
        <h1>Entrar</h1>
        <p className="muted">Acesse com seu usuário e senha.</p>
        <label>Usuário</label>
        <input autoFocus value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="ex.: maria" />
        <label>Senha</label>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••" />
        {erro && <div className="login-erro">{erro}</div>}
        <button className="btn btn-primary" disabled={carregando}>{carregando ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}
