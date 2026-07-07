// Ícones de LINHA (monocromáticos) do menu — substituem os emojis coloridos.
// Motivo: no Chrome do Windows o `filter: grayscale()` não desbota emoji, então o
// menu ficava "colorido/infantil". Estes SVGs usam currentColor, herdando a cor do
// item (discreto quando inativo, claro no item da página atual) — visual corporativo.
// Estilo Lucide (traço, 24x24). A busca ignora o seletor de variação (U+FE0F).

const PATHS: Record<string, string> = {
  // grupos
  "🛒": '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 3h2l2.6 12.4a2 2 0 0 0 2 1.6h9.5a2 2 0 0 0 2-1.6L22 7H5.2"/>',
  "🏭": '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9l-7 4V9l-7 4V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M7 18h.01M12 18h.01M17 18h.01"/>',
  "📊": '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="8" width="3" height="10" rx="1"/><rect x="17" y="5" width="3" height="13" rx="1"/>',
  "🚚": '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.6a1 1 0 0 0-.2-.6l-3.5-4.4a1 1 0 0 0-.8-.4H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  "🚛": '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.6a1 1 0 0 0-.2-.6l-3.5-4.4a1 1 0 0 0-.8-.4H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  "🧾": '<path d="M5 2v20l2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  "🗂": '<path d="M4 20h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7.5l-2-2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2Z"/>',
  "📈": '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  "⚙": '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  // itens
  "📦": '<path d="M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  "📋": '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  "➕": '<path d="M5 12h14M12 5v14"/>',
  "👥": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  "🧑‍💼": '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  "💵": '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  "💰": '<circle cx="12" cy="12" r="10"/><path d="M12 6v12M15 8.5H10.5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4H9"/>',
  "🧶": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  "🔥": '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>',
  "✂": '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" x2="8.1" y1="4" y2="15.9"/><line x1="14.5" x2="20" y1="14.5" y2="20"/><line x1="8.1" x2="12" y1="8.1" y2="12"/>',
  "🪡": '<path d="M20 4 4 20"/><path d="M15 4h5v5"/><circle cx="6" cy="18" r="2"/>',
  "🔍": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  "🛍": '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  "🧷": '<path d="m12.8 2.2-1.6 0L2.6 6.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0l8.6-3.9a1 1 0 0 0 0-1.8Z"/><path d="m22 17.7-9.2 4.1a2 2 0 0 1-1.6 0L2 17.7"/><path d="m22 12.7-9.2 4.1a2 2 0 0 1-1.6 0L2 12.7"/>',
  "⬇": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  "🧵": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M8 13h8M8 17h8M8 9h2"/>',
  "📄": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5"/><path d="M8 13h8M8 17h8M8 9h2"/>',
  "📮": '<path d="M14.5 21.7a.5.5 0 0 0 .9 0l6.5-19a.5.5 0 0 0-.6-.6l-19 6.5a.5.5 0 0 0 0 .9l7.9 3.2a2 2 0 0 1 1.1 1.1Z"/><path d="m21.9 2.1-11 11"/>',
  "🏷": '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  "✅": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  "🎨": '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1a1.6 1.6 0 0 1 1.6-1.6H16c3 0 5.5-2.5 5.5-5.6C21.5 6 17.5 2 12 2Z"/><circle cx="7" cy="12" r="1.1"/><circle cx="9.5" cy="7.5" r="1.1"/><circle cx="14.5" cy="7.5" r="1.1"/><circle cx="17" cy="12" r="1.1"/>',
  "📏": '<path d="M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4Z"/><path d="m7.5 10.5 2 2M10.5 7.5l2 2M13.5 4.5l2 2M4.5 13.5l2 2"/>',
  "🔐": '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  "🤝": '<path d="M11 17 8 20a2 2 0 0 1-3-3l6-6 3 3"/><path d="m14 12 3-3 5 5-3 3a2 2 0 0 1-3 0Z"/><path d="M12 8 8 4 3 9l4 4"/>',
  "📺": '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  "⏰": '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6M22 6l-3-3"/>',
  "🎛": '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
  "💤": '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  "🔌": '<path d="M12 22v-5M9 8V2M15 8V2M6 8h12v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4Z"/>',
  "🕑": '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  "🔔": '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
};

export function Icon({ emoji, size = 18 }: { emoji: string; size?: number }) {
  const key = (emoji || "").replace(/️/g, "");
  const d = PATHS[key] || PATHS[key.replace(/‍.*$/, "")];
  if (!d) return <span aria-hidden>{emoji}</span>;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "block" }}
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}
