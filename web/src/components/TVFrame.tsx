import { useLayoutEffect, useState, type ReactNode } from "react";

// Escala que faz o palco 1920×1080 caber inteiro na janela.
function calcScale(w: number, h: number) {
  if (typeof window === "undefined") return 1;
  return Math.min(window.innerWidth / w, window.innerHeight / h);
}

// "Palco" de tamanho fixo (1920×1080) que ESCALA por inteiro para caber na tela.
// Assim o design é sempre igual: tela maior → tudo maior; menor → tudo menor,
// sem reflow nem corte de informação (barras pretas nas sobras, se necessário).
// A escala já nasce calculada (useState lazy) e é confirmada em useLayoutEffect
// ANTES da pintura, para nunca aparecer o quadro grande/cortado por um instante.
export function TVFrame({ children, w = 1920, h = 1080 }: { children: ReactNode; w?: number; h?: number }) {
  const [s, setS] = useState(() => calcScale(w, h));
  useLayoutEffect(() => {
    const calc = () => setS(calcScale(w, h));
    calc();
    window.addEventListener("resize", calc);
    document.addEventListener("fullscreenchange", calc);
    return () => {
      window.removeEventListener("resize", calc);
      document.removeEventListener("fullscreenchange", calc);
    };
  }, [w, h]);
  return (
    <div className="tvframe">
      <div className="tvframe-canvas" style={{ width: w, height: h, transform: `translate(-50%, -50%) scale(${s})` }}>
        {children}
      </div>
    </div>
  );
}
