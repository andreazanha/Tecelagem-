import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { api } from "../api";

// Leitor de QR embutido: abre a câmera e dá baixa (retorno) no romaneio cujo QR
// for escaneado. Cada romaneio tem um QR "BTROM|<tipo>|<pedido_id>" no PDF, então
// a baixa cai SEMPRE no romaneio certo (acaba o erro de baixar o errado na mão).
type Linha = { ok: boolean; texto: string };

export function ScannerBaixa({ onFechar, onBaixa }: { onFechar: () => void; onBaixa: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [erro, setErro] = useState("");
  const [log, setLog] = useState<Linha[]>([]);
  const processando = useRef(false);
  const ultimo = useRef<{ token: string; t: number }>({ token: "", t: 0 });

  useEffect(() => {
    let parado = false;
    let stream: MediaStream | null = null;
    let raf = 0;

    async function processar(token: string) {
      const m = /^BTROM\|(costura|tassel)\|(.+)$/.exec(token.trim());
      if (!m) return; // QR não é de romaneio: ignora
      const agora = Date.now();
      // não repete o mesmo QR em sequência (segurar parado não dá baixa duas vezes)
      if (token === ultimo.current.token && agora - ultimo.current.t < 4000) return;
      if (processando.current) return;
      processando.current = true;
      ultimo.current = { token, t: agora };
      try {
        const r = await api.marcarRetornoRomaneio(m[1], m[2], true);
        setLog((l) => [{ ok: true, texto: `✓ Baixa Nº ${r.numero} · ${r.cliente || "—"} · ${r.pessoa || "—"}` }, ...l].slice(0, 10));
        (navigator as Navigator & { vibrate?: (n: number) => void }).vibrate?.(120);
        onBaixa();
      } catch {
        setLog((l) => [{ ok: false, texto: "✕ Erro ao dar baixa — tente de novo" }, ...l].slice(0, 10));
      } finally {
        // pequena pausa para não disparar várias vezes no mesmo frame
        setTimeout(() => (processando.current = false), 800);
      }
    }

    function loop() {
      if (parado) return;
      raf = requestAnimationFrame(loop);
      const v = videoRef.current;
      const cv = canvasRef.current;
      if (!v || !cv || v.readyState !== v.HAVE_ENOUGH_DATA) return;
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) return;
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const code = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
      if (code && code.data) processar(code.data);
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (parado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        loop();
      } catch {
        setErro("Não consegui abrir a câmera. Permita o acesso à câmera (e use o sistema por HTTPS).");
      }
    })();

    return () => {
      parado = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onBaixa]);

  return (
    <div className="modal-bg" onClick={onFechar}>
      <div className="modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd unica">
          <div className="modal-hd-top">
            <span className="modal-pills"><span className="modal-pill">📷 Dar baixa por QR</span></span>
            <button className="modal-x" onClick={onFechar}>✕</button>
          </div>
        </div>
        <div className="pad">
          {erro ? (
            <p className="erro">{erro}</p>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                Aponte a câmera para o <strong>QR do romaneio</strong> (canto superior direito). A baixa cai no romaneio certo automaticamente. Pode escanear vários seguidos.
              </p>
              <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: "#000" }}>
                <video ref={videoRef} playsInline muted style={{ width: "100%", display: "block" }} />
                <div style={{ position: "absolute", inset: "18% 22%", border: "3px solid #c2a05a", borderRadius: 12, pointerEvents: "none" }} />
              </div>
            </>
          )}
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {log.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {log.map((l, i) => (
                <div
                  key={i}
                  style={{
                    textAlign: "left", padding: "8px 12px", borderRadius: 8, fontWeight: 700, fontSize: 13,
                    background: l.ok ? "#ecfdf5" : "#fef2f2", color: l.ok ? "#047857" : "#b91c1c",
                  }}
                >
                  {l.texto}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14, textAlign: "right" }}>
            <button className="btn" onClick={onFechar}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
