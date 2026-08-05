// Lojas parceiras + vitrine pública.
//  • /api/parceiros        → CRUD (admin, para cadastrar as lojas no CRM)
//  • /api/parceiros/publico → lista ativa (sem dados sensíveis) usada pela vitrine
//  • vitrineHtml()         → página pública (link /vitrine) que o consumidor final abre:
//    escolhe estado → cidade → vê as lojas com endereço, site, Instagram e WhatsApp clicáveis.
import { Hono } from "hono";
import type { Env } from "../index";

const uid = () => crypto.randomUUID();
const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");

export interface LojaParceiraRow {
  id: string; nome: string; endereco: string | null; cidade: string | null; uf: string | null;
  whatsapp: string | null; instagram: string | null; site: string | null; ativo: number; loja_online?: number; criado_em?: string;
  pendente?: number; cliente_id?: string | null;
}

export const parceiros = new Hono<{ Bindings: Env }>();

// Lista completa (admin) — para a tela de cadastro.
parceiros.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, nome, endereco, cidade, uf, whatsapp, instagram, site, ativo, loja_online, pendente, cliente_id, criado_em FROM lojas_parceiras ORDER BY uf, cidade, nome"
  ).all<LojaParceiraRow>().catch(() => ({ results: [] as LojaParceiraRow[] }));
  return c.json(results);
});

// Lista pública (só lojas aprovadas/ativas). Aceita ?uf= e ?cidade= para o site
// externo consumir por região. CORS liberado em /api/* → dá pra usar de qualquer site.
parceiros.get("/publico", async (c) => {
  const uf = String(c.req.query("uf") ?? "").trim().toUpperCase();
  const cidade = String(c.req.query("cidade") ?? "").trim();
  const cond = ["COALESCE(ativo,1)=1", "COALESCE(pendente,0)=0", "TRIM(COALESCE(uf,'')) <> ''"]; const args: unknown[] = [];
  if (uf) { cond.push("UPPER(COALESCE(uf,''))=?"); args.push(uf); }
  if (cidade) { cond.push("UPPER(COALESCE(cidade,'')) LIKE ?"); args.push("%" + cidade.toUpperCase() + "%"); }
  const { results } = await c.env.DB.prepare(
    `SELECT nome, endereco, cidade, uf, whatsapp, instagram, site FROM lojas_parceiras WHERE ${cond.join(" AND ")} ORDER BY uf, cidade, nome`
  ).bind(...args).all().catch(() => ({ results: [] }));
  return c.json(results);
});

// Cria/atualiza (upsert por id).
parceiros.post("/", async (c) => {
  const b = await c.req.json<Partial<Omit<LojaParceiraRow, "ativo">> & { ativo?: boolean | number }>().catch(() => ({}) as Record<string, never>);
  const nome = String(b.nome ?? "").trim();
  if (!nome) return c.json({ error: "nome é obrigatório" }, 400);
  const uf = String(b.uf ?? "").trim().toUpperCase().slice(0, 2) || null;
  if (!uf) return c.json({ error: "o estado (UF) é obrigatório — sem ele a loja não aparece na vitrine" }, 400);
  const id = b.id || uid();
  const ativo = b.ativo === false || b.ativo === 0 ? 0 : 1;
  await c.env.DB.prepare(
    `INSERT INTO lojas_parceiras (id, nome, endereco, cidade, uf, whatsapp, instagram, site, ativo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, endereco=excluded.endereco, cidade=excluded.cidade,
       uf=excluded.uf, whatsapp=excluded.whatsapp, instagram=excluded.instagram, site=excluded.site, ativo=excluded.ativo`
  ).bind(
    id, nome, String(b.endereco ?? "").trim() || null, String(b.cidade ?? "").trim() || null, uf,
    String(b.whatsapp ?? "").trim() || null, String(b.instagram ?? "").trim() || null, String(b.site ?? "").trim() || null, ativo
  ).run();
  return c.json({ ok: true, id });
});

