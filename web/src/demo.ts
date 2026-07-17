// ── MODO DEMONSTRAÇÃO ────────────────────────────────────────────────────────
// Deixa explorar/treinar o sistema SEM gravar nada. Quando ligado, toda ESCRITA
// (POST/PUT/PATCH/DELETE) para /api é interceptada no navegador e NÃO chega ao
// servidor — devolve um "sucesso de mentira" e avisa na tela. Leituras (GET)
// passam normalmente, então as telas aparecem com os dados reais.
// Garantia: nada do que for feito no modo demonstração toca o banco de verdade.
const KEY = "demo-mode";

export const isDemo = (): boolean => {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};

export function setDemo(on: boolean) {
  try { on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("demo-change", { detail: on }));
}

// Caminhos que NUNCA são bloqueados (senão não dá nem pra entrar no sistema).
const LIVRE = ["/api/usuarios/login", "/api/pedidos/importar"];

let instalado = false;
// Instala uma única vez o "filtro" no fetch global. Ele só age quando o modo
// demonstração está ligado; caso contrário, repassa tudo sem interferir.
export function instalarDemoFetch() {
  if (instalado) return;
  instalado = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const method = (init?.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();
      const ehApi = url.includes("/api/");
      const escrita = !["GET", "HEAD", "OPTIONS"].includes(method);
      const livre = LIVRE.some((p) => url.includes(p));
      if (isDemo() && ehApi && escrita && !livre) {
        window.dispatchEvent(new CustomEvent("demo-block"));
        // sucesso "de mentira" — não envia nada ao servidor
        return new Response(JSON.stringify({ ok: true, demo: true, id: "demo", ids: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    } catch { /* qualquer erro na checagem → segue o fetch normal */ }
    return orig(input, init);
  };
}
