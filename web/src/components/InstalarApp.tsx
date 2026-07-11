// Botão "Instalar app": aparece sozinho quando o navegador permite instalar como
// PWA (Chrome/Edge no PC e Android). No iOS o caminho é Compartilhar → Adicionar
// à Tela de Início, então lá o botão não aparece.
import { useEffect, useState } from "react";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstalarApp() {
  const [prompt, setPrompt] = useState<BIP | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return; // já está instalado/rodando como app
    const onBIP = (e: Event) => { e.preventDefault(); setPrompt(e as BIP); };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onBIP); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (!prompt) return null;
  async function instalar() {
    try { await prompt!.prompt(); await prompt!.userChoice; } catch { /* ignore */ }
    setPrompt(null);
  }
  return <button className="instalar-app" onClick={instalar} title="Instalar como aplicativo no computador/celular">⬇️ Instalar app</button>;
}