parceiros.delete("/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM lojas_parceiras WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// Autocadastro público (o próprio lojista preenche pelo link do convite). Entra como
// PENDENTE (ativo=0): só aparece na vitrine depois que a Big Tricot aprova no CRM.
parceiros.post("/autocadastro", async (c) => {
  const b = await c.req.json<Partial<Omit<LojaParceiraRow, "loja_online">> & { loja_online?: boolean | number | string }>().catch(() => ({}) as Record<string, never>);
  const nome = String(b.nome ?? "").trim();
  if (!nome) return c.json({ error: "Informe o nome da loja." }, 400);
  const uf = String(b.uf ?? "").trim().toUpperCase().slice(0, 2) || null;
  if (!uf) return c.json({ error: "Informe o estado (UF) da loja." }, 400);
  const online = b.loja_online === true || b.loja_online === 1 || b.loja_online === "on" || b.loja_online === "true" ? 1 : 0;
  await c.env.DB.prepare(
    `INSERT INTO lojas_parceiras (id, nome, endereco, cidade, uf, whatsapp, instagram, site, loja_online, ativo, pendente)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`
  ).bind(
    uid(), nome, String(b.endereco ?? "").trim() || null, String(b.cidade ?? "").trim() || null, uf,
    String(b.whatsapp ?? "").trim() || null, String(b.instagram ?? "").trim() || null, String(b.site ?? "").trim() || null, online
  ).run();
  return c.json({ ok: true });
});

// ── Lojas parceiras PENDENTES (aguardando aprovação do gestor) ─────────────────────
// Fila de aprovação: clientes da base importados como loja parceira + autocadastros.
parceiros.get("/pendentes", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, nome, endereco, cidade, uf, whatsapp, instagram, site, ativo, loja_online, pendente, cliente_id, criado_em FROM lojas_parceiras WHERE COALESCE(pendente,0)=1 ORDER BY criado_em DESC, nome"
  ).all<LojaParceiraRow>().catch(() => ({ results: [] as LojaParceiraRow[] }));
  return c.json(results);
});

// Importa TODOS os clientes da base que ainda não têm loja parceira vinculada, como PENDENTES.
parceiros.post("/importar-clientes", async (c) => {
  const criados = await importarClientesPendentes(c.env);
  return c.json({ ok: true, criados });
});

// Aprovar EM LOTE: aprova todas as pendentes de uma vez (as sem UF ficam aprovadas, mas só
// aparecem na vitrine quando o estado for preenchido).
parceiros.post("/aprovar-todos", async (c) => {
  const r = await c.env.DB.prepare("UPDATE lojas_parceiras SET pendente=0, ativo=1 WHERE COALESCE(pendente,0)=1").run();
  return c.json({ ok: true, aprovadas: r.meta?.changes ?? 0 });
});

// Aprovar: marca a loja como aprovada (sai da fila e vai pra "Publicadas"). Se ainda estiver
// SEM UF, ela continua fora da vitrine pública até o estado ser preenchido — mas a aprovação
// em si sempre funciona (o gestor só clica "Aprovar").
parceiros.post("/:id/aprovar", async (c) => {
  const id = c.req.param("id");
  const r = await c.env.DB.prepare("UPDATE lojas_parceiras SET pendente=0, ativo=1 WHERE id=?").bind(id).run();
  if (!r.meta?.changes) return c.json({ error: "loja não encontrada" }, 404);
  return c.json({ ok: true });
});

