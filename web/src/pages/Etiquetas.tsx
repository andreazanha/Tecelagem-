import { EtiquetasColar } from "./Cadastros";

// Página dedicada só para fazer as etiquetas de colar (pedido pra gráfica).
export function Etiquetas() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Etiquetas</h1>
          <div className="breadcrumb">Etiquetas de colar · pedido para a gráfica</div>
        </div>
      </div>
      <EtiquetasColar />
    </>
  );
}
