// Tela "Auditoria do catálogo": conferência Syntech × catálogo DENTRO do sistema (com o
// menu), sem URL solta. Mostra, pra cada peça, o código → a medida REAL do Syntech, e
// sinaliza os problemas (kit sem receita, componente sem medida, quantidade estranha, ref
// com lixo, nomes duplicados). O conteúdo é a página /diag-auditoria do worker, embutida
// num iframe (mesma origem), com um atalho pra abrir em aba cheia.
export default function AuditoriaCatalogo() {
  const url = "/api/integracao/diag-auditoria";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 140px)", minHeight: 420 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "2px 2px 10px", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>🔎 Auditoria do catálogo</h1>
        <span style={{ color: "#64748b", fontSize: 13 }}>Syntech × catálogo — código → medida real de cada peça, e os problemas</span>
        <a href={url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 13, color: "#1d4ed8", textDecoration: "none", fontWeight: 600 }}>Abrir em aba cheia ↗</a>
      </div>
      <iframe title="Auditoria do catálogo" src={url} style={{ flex: 1, width: "100%", border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff" }} />
    </div>
  );
}
