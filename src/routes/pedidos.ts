import { Hono } from "hono";
import { extractText, getDocumentProxy } from "unpdf";
import type { Env } from "../index";
import { parsePedido } from "../parser";
import {
  classificar,
  criarCatalogo,
  ehKit,
  agrupar,
  romaneioTassel,
  type ItemBase,
  type Catalogo,
} from "../classificar";
import { gerarPdfParte, mergePdfs, gerarRomaneioTassel, type PedidoInfo } from "../pdf";

export const pedidos = new Hono<{ Bindings: Env }>();

function br(iso?: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
async function catalogos(env: Env): Promise<Catalogo> {
  // Os 12 modelos base da Parte 1 entram sempre; o catálogo do banco (tela de Cadastros)
  // sobrescreve parte/composição/código. O código (ref) permite casar o modelo pela grade.
  const m = await env.DB.prepare(
    "SELECT nome, parte, composicao, ref, tassel_peseira, tassel_almofada FROM modelos"
  ).all<{
    nome: string;
    parte: number;
    composicao: string | null;
    ref: string | null;
    tassel_peseira: number | null;
    tassel_almofada: number | null;
  }>();
  return criarCatalogo(m.results);
}

// Tabela de valores de tassel → `${COR}|${TAM}` -> valor (mão de obra por tassel).
async function tabelaTassel(env: Env): Promise<Record<string, number>> {
  const { results } = await env.DB.prepare("SELECT cor, tamanho, valor FROM tasseis").all<{
    cor: string;
    tamanho: string;
    valor: number;
  }>();
  const m: Record<string, number> = {};
  for (const r of results) m[`${(r.cor || "").trim().toUpperCase()}|${(r.tamanho || "").trim().toUpperCase()}`] = Number(r.valor) || 0;
  return m;
}

// Cores cadastradas → mapa NOME(maiúsculo) -> { hex, foto } para a bolinha de cor do PDF.
// Só busca a foto (R2) das cores realmente usadas no pedido.
async function coresParaPdf(
  env: Env,
  usadas: Set<string>
): Promise<Record<string, { hex?: string; foto?: Uint8Array }>> {
  const { results } = await env.DB.prepare(
    "SELECT nome, hex, foto_key FROM cores"
  ).all<{ nome: string; hex: string | null; foto_key: string | null }>();
  const m: Record<string, { hex?: string; foto?: Uint8Array }> = {};
  for (const r of results) {
    const key = (r.nome || "").trim().toUpperCase();
    if (!usadas.has(key)) continue;
    const entry: { hex?: string; foto?: Uint8Array } = {};
    if (r.hex) entry.hex = r.hex;
    if (r.foto_key) {
      const obj = await env.BUCKET.get(r.foto_key);
      if (obj) entry.foto = new Uint8Array(await obj.arrayBuffer());
    }
    if (entry.hex || entry.foto) m[key] = entry;
  }
  return m;
}
function coresUsadas(itens: { cor_grade?: string | null }[]): Set<string> {
  return new Set(itens.map((i) => (i.cor_grade || "").trim().toUpperCase()).filter(Boolean));
}

type Job = { tipo: string; label: string; banda: "gold" | "green"; sub: string; blocos: ReturnType<typeof classificar>["kits"] };
// Jobs das PARTES (1/2/Única). A Pronta Entrega (kit) é montada à parte (buildPEJobs),
// pois pode ser dividida em JUNTO/SEPARADO por pedido.
function montarJobs(cl: ReturnType<typeof classificar>): Job[] {
  const jobs: Job[] = [];
  const subProd = "Produção / Tecelagem";
  if (cl.modo === "unica") {
    jobs.push({ tipo: "parte-unica", label: "PARTE ÚNICA", banda: "gold", sub: subProd, blocos: cl.parteUnica! });
  } else {
    jobs.push({ tipo: "parte-1", label: "PARTE 1", banda: "gold", sub: subProd, blocos: cl.parte1! });
    jobs.push({ tipo: "parte-2", label: "PARTE 2", banda: "gold", sub: subProd, blocos: cl.parte2! });
  }
  // não gera PDF de uma parte vazia (ex.: só Parte 1 → não cria Parte 2 em branco)
  return jobs.filter((j) => j.blocos.length > 0);
}

const origemDe = (it: ItemBase, baseNum: string) => (it.origem || "").trim() || baseNum;

// Pronta Entrega dividida por pedido: gera PDF de JUNTO e/ou de SEPARADO conforme a escolha
// de cada pedido (entregas[numero] = 'junto'|'separado'); o resto usa o padrão.
function buildPEJobs(
  kitItens: ItemBase[],
  entregas: Record<string, string>,
  defOpt: "junto" | "separado",
  cat: Catalogo,
  baseNum: string
): Job[] {
  if (kitItens.length === 0) return [];
  const opt = (it: ItemBase) => (entregas[origemDe(it, baseNum)] ?? defOpt) === "separado" ? "separado" : "junto";
  const sep = kitItens.filter((it) => opt(it) === "separado");
  const jun = kitItens.filter((it) => opt(it) === "junto");
  const peds = (arr: ItemBase[]) => [...new Set(arr.map((it) => origemDe(it, baseNum)))].join(", ");
  const jobs: Job[] = [];
  if (jun.length)
    jobs.push({
      tipo: "pronta-entrega",
      label: "PRONTA ENTREGA",
      banda: "green",
      sub: `Pronta Entrega · Entregar JUNTO com o pedido — ${peds(jun)}`,
      blocos: agrupar(jun, cat),
    });
  if (sep.length)
    jobs.push({
      tipo: "pronta-entrega-sep",
      label: "PRONTA ENTREGA",
      banda: "green",
      sub: `Pronta Entrega · Entregar SEPARADO (antecipado) — ${peds(sep)}`,
      blocos: agrupar(sep, cat),
    });
  return jobs.filter((j) => j.blocos.length > 0);
}

// IMPORTAR PDF → extrai texto (PDF digital) ou OCR (Workers AI) → devolve sugestão
// NÃO cria o pedido: o usuário confere/corrige no formulário e salva.
pedidos.post("/importar", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "arquivo ausente" }, 400);

  const buf = new Uint8Array(await file.arrayBuffer());
  let texto = "";
  let metodo: "texto" | "ocr" | "nenhum" = "nenhum";

  // 1) PDF digital: extração de texto
  try {
    const pdf = await getDocumentProxy(buf);
    const r = await extractText(pdf, { mergePages: true });
    texto = (Array.isArray(r.text) ? r.text.join("\n") : r.text || "").trim();
    if (texto.length >= 20) metodo = "texto";
  } catch {
    /* segue para OCR */
  }

  // 2) PDF escaneado: OCR via Workers AI (toMarkdown)
  if (texto.length < 20 && (c.env.AI as unknown as { toMarkdown?: unknown })?.toMarkdown) {
    try {
      const res: any = await (c.env.AI as any).toMarkdown([
        {
          name: file.name || "pedido.pdf",
          blob: new Blob([buf], { type: file.type || "application/pdf" }),
        },
      ]);
      const md = Array.isArray(res) ? res[0]?.data : res?.data;
      if (md) {
        texto = String(md).trim();
        metodo = "ocr";
      }
    } catch {
      /* mantém vazio */
    }
  }

  const sugestao = parsePedido(texto);
  return c.json({ ...sugestao, metodo });
});

