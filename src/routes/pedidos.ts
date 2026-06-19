import { Hono } from "hono";
import { extractText, getDocumentProxy } from "unpdf";
import type { Env } from "../index";
import { parsePedido } from "../parser";
import { classificar, criarCatalogo, type ItemBase, type Catalogo } from "../classificar";
import { gerarPdfParte, type PedidoInfo } from "../pdf";

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
    "SELECT nome, parte, composicao, ref FROM modelos"
  ).all<{ nome: string; parte: number; composicao: string | null; ref: string | null }>();
  return criarCatalogo(m.results);
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

const TIPOS = ["unico", "unico_pe", "p1p2", "p1p2_pe", "estoque", "pronta_entrega"];
const PARTES = ["unico", "p1", "p2", "kit", "pe", "estoque"];

interface ItemIn {
  produto?: string;
  ref?: string;
  cor_grade?: string;
  tamanho?: string;
  qtd?: number | string;
  parte?: string;
}
interface PedidoIn {
  numero_erp?: string;
  cliente_nome?: string;
  vendedor?: string;
  tipo?: string;
  entrega_pe?: string | null;
  data_pedido?: string;
  data_entrega?: string;
  observacao?: string;
  itens?: ItemIn[];
}

// LISTA
pedidos.get("/", async (c) => {
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

  stmts.push(
    c.env.DB.prepare(
      `INSERT INTO pedidos
        (id, numero_erp, cliente_nome, vendedor, tipo, entrega_pe, data_pedido, data_entrega, observacao, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo')`
    ).bind(
      id,
      b.numero_erp || null,
      cliente_nome,
      b.vendedor || null,
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
        `INSERT INTO pedido_itens (id, pedido_id, produto, ref, cor_grade, tamanho, qtd, parte)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        id,
        produto,
        it.ref || null,
        it.cor_grade || null,
        it.tamanho || null,
        Math.max(0, Math.trunc(Number(it.qtd) || 0)),
        parte
      )
    );
  }

  await c.env.DB.batch(stmts);
  return c.json({ id }, 201);
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

// GERAR PDFs — classifica e gera os PDFs (Parte Única OU Parte 1/2) + Pronta Entrega (kits)
pedidos.post("/:id/gerar-pdfs", async (c) => {
  const id = c.req.param("id");
  const ped = await c.env.DB.prepare("SELECT * FROM pedidos WHERE id = ?")
    .bind(id)
    .first<Record<string, string>>();
  if (!ped) return c.json({ error: "pedido não encontrado" }, 404);
  const body = await c.req.json<{ kit?: string }>().catch(() => ({}) as { kit?: string });
  const kitOpt = body.kit === "separado" ? "separado" : "junto";

  const { results: itens } = await c.env.DB.prepare(
    "SELECT produto, ref, cor_grade, tamanho, qtd, parte FROM pedido_itens WHERE pedido_id = ?"
  )
    .bind(id)
    .all<ItemBase>();
  const modelos = await catalogos(c.env);
  const cl = classificar(itens, modelos);

  const baseNum = ped.numero_erp || id.slice(0, 8);
  const info: PedidoInfo = {
    cliente: ped.cliente_nome,
    representante: ped.vendedor || "—",
    numero: baseNum,
    emissao: br(ped.data_pedido),
    entrega: br(ped.data_entrega),
    observacao: ped.observacao || "",
  };

  const jobs: { tipo: string; label: string; banda: "gold" | "green"; sub: string; blocos: any[] }[] = [];
  const subProd = "Produção / Tecelagem";
  if (cl.modo === "unica") {
    jobs.push({ tipo: "parte-unica", label: "PARTE ÚNICA", banda: "gold", sub: subProd, blocos: cl.parteUnica! });
  } else {
    jobs.push({ tipo: "parte-1", label: "PARTE 1", banda: "gold", sub: subProd, blocos: cl.parte1! });
    jobs.push({ tipo: "parte-2", label: "PARTE 2", banda: "gold", sub: subProd, blocos: cl.parte2! });
  }
  if (cl.temKit) {
    const sub = `Pronta Entrega · ${kitOpt === "separado" ? "Entregar SEPARADO (antecipado)" : "Entregar JUNTO com o pedido"}`;
    jobs.push({ tipo: "pronta-entrega", label: "PRONTA ENTREGA", banda: "green", sub, blocos: cl.kits });
  }

  const arquivos: { tipo: string; label: string; url: string }[] = [];
  for (const job of jobs) {
    const codigo = codigoParte(baseNum, TIPOS_PDF[job.tipo]?.suf ?? "");
    const bytes = await gerarPdfParte(job.label, job.sub, job.banda, { ...info, numero: codigo }, job.blocos);
    const key = `pedidos/${id}/${job.tipo}.pdf`;
    await c.env.BUCKET.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } });
    arquivos.push({ tipo: job.tipo, label: `${codigo} · ${job.label}`, url: `/api/pedidos/${id}/pdf/${job.tipo}` });
  }
  await c.env.DB.prepare("UPDATE pedidos SET status = 'conferido', entrega_pe = ? WHERE id = ?")
    .bind(cl.temKit ? kitOpt : null, id)
    .run();

  return c.json({ modo: cl.modo, temKit: cl.temKit, arquivos });
});

// LISTA os PDFs de produção já gerados (persistente: lê do R2). Assim a tela do pedido
// mostra os botões "Visualizar PDF" mesmo depois de recarregar.
const TIPOS_PDF: Record<string, { nome: string; suf: string }> = {
  "parte-unica": { nome: "PARTE ÚNICA", suf: "" },
  "parte-1": { nome: "PARTE 1", suf: "-P1" },
  "parte-2": { nome: "PARTE 2", suf: "-P2" },
  "pronta-entrega": { nome: "PRONTA ENTREGA", suf: "-PE" },
};
const ORDEM_PDF = ["parte-unica", "parte-1", "parte-2", "pronta-entrega"];
// Código da parte: número único → "2030-P1"; vários números → "2030, 2031 (P1)".
function codigoParte(baseNum: string, suf: string): string {
  if (!suf) return baseNum;
  return baseNum.includes(",") ? `${baseNum} (${suf.replace("-", "")})` : `${baseNum}${suf}`;
}
pedidos.get("/:id/pdfs", async (c) => {
  const id = c.req.param("id");
  const ped = await c.env.DB.prepare("SELECT numero_erp FROM pedidos WHERE id = ?")
    .bind(id)
    .first<{ numero_erp: string | null }>();
  const baseNum = ped?.numero_erp || id.slice(0, 8);
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
  const ped = await c.env.DB.prepare("SELECT numero_erp FROM pedidos WHERE id = ?")
    .bind(id)
    .first<{ numero_erp: string | null }>();
  const baseNum = ped?.numero_erp || id.slice(0, 8);
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
