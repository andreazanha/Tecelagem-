import { Hono } from "hono";
import { extractText, getDocumentProxy } from "unpdf";
import type { Env } from "../index";
import { parsePedido } from "../parser";

export const pedidos = new Hono<{ Bindings: Env }>();

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
  const tipo = (b.tipo || "").trim();

  if (!cliente_nome) return c.json({ error: "cliente é obrigatório" }, 400);
  if (!TIPOS.includes(tipo))
    return c.json({ error: `tipo inválido (use: ${TIPOS.join(", ")})` }, 400);

  const temPE = tipo === "unico_pe" || tipo === "p1p2_pe";
  const entrega_pe = temPE ? (b.entrega_pe === "separado" ? "separado" : "junto") : null;

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

// UPLOAD do PDF original (preserva no R2)
pedidos.post("/:id/pdf", async (c) => {
  const id = c.req.param("id");
  const exists = await c.env.DB.prepare("SELECT id FROM pedidos WHERE id = ?")
    .bind(id)
    .first();
  if (!exists) return c.json({ error: "pedido não encontrado" }, 404);

  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) return c.json({ error: "arquivo ausente" }, 400);

  const key = `pedidos/${id}/${file.name}`;
  await c.env.BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/pdf" },
  });
  await c.env.DB.prepare("UPDATE pedidos SET pdf_key = ? WHERE id = ?").bind(key, id).run();
  return c.json({ ok: true, pdf_key: key });
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