// PRÉVIA do PDF de produção SEM criar o pedido: gera todas as partes e junta num único
// arquivo (várias páginas) para visualizar antes de salvar.
pedidos.post("/previa", async (c) => {
  type PreviaIn = PedidoIn & { kit?: string; entregas?: Record<string, string> };
  const b = await c.req.json<PreviaIn>().catch(() => ({}) as PreviaIn);
  const itens: ItemBase[] = (b.itens || [])
    .filter((it) => (it.produto || "").trim())
    .map((it) => ({
      produto: (it.produto || "").trim(),
      ref: it.ref || null,
      cor_grade: it.cor_grade || null,
      tamanho: it.tamanho || null,
      qtd: Math.max(0, Math.trunc(Number(it.qtd) || 0)),
      parte: it.parte || "unico",
      origem: it.origem || null,
    }));
  if (itens.length === 0) return c.json({ error: "adicione ao menos um item para visualizar" }, 400);

  const modelos = await catalogos(c.env);
  const cl = classificar(itens, modelos);
  const kitOpt = b.kit === "separado" ? "separado" : "junto";
  const baseNum = (b.numero_erp || "").trim() || "PRÉVIA";
  const info: PedidoInfo = {
    cliente: (b.cliente_nome || "—").trim() || "—",
    representante: (b.vendedor || "—").trim() || "—",
    numero: baseNum,
    emissao: br(b.data_pedido || null),
    entrega: br(b.data_entrega || null),
    observacao: b.observacao || "",
  };

  const cores = await coresParaPdf(c.env, coresUsadas(itens));
  const jobs = [
    ...montarJobs(cl),
    ...buildPEJobs(itens.filter(ehKit), b.entregas || {}, kitOpt, modelos, baseNum),
  ];
  const partes: Uint8Array[] = [];
  for (const job of jobs) {
    const codigo = codigoParte(baseNum, TIPOS_PDF[job.tipo]?.suf ?? "");
    partes.push(await gerarPdfParte(job.label, job.sub, job.banda, { ...info, numero: codigo }, job.blocos, cores));
  }
  const pdf = await mergePdfs(partes);
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="previa-${baseNum}.pdf"`,
    },
  });
});

const TIPOS = ["unico", "unico_pe", "p1p2", "p1p2_pe", "estoque", "pronta_entrega"];
const PARTES = ["unico", "p1", "p2", "kit", "pe", "estoque"];

interface ItemIn {
  produto?: string;
  ref?: string;
  cor_grade?: string;
  tamanho?: string;
  qtd?: number | string;
  parte?: string;
  origem?: string;
}
interface PedidoIn {
  numero_erp?: string;
  cliente_nome?: string;
  vendedor?: string;
  codigo_terceiro?: string;
  tipo?: string;
  entrega_pe?: string | null;
  data_pedido?: string;
  data_entrega?: string;
  observacao?: string;
  itens?: ItemIn[];
}

// Backfill: pedidos consolidados (vários números) sem código pai ganham um agora.
async function garantirCodigoPai(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT id FROM pedidos WHERE codigo_pai IS NULL AND numero_erp LIKE '%,%' ORDER BY created_at, rowid"
  ).all<{ id: string }>();
  for (const r of results) {
    await env.DB.prepare("UPDATE contadores SET valor = valor + 1 WHERE nome = 'codigo_pai'").run();
    const seq = await env.DB.prepare("SELECT valor FROM contadores WHERE nome = 'codigo_pai'").first<{ valor: number }>();
    await env.DB.prepare("UPDATE pedidos SET codigo_pai = ? WHERE id = ?")
      .bind("OP-" + (seq?.valor ?? Date.now()), r.id)
      .run();
  }
}

// LISTA
pedidos.get("/", async (c) => {
  await garantirCodigoPai(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT p.*,
            (SELECT COUNT(*)             FROM pedido_itens i WHERE i.pedido_id = p.id) AS itens,
            (SELECT COALESCE(SUM(qtd),0) FROM pedido_itens i WHERE i.pedido_id = p.id) AS pecas
       FROM pedidos p
   ORDER BY p.created_at DESC`
  ).all();
  return c.json(results);
});

