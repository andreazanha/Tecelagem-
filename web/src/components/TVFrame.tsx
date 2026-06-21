import { useEffect, useState, type ReactNode } from "react";

// "Palco" de tamanho fixo (1920×1080) que ESCALA por inteiro para caber na tela.
// Assim o design é sempre igual: tela maior → tudo maior; menor → tudo menor,
// sem reflow nem corte de informação (barras pretas nas sobras, se necessário).
export function TVFrame({ children, w = 1920, h = 1080 }: { children: ReactNode; w?: number; h?: number }) {
  const [s, setS] = useState(1);
  useEffect(() => {
    const calc = () => setS(Math.min(window.innerWidth / w, window.innerHeight / h));
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
