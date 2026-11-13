// Preset icons & illustrations for raffle prizes
export interface PrizePreset {
  id: string;
  name: string;
  category: string;
  imageUrl: string;
}

// Crisp, beautiful SVG Data URIs for instant, offline-ready prize presets
const createSvgDataUrl = (svgContent: string): string => {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
};

export const PRIZE_PRESETS: PrizePreset[] = [
  {
    id: 'pix_gold',
    name: 'Pix de R$ 100 / Pix Dourado',
    category: 'Pix & Dinheiro',
    imageUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <rect width="120" height="120" rx="28" fill="#080D18" stroke="#0131CD" stroke-width="2"/>
        <circle cx="60" cy="60" r="42" fill="#0131CD" opacity="0.2"/>
        <circle cx="60" cy="60" r="34" fill="none" stroke="#A6C957" stroke-width="4"/>
        <path d="M42 60 L60 42 L78 60 L60 78 Z" fill="#A6C957"/>
        <circle cx="60" cy="60" r="8" fill="#080D18"/>
        <text x="60" y="104" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="11" font-weight="bold">PIX OFICIAL</text>
      </svg>
    `),
  },
  {
    id: 'pix_cash',
    name: 'Bolada em Dinheiro',
    category: 'Pix & Dinheiro',
    imageUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <rect width="120" height="120" rx="28" fill="#111B30" stroke="#A6C957" stroke-width="2"/>
        <rect x="25" y="42" width="70" height="42" rx="8" fill="none" stroke="#A6C957" stroke-width="4"/>
        <circle cx="60" cy="63" r="14" fill="none" stroke="#A6C957" stroke-width="3"/>
        <text x="60" y="69" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="16" font-weight="900">R$</text>
        <text x="60" y="104" text-anchor="middle" fill="#A6C957" font-family="system-ui, sans-serif" font-size="11" font-weight="bold">DINHEIRO</text>
      </svg>
    `),
  },
  {
    id: 'smartphone',
    name: 'Smartphone Top de Linha',
    category: 'Eletrônicos',
    imageUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <rect width="120" height="120" rx="28" fill="#080D18" stroke="#0131CD" stroke-width="2"/>
        <rect x="42" y="24" width="36" height="66" rx="7" fill="#111B30" stroke="#0131CD" stroke-width="3.5"/>
        <line x1="53" y1="30" x2="67" y2="30" stroke="#A5B1C5" stroke-width="2" stroke-linecap="round"/>
        <circle cx="60" cy="80" r="3" fill="#A6C957"/>
        <text x="60" y="106" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="11" font-weight="bold">SMARTPHONE</text>
      </svg>
    `),
  },
  {
    id: 'console_gamer',
    name: 'Console Gamer / PS5 / Xbox',
    category: 'Games',
    imageUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <rect width="120" height="120" rx="28" fill="#111B30" stroke="#0131CD" stroke-width="2"/>
        <path d="M30 45 C35 35, 85 35, 90 45 C98 62, 92 84, 80 84 C73 84, 68 74, 60 74 C52 74, 47 84, 40 84 C28 84, 22 62, 30 45 Z" fill="#080D18" stroke="#0131CD" stroke-width="3.5"/>
        <line x1="42" y1="52" x2="42" y2="64" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
        <line x1="36" y1="58" x2="48" y2="58" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
        <circle cx="74" cy="54" r="3" fill="#A6C957"/>
        <circle cx="82" cy="60" r="3" fill="#A6C957"/>
        <text x="60" y="106" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="11" font-weight="bold">VIDEOGAME</text>
      </svg>
    `),
  },
  {
    id: 'headphones',
    name: 'Fone de Ouvido Bluetooth',
    category: 'Eletrônicos',
    imageUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <rect width="120" height="120" rx="28" fill="#080D18" stroke="#0131CD" stroke-width="2"/>
        <path d="M35 62 A26 26 0 0 1 85 62" fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round"/>
        <rect x="28" y="58" width="14" height="24" rx="7" fill="#0131CD"/>
        <rect x="78" y="58" width="14" height="24" rx="7" fill="#0131CD"/>
        <text x="60" y="106" text-anchor="middle" fill="#A5B1C5" font-family="system-ui, sans-serif" font-size="11" font-weight="bold">FONE BLUETOOTH</text>
      </svg>
    `),
  },
  {
    id: 'trophy',
    name: 'Troféu de Campeão / 1º Lugar',
    category: 'Premiação',
    imageUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <rect width="120" height="120" rx="28" fill="#111B30" stroke="#A6C957" stroke-width="2"/>
        <path d="M38 32 L82 32 L74 62 C72 70, 66 74, 60 74 C54 74, 48 70, 46 62 Z" fill="#A6C957"/>
        <path d="M38 40 C30 40, 26 48, 32 56 C35 60, 42 62, 44 62" fill="none" stroke="#FFFFFF" stroke-width="3"/>
        <path d="M82 40 C90 40, 94 48, 88 56 C85 60, 78 62, 76 62" fill="none" stroke="#FFFFFF" stroke-width="3"/>
        <rect x="56" y="74" width="8" height="12" fill="#FFFFFF"/>
        <rect x="44" y="86" width="32" height="6" rx="2" fill="#A6C957"/>
        <text x="60" y="106" text-anchor="middle" fill="#A6C957" font-family="system-ui, sans-serif" font-size="11" font-weight="bold">1º LUGAR</text>
      </svg>
    `),
  },
  {
    id: 'gift_box',
    name: 'Cesta / Caixa de Prêmios VIP',
    category: 'Premiação',
    imageUrl: createSvgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
        <rect width="120" height="120" rx="28" fill="#080D18" stroke="#0131CD" stroke-width="2"/>
        <rect x="34" y="48" width="52" height="42" rx="4" fill="#0131CD"/>
        <rect x="30" y="42" width="60" height="10" rx="3" fill="#111B30" stroke="#A6C957" stroke-width="1.5"/>
        <line x1="60" y1="42" x2="60" y2="90" stroke="#A6C957" stroke-width="5"/>
        <path d="M50 36 C45 28, 55 24, 60 36 C65 24, 75 28, 70 36 Z" fill="#A6C957"/>
        <text x="60" y="106" text-anchor="middle" fill="#FFFFFF" font-family="system-ui, sans-serif" font-size="11" font-weight="bold">CAIXA SURPRESA</text>
      </svg>
    `),
  },
];