// DETALHE
// Atualiza o código de terceiro (código interno do cliente) do pedido.
pedidos.post("/:id/codigo-terceiro", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json<{ codigo?: string }>().catch(() => ({}) as { codigo?: string });
  const codigo = (b.codigo || "").trim() || null;
  await c.env.DB.prepare("UPDATE pedidos SET codigo_terceiro = ? WHERE id = ?").bind(codigo, id).run();
  return c.json({ ok: true, codigo_terceiro: codigo });
});

pedidos.get("/:id", async (c) => {
  const id = c.req.param("id");
  const pedido = await c.env.DB.prepare("SELECT * FROM pedidos WHERE id = ?")
    .bind(id)
    .first();
  if (!pedido) return c.json({ error: "pedido não encontrado" }, 404);
  const { results: itens } = await c.env.DB.prepare(
    "SELECT * FROM pedido_itens WHERE pedido_id = ? ORDER BY rowid"
  )
    .bind(id)
    .all();
  return c.json({ ...pedido, itens });
});

// CRIA
pedidos.post("/", async (c) => {
  const b = await c.req.json<PedidoIn>();
  const cliente_nome = (b.cliente_nome || "").trim();
  // A classificação (Parte 1/2/Única + Pronta Entrega) é automática na geração dos PDFs,
  // pelo catálogo de modelos/cores — não há mais "tipo" manual no formulário.
  const tipoIn = (b.tipo || "auto").trim();
  const tipo = TIPOS.includes(tipoIn) ? tipoIn : "auto";

  if (!cliente_nome) return c.json({ error: "cliente é obrigatório" }, 400);

  // a entrega da Pronta Entrega (junto/separado) é decidida na geração dos PDFs (se houver kit)
  const entrega_pe = null;

  const id = crypto.randomUUID();
  const stmts: D1PreparedStatement[] = [];

  // Vários pedidos juntos (numero_erp tipo "3772, 3768, 3756") ganham um CÓDIGO PAI
  // para facilitar a busca; pedido único mantém o código original.
  const nums = (b.numero_erp || "").split(",").map((x) => x.trim()).filter(Boolean);
  let codigo_pai: string | null = null;
  if (nums.length >= 2) {
    await c.env.DB.prepare("UPDATE contadores SET valor = valor + 1 WHERE nome = 'codigo_pai'").run();
    const seq = await c.env.DB.prepare("SELECT valor FROM contadores WHERE nome = 'codigo_pai'").first<{ valor: number }>();
    codigo_pai = "OP-" + (seq?.valor ?? Date.now());
  }

  stmts.push(
    c.env.DB.prepare(
      `INSERT INTO pedidos
        (id, numero_erp, cliente_nome, vendedor, codigo_terceiro, codigo_pai, tipo, entrega_pe, data_pedido, data_entrega, observacao, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo')`
    ).bind(
      id,
      b.numero_erp || null,
      cliente_nome,
      b.vendedor || null,
      (b.codigo_terceiro || "").trim() || null,
      codigo_pai,
      tipo,
      entrega_pe,
      b.data_pedido || null,
      b.data_entrega || null,
      b.observacao || null
    )
  );

  // garante o cliente no catálogo
  stmts.push(
    c.env.DB.prepare(
      "INSERT INTO clientes (id, nome) VALUES (?, ?) ON CONFLICT(nome) DO NOTHING"
    ).bind(crypto.randomUUID(), cliente_nome)
  );

  for (const it of b.itens || []) {
    const produto = (it.produto || "").trim();
    if (!produto) continue;
    const parte = PARTES.includes(it.parte || "") ? (it.parte as string) : "unico";
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, tamanho, qtd, parte, origem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        id,
        produto,
        it.ref || null,
        it.cor_grade || null,
        it.tamanho || null,
        Math.max(0, Math.trunc(Number(it.qtd) || 0)),
        parte,
        it.origem || null
      )
    );
  }

  await c.env.DB.batch(stmts);
  return c.json({ id, codigo_pai }, 201);
});

