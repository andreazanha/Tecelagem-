import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { setUser, primeiraPagina } from "../auth";
import { Logo } from "../components/Logo";

export function Login() {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  // Primeiro acesso: a pessoa cria a própria senha.
  const [modo, setModo] = useState<"login" | "criar">("login");
  const [nome, setNome] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  // LOGIN POR NOMES: mostra as pessoas do setor DESTE computador (definido no setup).
  const [pessoas, setPessoas] = useState<{ nome: string; usuario: string }[]>([]);
  const [escolhido, setEscolhido] = useState<{ nome: string; usuario: string } | null>(null);
  const [digitando, setDigitando] = useState(false); // "Outro" → volta ao login digitando usuário
  const nav = useNavigate();

  // Ao abrir, lê o setor do computador e busca os nomes daquele setor.
  useEffect(() => {
    let setor = "";
    try { setor = localStorage.getItem("bt_chat_setor") || ""; } catch { /* ok */ }
    if (!setor) return;
    api.usuariosPorSetor(setor).then((d) => { if (Array.isArray(d)) setPessoas(d); }).catch(() => {});
  }, []);

  function escolher(p: { nome: string; usuario: string }) {
    setEscolhido(p); setUsuario(p.usuario); setSenha(""); setErro("");
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      const r = await api.login(usuario.trim(), senha);
      if (r.ok && "user" in r && r.user) {
        setUser(r.user);
        nav(primeiraPagina(r.user), { replace: true });
        return;
      }
      // Primeiro acesso: manda a pessoa criar a senha dela.
      if ("primeiro_acesso" in r && r.primeiro_acesso) {
        setNome(r.nome || "");
        setModo("criar");
        setNovaSenha(""); setConfirma("");
        setCarregando(false);
        return;
      }
      setErro("bloqueado" in r && r.bloqueado ? (r.erro || "Acesso bloqueado.") : "Usuário ou senha incorretos.");
      setCarregando(false);
    } catch {
      setErro("Erro ao entrar. Tente de novo.");
      setCarregando(false);
    }
  }

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (novaSenha.length < 4) return setErro("A senha precisa ter pelo menos 4 caracteres.");
    if (novaSenha !== confirma) return setErro("As senhas não são iguais.");
    setCarregando(true);
    try {
      const r = await api.definirSenha(usuario.trim(), novaSenha);
      if (r.ok && r.user) {
        setUser(r.user);
        nav(primeiraPagina(r.user), { replace: true });
        return;
      }
      setErro(r.erro || "Não foi possível criar a senha.");
      setCarregando(false);
    } catch {
      setErro("Erro ao criar a senha. Tente de novo.");
      setCarregando(false);
    }
  }

  if (modo === "criar") {
    return (
      <div className="login-bg">
        <form className="login-card" onSubmit={criar}>
          <div className="login-logo"><Logo h={34} color="#1e293b" /></div>
          <h1>Criar sua senha</h1>
          <p className="muted">Bem-vindo{nome ? `, ${nome}` : ""}! Este é seu primeiro acesso — crie uma senha só sua.</p>
          <label>Usuário</label>
          <input value={usuario} disabled />
          <label>Nova senha</label>
          <input type="password" autoFocus value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder="mínimo 4 caracteres" />
          <label>Confirmar senha</label>
          <input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} placeholder="repita a senha" />
          {erro && <div className="login-erro">{erro}</div>}
          <button className="btn btn-primary" disabled={carregando}>{carregando ? "Criando…" : "Criar senha e entrar"}</button>
          <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => { setModo("login"); setErro(""); }}>Voltar</button>
        </form>
      </div>
    );
  }

  // Tem lista de nomes do setor e a pessoa ainda não escolheu "digitar"? Mostra os NOMES.
  const mostrarNomes = pessoas.length > 0 && !digitando;

  if (mostrarNomes && !escolhido) {
    return (
      <div className="login-bg">
        <div className="login-card">
          <div className="login-logo"><Logo h={34} color="#1e293b" /></div>
          <h1>Quem é você?</h1>
          <p className="muted">Toque no seu nome para entrar.</p>
          <div className="login-nomes">
            {pessoas.map((p) => (
              <button key={p.usuario} type="button" className="login-nome" onClick={() => escolher(p)}>
                <span className="login-nome-ini">{(p.nome || "?").slice(0, 1).toUpperCase()}</span>
                <span>{p.nome}</span>
              </button>
            ))}
          </div>
          <button type="button" className="login-outro" onClick={() => { setDigitando(true); setUsuario(""); }}>Não está na lista? Entrar digitando o usuário</button>
        </div>
      </div>
    );
  }

  if (mostrarNomes && escolhido) {
    return (
      <div className="login-bg">
        <form className="login-card" onSubmit={entrar}>
          <div className="login-logo"><Logo h={34} color="#1e293b" /></div>
          <h1>Olá, {escolhido.nome.split(" ")[0]}!</h1>
          <p className="muted">Digite a sua senha para entrar.</p>
          <label>Senha</label>
          <input type="password" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••"
            autoCapitalize="none" autoCorrect="off" autoComplete="current-password" spellCheck={false} />
          {erro && <div className="login-erro">{erro}</div>}
          <button className="btn btn-primary" disabled={carregando}>{carregando ? "Entrando…" : "Entrar"}</button>
          <button type="button" className="login-outro" onClick={() => { setEscolhido(null); setUsuario(""); setSenha(""); setErro(""); }}>‹ Não sou eu / escolher outro nome</button>
        </form>
      </div>
    );
  }

  // Login padrão: digitar usuário + senha (PC sem setor definido, ou escolheu "Outro").
  return (
    <div className="login-bg">
      <form className="login-card" onSubmit={entrar}>
        <div className="login-logo"><Logo h={34} color="#1e293b" /></div>
        <h1>Entrar</h1>
        <p className="muted">Acesse com seu usuário e senha.</p>
        <label>Usuário</label>
        <input autoFocus value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="ex.: maria"
          autoCapitalize="none" autoCorrect="off" autoComplete="username" spellCheck={false} />
        <label>Senha</label>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••"
          autoCapitalize="none" autoCorrect="off" autoComplete="current-password" spellCheck={false} />
        {erro && <div className="login-erro">{erro}</div>}
        <button className="btn btn-primary" disabled={carregando}>{carregando ? "Entrando…" : "Entrar"}</button>
        {pessoas.length > 0 && <button type="button" className="login-outro" onClick={() => { setDigitando(false); setEscolhido(null); setErro(""); }}>‹ Ver os nomes do setor</button>}
        <p className="muted" style={{ fontSize: 12, marginTop: 12, textAlign: "center" }}>Primeiro acesso? Digite seu usuário e clique em Entrar — o sistema pede para você criar a senha.</p>
      </form>
    </div>
  );
}