// Recusar: descarta a pendência (apaga a loja parceira criada a partir do cliente).
parceiros.post("/:id/recusar", async (c) => {
  await c.env.DB.prepare("DELETE FROM lojas_parceiras WHERE id=? AND COALESCE(pendente,0)=1").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// Cria uma loja parceira PENDENTE a partir de um cliente da base, se ele ainda não tiver uma.
// Idempotente (não duplica). Usado no gancho de "cliente novo entrou na base".
export async function garantirParceiroPendente(env: Env, clienteId: string): Promise<boolean> {
  if (!clienteId) return false;
  const ja = await env.DB.prepare("SELECT 1 FROM lojas_parceiras WHERE cliente_id=? LIMIT 1").bind(clienteId).first().catch(() => null);
  if (ja) return false;
  const cli = await env.DB.prepare("SELECT id, nome, whatsapp, cidade, uf FROM clientes WHERE id=?")
    .bind(clienteId).first<{ id: string; nome: string | null; whatsapp: string | null; cidade: string | null; uf: string | null }>().catch(() => null);
  if (!cli || !String(cli.nome ?? "").trim()) return false;
  await env.DB.prepare(
    "INSERT INTO lojas_parceiras (id, nome, endereco, cidade, uf, whatsapp, ativo, pendente, cliente_id) VALUES (?, ?, NULL, ?, ?, ?, 0, 1, ?)"
  ).bind(uid(), String(cli.nome).trim(), cli.cidade || null, cli.uf ? String(cli.uf).trim().toUpperCase().slice(0, 2) : null, cli.whatsapp || null, cli.id).run();
  return true;
}

// Importa em massa todos os clientes da base que ainda não têm loja parceira vinculada.
export async function importarClientesPendentes(env: Env): Promise<number> {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.nome, c.whatsapp, c.cidade, c.uf FROM clientes c
      WHERE TRIM(COALESCE(c.nome,'')) <> ''
        AND NOT EXISTS (SELECT 1 FROM lojas_parceiras p WHERE p.cliente_id = c.id)`
  ).all<{ id: string; nome: string; whatsapp: string | null; cidade: string | null; uf: string | null }>().catch(() => ({ results: [] as { id: string; nome: string; whatsapp: string | null; cidade: string | null; uf: string | null }[] }));
  let n = 0;
  for (const cli of (results || [])) {
    await env.DB.prepare(
      "INSERT INTO lojas_parceiras (id, nome, endereco, cidade, uf, whatsapp, ativo, pendente, cliente_id) VALUES (?, ?, NULL, ?, ?, ?, 0, 1, ?)"
    ).bind(uid(), String(cli.nome).trim(), cli.cidade || null, cli.uf ? String(cli.uf).trim().toUpperCase().slice(0, 2) : null, cli.whatsapp || null, cli.id).run();
    n++;
  }
  return n;
}

// ── Vitrine pública (HTML) ───────────────────────────────────────────────────────
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));

// Estilo comum das páginas públicas (vitrine + autocadastro).
const ESTILO_PUBLICO = `* { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; background: #ffffff; color: #111111; }
  header { background: #111111; color: #fff; padding: 22px 18px 18px; text-align: center; }
  header h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: .5px; }
  header p { margin: 0; font-size: 13px; opacity: .85; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 16px 14px 40px; }`;

// Página pública de autocadastro (link do convite): a loja preenche os próprios dados.
export function cadastroHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cadastre sua loja · Big Tricot</title>
<style>
  ${ESTILO_PUBLICO}
  form { display: flex; flex-direction: column; gap: 12px; }
  label { font-size: 12.5px; font-weight: 700; color: #333333; display: flex; flex-direction: column; gap: 4px; }
  input { padding: 11px 12px; border: 1.5px solid #cccccc; border-radius: 10px; font-size: 15px; background: #fff; color: #111; }
  input:focus { outline: none; border-color: #111; }
  .check { flex-direction: row; align-items: center; gap: 9px; color: #111; font-weight: 600; background: #fff; border: 1.5px solid #cccccc; border-radius: 10px; padding: 11px 12px; }
  .check input { width: 20px; height: 20px; padding: 0; margin: 0; flex: none; accent-color: #111; }
  .obg { color: #111; }
  button { margin-top: 6px; padding: 13px; border: 0; border-radius: 12px; background: #111111; color: #fff; font-size: 16px; font-weight: 800; cursor: pointer; }
  button:disabled { opacity: .5; }
  .aviso { font-size: 12.5px; color: #555555; line-height: 1.5; margin: 0 0 8px; }
  .ok { text-align: center; padding: 40px 16px; }
  .ok .big { font-size: 46px; }
  .ok h2 { color: #111; margin: 10px 0 6px; }
  .ok p { color: #444; font-size: 14.5px; }
</style>
</head>
<body>
<header>
  <h1>🧶 Seja uma loja parceira</h1>
  <p>Cadastre sua loja para aparecer pra quem procura nossos produtos na sua região</p>
</header>
<div class="wrap">
  <div id="form-box">
    <p class="aviso">Preencha os dados da sua loja. Depois de conferirmos, ela aparece na nossa vitrine e no nosso site. 🖤 <br>Campos com <span class="obg">*</span> são obrigatórios.</p>
    <form id="f">
      <label>Nome da loja <span class="obg">*</span><input name="nome" required maxlength="120" /></label>
      <label>Endereço<input name="endereco" maxlength="200" placeholder="Rua, número, bairro" /></label>
      <label>Cidade<input name="cidade" maxlength="80" /></label>
      <label>Estado (UF) <span class="obg">*</span><input name="uf" required maxlength="2" placeholder="MG" style="text-transform:uppercase" /></label>
      <label>WhatsApp<input name="whatsapp" maxlength="30" placeholder="(35) 9 9999-9999" /></label>
      <label>Instagram<input name="instagram" maxlength="200" placeholder="@sualoja ou cole o link do perfil" /></label>
      <label>Site (se tiver)<input name="site" maxlength="200" placeholder="www.sualoja.com.br" /></label>
      <label class="check"><input type="checkbox" name="loja_online" id="loja_online" /> Minha loja é <b>online</b> (vende pela internet)</label>
      <button type="submit" id="btn">Enviar cadastro</button>
    </form>
  </div>
  <div class="ok" id="ok" style="display:none">
    <div class="big">✅</div>
    <h2>Cadastro enviado!</h2>
    <p>Obrigada! 🖤 Assim que a Big Tricot conferir os dados, sua loja vai aparecer na vitrine.</p>
  </div>
</div>
<script>
  var f=document.getElementById('f'), btn=document.getElementById('btn');
  f.addEventListener('submit', function(e){
    e.preventDefault(); btn.disabled=true; btn.textContent='Enviando…';
    var d={}; new FormData(f).forEach(function(v,k){ d[k]=String(v).trim(); });
    d.loja_online = document.getElementById('loja_online').checked;
    fetch('/api/parceiros/autocadastro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})
      .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
      .then(function(res){
        if(res.ok){ document.getElementById('form-box').style.display='none'; document.getElementById('ok').style.display='block'; window.scrollTo(0,0); }
        else { alert((res.j&&res.j.error)||'Não consegui enviar. Confira o nome da loja.'); btn.disabled=false; btn.textContent='Enviar cadastro'; }
      })
      .catch(function(){ alert('Sem conexão. Tente de novo.'); btn.disabled=false; btn.textContent='Enviar cadastro'; });
  });
</script>
</body>
</html>`;
}

export async function vitrineHtml(env: Env, uf?: string, cidade?: string): Promise<string> {
  const { results } = await env.DB.prepare(
    "SELECT nome, endereco, cidade, uf, whatsapp, instagram, site FROM lojas_parceiras WHERE COALESCE(ativo,1)=1 AND COALESCE(pendente,0)=0 AND TRIM(COALESCE(uf,'')) <> '' ORDER BY uf, cidade, nome"
  ).all<Omit<LojaParceiraRow, "id" | "ativo" | "criado_em">>().catch(() => ({ results: [] as Omit<LojaParceiraRow, "id" | "ativo" | "criado_em">[] }));
  const dados = JSON.stringify(results).replace(/</g, "\\u003c");
  const ufSel = esc(String(uf ?? "").toUpperCase().slice(0, 2));
  const cidSel = esc(cidade ?? "");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Lojas parceiras · Big Tricot</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; background: #faf7f2; color: #2b2b2b; }
  header { background: linear-gradient(135deg,#b98a5e,#8c6239); color: #fff; padding: 22px 18px 18px; text-align: center; }
  header h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: .5px; }
  header p { margin: 0; font-size: 13px; opacity: .92; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 16px 14px 40px; }
  .filtros { display: flex; gap: 10px; margin-bottom: 16px; }
  .filtros label { flex: 1; font-size: 12px; font-weight: 700; color: #6b5638; display: block; }
  select { width: 100%; margin-top: 4px; padding: 11px 10px; border: 1.5px solid #d9cdbb; border-radius: 10px; background: #fff; font-size: 15px; color: #2b2b2b; }
  .lojas { display: flex; flex-direction: column; gap: 12px; }
  .card { background: #fff; border: 1px solid #ece2d3; border-radius: 14px; padding: 14px 15px; box-shadow: 0 2px 8px #0000000d; }
  .card h2 { margin: 0 0 6px; font-size: 16.5px; color: #6b4a24; }
  .card .end { font-size: 13.5px; color: #555; margin: 0 0 10px; line-height: 1.4; }
  .acoes { display: flex; flex-wrap: wrap; gap: 8px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; font-size: 13.5px; font-weight: 700; padding: 8px 12px; border-radius: 999px; border: 1.5px solid transparent; }
  .wa { background: #25d366; color: #fff; }
  .ig { background: #fff; color: #c13584; border-color: #e6c3d8; }
  .site { background: #fff; color: #6b5638; border-color: #d9cdbb; }
  .maps { background: #fff; color: #3367d6; border-color: #cdd8ef; }
  .vazio { text-align: center; color: #8a7a63; padding: 30px 10px; font-size: 14.5px; line-height: 1.5; }
  footer { text-align: center; font-size: 11.5px; color: #a1937d; padding: 18px; }
</style>
</head>
<body>
<header>
  <h1>🧶 Lojas parceiras Big Tricot</h1>
  <p>Encontre uma loja pertinho de você que revende nossos produtos</p>
</header>
<div class="wrap">
  <div class="filtros">
    <label>Estado<select id="uf"></select></label>
    <label>Cidade<select id="cidade"></select></label>
  </div>
  <div class="lojas" id="lojas"></div>
</div>
<footer>Big Tricot · vendas no atacado para lojistas</footer>
<script>
  var LOJAS = ${dados};
  var PRE_UF = ${JSON.stringify(ufSel)};
  var PRE_CID = ${JSON.stringify(cidSel)};
  var elUf = document.getElementById('uf'), elCid = document.getElementById('cidade'), elLojas = document.getElementById('lojas');
  function norm(s){ return (s||'').toString().trim(); }
  function opt(v,t){ var o=document.createElement('option'); o.value=v; o.textContent=t; return o; }
  function waLink(w){ var d=(w||'').replace(/\\D/g,''); if(!d) return ''; if(d.length<=11) d='55'+d; return 'https://wa.me/'+d; }
  function igLink(i){ i=norm(i); if(!i) return ''; if(/^https?:/i.test(i)) return i; return 'https://instagram.com/'+i.replace(/^@/,''); }
  function siteLink(s){ s=norm(s); if(!s) return ''; return /^https?:/i.test(s)?s:'https://'+s; }
  function mapsLink(l){ var q=[l.nome,l.endereco,l.cidade,l.uf].filter(Boolean).join(', '); return q?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q):''; }
  var ufs = Array.from(new Set(LOJAS.map(function(l){return norm(l.uf).toUpperCase();}).filter(Boolean))).sort();
  elUf.appendChild(opt('','Selecione…'));
  ufs.forEach(function(u){ elUf.appendChild(opt(u,u)); });
  function preencheCidades(){
    var u=elUf.value; elCid.innerHTML='';
    var cids=Array.from(new Set(LOJAS.filter(function(l){return norm(l.uf).toUpperCase()===u;}).map(function(l){return norm(l.cidade);}).filter(Boolean))).sort(function(a,b){return a.localeCompare(b,'pt-BR');});
    elCid.appendChild(opt('', u?'Todas as cidades':'—'));
    cids.forEach(function(c){ elCid.appendChild(opt(c,c)); });
  }
  function texto(el){ return el.textContent; }
  function render(){
    var u=elUf.value, c=elCid.value;
    var lista=LOJAS.filter(function(l){ return (!u||norm(l.uf).toUpperCase()===u) && (!c||norm(l.cidade).toLowerCase()===c.toLowerCase()); });
    if(!u){ elLojas.innerHTML='<div class="vazio">👆 Escolha o seu estado para ver as lojas parceiras.</div>'; return; }
    if(!lista.length){ elLojas.innerHTML='<div class="vazio">Ainda não temos uma loja parceira cadastrada aqui. 🖤<br>Volte em breve!</div>'; return; }
    elLojas.innerHTML='';
    lista.forEach(function(l){
      var card=document.createElement('div'); card.className='card';
      var h=document.createElement('h2'); h.textContent=l.nome||'Loja parceira'; card.appendChild(h);
      var endTxt=[l.endereco, [l.cidade,l.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · ');
      if(endTxt){ var p=document.createElement('p'); p.className='end'; p.textContent='📍 '+endTxt; card.appendChild(p); }
      var ac=document.createElement('div'); ac.className='acoes';
      function add(cls,label,href){ if(!href) return; var a=document.createElement('a'); a.className='btn '+cls; a.href=href; a.target='_blank'; a.rel='noopener'; a.textContent=label; ac.appendChild(a); }
      add('wa','💬 WhatsApp', waLink(l.whatsapp));
      add('ig','📸 Instagram', igLink(l.instagram));
      add('site','🌐 Site', siteLink(l.site));
      add('maps','🗺️ Mapa', mapsLink(l));
      card.appendChild(ac); elLojas.appendChild(card);
    });
  }
  elUf.addEventListener('change', function(){ preencheCidades(); render(); });
  elCid.addEventListener('change', render);
  // Pré-seleção (link que a Big manda já vem com estado). Seleciona o estado mesmo que
  // ainda não haja loja cadastrada nele (aí a vitrine mostra o aviso de "sem loja aqui").
  if(PRE_UF){
    if(ufs.indexOf(PRE_UF)<0) elUf.appendChild(opt(PRE_UF,PRE_UF));
    elUf.value=PRE_UF; preencheCidades();
    if(PRE_CID){ for(var i=0;i<elCid.options.length;i++){ if(elCid.options[i].value.toLowerCase()===PRE_CID.toLowerCase()){ elCid.selectedIndex=i; break; } } }
  } else { preencheCidades(); }
  render();
</script>
</body>
</html>`;
}