// UPLOAD dos PDFs originais (um ou vários — preserva todos no R2 sob orig/)
pedidos.post("/:id/pdf", async (c) => {
  const id = c.req.param("id");
  const exists = await c.env.DB.prepare("SELECT id FROM pedidos WHERE id = ?")
    .bind(id)
    .first();
  if (!exists) return c.json({ error: "pedido não encontrado" }, 404);

  const body = await c.req.parseBody({ all: true });
  const raw = body["file"];
  const files = (Array.isArray(raw) ? raw : [raw]).filter((f): f is File => f instanceof File);
  if (files.length === 0) return c.json({ error: "arquivo ausente" }, 400);

  const keys: string[] = [];
  for (const file of files) {
    const key = `pedidos/${id}/orig/${file.name}`;
    await c.env.BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/pdf" },
    });
    keys.push(key);
  }
  // pdf_key guarda o primeiro (compatibilidade); a lista completa vem de GET /originais
  await c.env.DB.prepare("UPDATE pedidos SET pdf_key = ? WHERE id = ?").bind(keys[0], id).run();
  return c.json({ ok: true, total: files.length });
});

// LISTA os PDFs originais anexados (vários, na OP consolidada de vários pedidos)
pedidos.get("/:id/originais", async (c) => {
  const id = c.req.param("id");
  const list = await c.env.BUCKET.list({ prefix: `pedidos/${id}/orig/` });
  const arquivos = list.objects.map((o) => {
    const nome = o.key.split("/").pop() || "arquivo.pdf";
    return { nome, url: `/api/pedidos/${id}/original/${encodeURIComponent(nome)}` };
  });
  return c.json({ arquivos });
});

