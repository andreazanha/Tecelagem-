import { useEffect, useRef } from "react";
import jsQR from "jsqr";

// Abre a câmera traseira do celular e lê o QR das etiquetas em tempo real.
// A cada leitura chama onCodigo(texto). Leitura CONTÍNUA (pra bipar peça após
// peça): ignora o mesmo código repetido por 1,5s pra não contar a mesma leitura
// várias vezes. O controle de "já bipada" é feito no servidor, mesmo assim.
export function LeitorCamera({ onCodigo, onErro }: { onCodigo: (texto: string) => void; onErro?: (msg: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Callbacks em ref: assim a câmera NÃO reinicia quando o pai re-renderiza.
  const cbRef = useRef(onCodigo); cbRef.current = onCodigo;
  const errRef = useRef(onErro); errRef.current = onErro;
  const ultimo = useRef<{ code: string; t: number }>({ code: "", t: 0 });

  useEffect(() => {
    let parado = false;
    let stream: MediaStream | null = null;
    let raf = 0;
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
      if (code && code.data) {
        const txt = code.data.trim();
        const now = Date.now();
        if (txt && (txt !== ultimo.current.code || now - ultimo.current.t > 1500)) {
          ultimo.current = { code: txt, t: now };
          (navigator as Navigator & { vibrate?: (n: number) => void }).vibrate?.(80);
          cbRef.current(txt);
        }
      }
    }
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (parado) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = videoRef.current!; v.srcObject = stream; await v.play(); loop();
      } catch {
        errRef.current?.("Não consegui abrir a câmera. Permita o acesso à câmera (e use por HTTPS).");
      }
    })();
    return () => { parado = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  return (
    <div className="leitor-cam">
      <video ref={videoRef} playsInline muted />
      <div className="leitor-alvo" />
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
