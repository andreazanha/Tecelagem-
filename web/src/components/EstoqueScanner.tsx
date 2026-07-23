import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useNavigate } from "react-router-dom";

// Abre a câmera, lê o QR de um item de estoque (a URL /estoque-scan?...) e
// leva para a tela de escaneamento, onde se digita a quantidade.
export function EstoqueScanner({ onFechar }: { onFechar: () => void }) {
  const nav = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [erro, setErro] = useState("");
  const feito = useRef(false);

  useEffect(() => {
    let parado = false;
    let stream: MediaStream | null = null;
    let raf = 0;

    function rota(texto: string): string | null {
      const t = (texto || "").trim();
      try { const u = new URL(t); if (u.pathname.includes("estoque-scan")) return u.pathname + u.search; } catch { /* não é URL absoluta */ }
      const i = t.indexOf("/estoque-scan");
      if (i >= 0) return t.slice(i);
      return null;
    }
    function loop() {
      if (parado) return;
      raf = requestAnimationFrame(loop);
      const v = videoRef.current, cv = canvasRef.current;
      if (!v || !cv || v.readyState !== v.HAVE_ENOUGH_DATA) return;
      const w = v.videoWidth, h = v.videoHeight;
      if (!w || !h) return;
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, w, h);
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
      if (code && code.data && !feito.current) {
        const r = rota(code.data);
        if (r) { feito.current = true; (navigator as Navigator & { vibrate?: (n: number) => void }).vibrate?.(120); onFechar(); nav(r); }
      }
    }
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (parado) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current!; v.srcObject = stream; await v.play(); loop();
      } catch { setErro("Não consegui abrir a câmera. Permita o acesso (e use por HTTPS)."); }
    })();
    return () => { parado = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [nav, onFechar]);

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="pad">
          <div className="row-gap" style={{ alignItems: "center", marginBottom: 8 }}>
            <strong>📷 Escanear item</strong>
            <button className="btn btn-soft" style={{ marginLeft: "auto" }} onClick={onFechar}>Fechar</button>
          </div>
          {erro ? <p className="erro">{erro}</p> : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>Aponte a câmera para o <strong>QR do item</strong> (na caixa/prateleira). Abre a tela pra digitar a quantidade.</p>
              <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#000" }}>
                <video ref={videoRef} playsInline muted style={{ width: "100%", display: "block" }} />
                <div style={{ position: "absolute", inset: "18% 22%", border: "3px solid #c2a05a", borderRadius: 12, pointerEvents: "none" }} />
              </div>
            </>
          )}
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
      </div>
    </div>
  );
}