// DOWNLOAD de um PDF original específico
pedidos.get("/:id/original/:nome", async (c) => {
  const id = c.req.param("id");
  const nome = decodeURIComponent(c.req.param("nome"));
  const obj = await c.env.BUCKET.get(`pedidos/${id}/orig/${nome}`);
  if (!obj) return c.json({ error: "arquivo não encontrado" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"`,
    },
  });
});

// CLASSIFICAR — diz como o pedido será dividido (e se tem kit → perguntar junto/separado)
pedidos.get("/:id/classificar", async (c) => {
  const id = c.req.param("id");
  const ped = await c.env.DB.prepare("SELECT id FROM pedidos WHERE id = ?").bind(id).first();
  if (!ped) return c.json({ error: "pedido não encontrado" }, 404);
  const { results } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade, tamanho, qtd, parte FROM pedido_itens WHERE pedido_id = ?"
  )
    .bind(id)
    .all<ItemBase>();
  const modelos = await catalogos(c.env);
  const cl = classificar(results, modelos);
  const soma = (b?: { total: number }[]) => (b || []).reduce((a, x) => a + x.total, 0);
  return c.json({
    modo: cl.modo,
    temKit: cl.temKit,
    contagem: {
      parteUnica: soma(cl.parteUnica),
      parte1: soma(cl.parte1),
      parte2: soma(cl.parte2),
      kits: soma(cl.kits),
    },
  });
});

// PEDIDOS QUE TÊM KIT — para perguntar junto/separado por pedido (OP que junta vários).
pedidos.get("/:id/kits-pedidos", async (c) => {
  const id = c.req.param("id");
  const ped = await c.env.DB.prepare("SELECT numero_erp, codigo_pai FROM pedidos WHERE id = ?")
    .bind(id)
    .first<{ numero_erp: string | null; codigo_pai: string | null }>();
  if (!ped) return c.json({ error: "pedido não encontrado" }, 404);
  const baseNum = ped.codigo_pai || ped.numero_erp || id.slice(0, 8);
  const { results } = await c.env.DB.prepare(
    "SELECT produto, origem, qtd FROM pedido_itens WHERE pedido_id = ?"
  )
    .bind(id)
    .all<{ produto: string; origem: string | null; qtd: number }>();
  const map = new Map<string, number>();
  for (const it of results) {
    if (!ehKit({ produto: it.produto, qtd: it.qtd })) continue;
    const o = (it.origem || "").trim() || baseNum;
    map.set(o, (map.get(o) || 0) + Number(it.qtd || 0));
  }
  return c.json({ pedidos: [...map.entries()].map(([numero, pecas]) => ({ numero, pecas })) });
});

// ROMANEIO DE TASSEL — pré-pronto; a pessoa só escolhe o prestador. Soma tudo automaticamente.
pedidos.post("/:id/romaneio-tassel", async (c) => {
  const id = c.req.param("id");
  const ped = await c.env.DB.prepare("SELECT * FROM pedidos WHERE id = ?")
    .bind(id)
    .first<Record<string, string>>();
  if (!ped) return c.json({ error: "pedido não encontrado" }, 404);
  const body = await c.req.json<{ prestador?: string }>().catch(() => ({}) as { prestador?: string });
  const prestador = (body.prestador || "").trim();

  const { results: itens } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade, tamanho, qtd, parte, origem FROM pedido_itens WHERE pedido_id = ?"
  )
    .bind(id)
    .all<ItemBase>();
  const modelos = await catalogos(c.env);
  const valores = await tabelaTassel(c.env);
  const rom = romaneioTassel(itens, modelos, valores);
  if (rom.linhas.length === 0)
    return c.json(
      { error: "Nenhum tassel a confeccionar. Configure o Tassel/peça nos Modelos e tenha itens de peseira/almofada." },
      400
    );

  const baseNum = ped.codigo_pai || ped.numero_erp || id.slice(0, 8);
  const info: PedidoInfo = {
    cliente: ped.cliente_nome,
    representante: ped.vendedor || "—",
    numero: baseNum,
    emissao: br(ped.data_pedido),
    entrega: br(ped.data_entrega),
  };
  const bytes = await gerarRomaneioTassel(info, prestador, rom);
  await c.env.BUCKET.put(`pedidos/${id}/romaneio-tassel.pdf`, bytes, {
    httpMetadata: { contentType: "application/pdf" },
  });
  return c.json({
    ok: true,
    url: `/api/pedidos/${id}/pdf/romaneio-tassel`,
    totalTasseis: rom.totalTasseis,
    totalValor: rom.totalValor,
  });
});

// GERAR PDFs — classifica e gera os PDFs (Parte Única OU Parte 1/2) + Pronta Entrega (kits)
pedidos.post("/:id/gerar-pdfs", async (c) => {
  const id = c.req.param("id");
  const ped = await c.env.DB.prepare("SELECT * FROM pedidos WHERE id = ?")
    .bind(id)
    .first<Record<string, string>>();
  if (!ped) return c.json({ error: "pedido não encontrado" }, 404);
  const body = await c.req
    .json<{ kit?: string; entregas?: Record<string, string> }>()
    .catch(() => ({}) as { kit?: string; entregas?: Record<string, string> });
  const kitOpt = body.kit === "separado" ? "separado" : "junto";
  const entregas = body.entregas || {};

  const { results: itens } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade, tamanho, qtd, parte, origem FROM pedido_itens WHERE pedido_id = ?"
  )
    .bind(id)
    .all<ItemBase>();
  const modelos = await catalogos(c.env);
  const cl = classificar(itens, modelos);

  const baseNum = ped.codigo_pai || ped.numero_erp || id.slice(0, 8);
  const info: PedidoInfo = {
    cliente: ped.cliente_nome,
    representante: ped.vendedor || "—",
    numero: baseNum,
    pedidos: ped.codigo_pai ? ped.numero_erp || "" : "",
    emissao: br(ped.data_pedido),
    entrega: br(ped.data_entrega),
    observacao: ped.observacao || "",
  };

  const cores = await coresParaPdf(c.env, coresUsadas(itens));
  const peJobs = buildPEJobs(itens.filter(ehKit), entregas, kitOpt, modelos, baseNum);
  const jobs = [...montarJobs(cl), ...peJobs];

  // limpa PDFs de PE antigos (pode ter mudado a divisão junto/separado)
  for (const t of ["pronta-entrega", "pronta-entrega-sep"]) {
    await c.env.BUCKET.delete(`pedidos/${id}/${t}.pdf`);
  }

  const arquivos: { tipo: string; label: string; url: string }[] = [];
  for (const job of jobs) {
    const codigo = codigoParte(baseNum, TIPOS_PDF[job.tipo]?.suf ?? "");
    const bytes = await gerarPdfParte(job.label, job.sub, job.banda, { ...info, numero: codigo }, job.blocos, cores);
    const key = `pedidos/${id}/${job.tipo}.pdf`;
    await c.env.BUCKET.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } });
    arquivos.push({ tipo: job.tipo, label: `${codigo} · ${job.label}`, url: `/api/pedidos/${id}/pdf/${job.tipo}` });
  }
  const temSep = peJobs.some((j) => j.tipo === "pronta-entrega-sep");
  const temJun = peJobs.some((j) => j.tipo === "pronta-entrega");
  const entregaResumo = !peJobs.length ? null : temSep && temJun ? "misto" : temSep ? "separado" : "junto";
  await c.env.DB.prepare("UPDATE pedidos SET status = 'conferido', entrega_pe = ? WHERE id = ?")
    .bind(entregaResumo, id)
    .run();

  // cria/atualiza os cards de TECELAGUEM (uma parte por OP); preserva o status de produção.
  const partesProd: { parte: string; blocos: ReturnType<typeof classificar>["kits"] }[] = [];
  if (cl.modo === "unica") partesProd.push({ parte: "parte-unica", blocos: cl.parteUnica! });
  else {
    partesProd.push({ parte: "parte-1", blocos: cl.parte1! });
    partesProd.push({ parte: "parte-2", blocos: cl.parte2! });
  }
  if (cl.temKit) partesProd.push({ parte: "pronta-entrega", blocos: cl.kits });
  for (const p of partesProd) {
    if (!p.blocos.length) continue;
    const pecas = p.blocos.reduce((s, b) => s + b.total, 0);
    const resumo = `${p.blocos.length} modelo(s)`;
    await c.env.DB.prepare(
      `INSERT INTO producao (pedido_id, parte, pecas, resumo) VALUES (?, ?, ?, ?)
       ON CONFLICT(pedido_id, parte) DO UPDATE SET pecas = excluded.pecas, resumo = excluded.resumo`
    )
      .bind(id, p.parte, pecas, resumo)
      .run();
  }

  return c.json({ modo: cl.modo, temKit: cl.temKit, arquivos });
});

// LISTA os PDFs de produção já gerados (persistente: lê do R2). Assim a tela do pedido
// mostra os botões "Visualizar PDF" mesmo depois de recarregar.
const TIPOS_PDF: Record<string, { nome: string; suf: string }> = {
  "parte-unica": { nome: "PARTE ÚNICA", suf: "" },
  "parte-1": { nome: "PARTE 1", suf: "-P1" },
  "parte-2": { nome: "PARTE 2", suf: "-P2" },
  "pronta-entrega": { nome: "PRONTA ENTREGA (JUNTO)", suf: "-PE" },
  "pronta-entrega-sep": { nome: "PRONTA ENTREGA (SEPARADO)", suf: "-PE-SEP" },
};
const ORDEM_PDF = ["parte-unica", "parte-1", "parte-2", "pronta-entrega", "pronta-entrega-sep"];
// Código da parte: número único → "2030-P1"; vários números → "2030, 2031 (P1)".
function codigoParte(baseNum: string, suf: string): string {
  if (!suf) return baseNum;
  return baseNum.includes(",") ? `${baseNum} (${suf.replace("-", "")})` : `${baseNum}${suf}`;
}
pedidos.get("/:id/pdfs", async (c) => {
  const id = c.req.param("id");
  const ped = await c.env.DB.prepare("SELECT numero_erp, codigo_pai FROM pedidos WHERE id = ?")
    .bind(id)
    .first<{ numero_erp: string | null; codigo_pai: string | null }>();
  const baseNum = ped?.codigo_pai || ped?.numero_erp || id.slice(0, 8);
  const list = await c.env.BUCKET.list({ prefix: `pedidos/${id}/` });
  const tipos = new Set(
    list.objects
      .map((o) => o.key.split("/").pop() || "")
      .filter((f) => f.endsWith(".pdf"))
      .map((f) => f.slice(0, -4))
      .filter((t) => t in TIPOS_PDF)
  );
  const arquivos = ORDEM_PDF.filter((t) => tipos.has(t)).map((tipo) => {
    const codigo = codigoParte(baseNum, TIPOS_PDF[tipo].suf);
    return {
      tipo,
      codigo,
      label: `${codigo} · ${TIPOS_PDF[tipo].nome}`,
      url: `/api/pedidos/${id}/pdf/${tipo}`,
    };
  });
  return c.json({ arquivos });
});

// DOWNLOAD de um PDF gerado (parte-unica | parte-1 | parte-2 | pronta-entrega)
pedidos.get("/:id/pdf/:tipo", async (c) => {
  const id = c.req.param("id");
  const tipo = c.req.param("tipo");
  const obj = await c.env.BUCKET.get(`pedidos/${id}/${tipo}.pdf`);
  if (!obj) return c.json({ error: "PDF não gerado" }, 404);
  const ped = await c.env.DB.prepare("SELECT numero_erp, codigo_pai FROM pedidos WHERE id = ?")
    .bind(id)
    .first<{ numero_erp: string | null; codigo_pai: string | null }>();
  const baseNum = ped?.codigo_pai || ped?.numero_erp || id.slice(0, 8);
  const nome = codigoParte(baseNum, TIPOS_PDF[tipo]?.suf ?? "");
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}.pdf"`,
    },
  });
});

// DOWNLOAD do PDF original
pedidos.get("/:id/pdf", async (c) => {
  const id = c.req.param("id");
  const row = await c.env.DB.prepare("SELECT pdf_key FROM pedidos WHERE id = ?")
    .bind(id)
    .first<{ pdf_key: string | null }>();
  if (!row?.pdf_key) return c.json({ error: "sem PDF" }, 404);
  const obj = await c.env.BUCKET.get(row.pdf_key);
  if (!obj) return c.json({ error: "arquivo não encontrado" }, 404);
  return new Response(obj.body, {
    headers: { "Content-Type": obj.httpMetadata?.contentType || "application/pdf" },
  });
});
