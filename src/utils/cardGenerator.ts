import { Winner, Participant, RaffleSettings } from '../types';

export interface VictoryCardCustomization {
  title?: string;
  subtitle?: string;
  winnerName?: string;
  ticketNumber?: number | string;
  prize?: string;
  customMessage?: string;
  organizerSignature?: string;
  theme?: 'sapphire' | 'gold' | 'emerald' | 'midnight';
}

interface ThemePalette {
  bgStart: string;
  bgMid: string;
  bgEnd: string;
  glowColor1: string;
  glowColor2: string;
  outerBorder: string;
  innerBorder: string;
  accent: string;
  badgeStart: string;
  badgeMid: string;
  badgeEnd: string;
  badgeBorder: string;
  badgeText: string;
  numberColor: string;
  prizeColor: string;
}

const THEMES: Record<string, ThemePalette> = {
  sapphire: {
    bgStart: '#030712',
    bgMid: '#0b1329',
    bgEnd: '#020617',
    glowColor1: 'rgba(37, 99, 235, 0.35)',
    glowColor2: 'rgba(14, 165, 233, 0.15)',
    outerBorder: '#2563eb',
    innerBorder: 'rgba(56, 189, 248, 0.5)',
    accent: '#38bdf8',
    badgeStart: '#1d4ed8',
    badgeMid: '#0ea5e9',
    badgeEnd: '#2563eb',
    badgeBorder: '#93c5fd',
    badgeText: '#e0f2fe',
    numberColor: '#ffffff',
    prizeColor: '#38bdf8',
  },
  gold: {
    bgStart: '#0c0a09',
    bgMid: '#1c1917',
    bgEnd: '#050403',
    glowColor1: 'rgba(245, 158, 11, 0.35)',
    glowColor2: 'rgba(217, 119, 6, 0.15)',
    outerBorder: '#d97706',
    innerBorder: 'rgba(251, 191, 36, 0.5)',
    accent: '#fbbf24',
    badgeStart: '#b45309',
    badgeMid: '#f59e0b',
    badgeEnd: '#d97706',
    badgeBorder: '#fde68a',
    badgeText: '#fef3c7',
    numberColor: '#ffffff',
    prizeColor: '#fbbf24',
  },
  emerald: {
    bgStart: '#022c22',
    bgMid: '#064e3b',
    bgEnd: '#021c15',
    glowColor1: 'rgba(16, 185, 129, 0.35)',
    glowColor2: 'rgba(5, 150, 105, 0.15)',
    outerBorder: '#059669',
    innerBorder: 'rgba(52, 211, 153, 0.5)',
    accent: '#34d399',
    badgeStart: '#047857',
    badgeMid: '#10b981',
    badgeEnd: '#059669',
    badgeBorder: '#a7f3d0',
    badgeText: '#ecfdf5',
    numberColor: '#ffffff',
    prizeColor: '#34d399',
  },
  midnight: {
    bgStart: '#09090b',
    bgMid: '#18181b',
    bgEnd: '#050507',
    glowColor1: 'rgba(168, 85, 247, 0.3)',
    glowColor2: 'rgba(99, 102, 241, 0.15)',
    outerBorder: '#7c3aed',
    innerBorder: 'rgba(192, 132, 252, 0.5)',
    accent: '#c084fc',
    badgeStart: '#6d28d9',
    badgeMid: '#8b5cf6',
    badgeEnd: '#7c3aed',
    badgeBorder: '#ddd6fe',
    badgeText: '#f3e8ff',
    numberColor: '#ffffff',
    prizeColor: '#c084fc',
  },
};

/**
 * Generates a high-resolution 1200x630px customizable celebratory victory card.
 */
export async function renderVictoryCardCanvas(
  winner: Winner,
  participant: Participant | undefined,
  settings: RaffleSettings,
  rosterHash?: string,
  customization?: VictoryCardCustomization
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  const themeName = customization?.theme || 'sapphire';
  const theme = THEMES[themeName] || THEMES.sapphire;

  // Values from customization or defaults
  const title = customization?.title?.trim() || '✦ GIO DA SORTE · CERTIFICADO OFICIAL ✦';
  const subtitle = customization?.subtitle?.trim() || 'SORTEIO PROPORCIONAL POR MOEDAS · RESULTADO AUDITADO';
  const winnerName = customization?.winnerName?.trim() || winner.name;
  const ticketNumber = customization?.ticketNumber ?? winner.number;
  const prize = customization?.prize?.trim() || winner.prize || 'Grande Sorteio';
  const customMessage = customization?.customMessage?.trim() || '';
  const organizerSignature = customization?.organizerSignature?.trim() || 'GIO DA SORTE OFICIAL';

  // Deep gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, 1200, 630);
  bgGrad.addColorStop(0, theme.bgStart);
  bgGrad.addColorStop(0.5, theme.bgMid);
  bgGrad.addColorStop(1, theme.bgEnd);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1200, 630);

  // Radial Glow in Center
  const radialGlow = ctx.createRadialGradient(600, 315, 50, 600, 315, 520);
  radialGlow.addColorStop(0, theme.glowColor1);
  radialGlow.addColorStop(0.5, theme.glowColor2);
  radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = radialGlow;
  ctx.fillRect(0, 0, 1200, 630);

  // Outer Border Frame
  ctx.strokeStyle = theme.outerBorder;
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, 1140, 570);

  // Inner Filigree Frame
  ctx.strokeStyle = theme.innerBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(42, 42, 1116, 546);

  // Corner Accents
  ctx.fillStyle = theme.accent;
  const corners = [
    [30, 30],
    [1170, 30],
    [30, 600],
    [1170, 600],
  ];
  corners.forEach(([x, y]) => {
    ctx.fillRect(x - 4, y - 4, 8, 8);
  });

  // Top Header Label
  ctx.fillStyle = theme.accent;
  ctx.font = 'bold 22px "Outfit", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '5px';
  ctx.fillText(title, 600, 105);

  // Subtitle
  ctx.fillStyle = '#94a3b8';
  ctx.font = '15px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText(subtitle, 600, 136);

  // Divider Line
  const divGrad = ctx.createLinearGradient(350, 0, 850, 0);
  divGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
  divGrad.addColorStop(0.5, theme.accent);
  divGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(350, 158);
  ctx.lineTo(850, 158);
  ctx.stroke();

  // Winner Big Name
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 58px "Outfit", system-ui, sans-serif';
  ctx.letterSpacing = '-0.5px';
  ctx.fillText(winnerName, 600, 235);

  // Ticket Badge (Center Card)
  const badgeWidth = 460;
  const badgeHeight = 90;
  const badgeX = (1200 - badgeWidth) / 2;
  const badgeY = 270;

  const badgeGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeWidth, badgeY);
  badgeGrad.addColorStop(0, theme.badgeStart);
  badgeGrad.addColorStop(0.5, theme.badgeMid);
  badgeGrad.addColorStop(1, theme.badgeEnd);
  ctx.fillStyle = badgeGrad;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 16);
  ctx.fill();

  ctx.strokeStyle = theme.badgeBorder;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Badge Text: Number and Prize
  ctx.fillStyle = theme.badgeText;
  ctx.font = '800 15px "Outfit", system-ui, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText('BILHETE PREMIADO', 600, 302);

  ctx.fillStyle = theme.numberColor;
  ctx.font = '900 44px "JetBrains Mono", monospace';
  ctx.letterSpacing = '0px';
  ctx.fillText(`#${ticketNumber}`, 600, 344);

  // Prize Description
  ctx.fillStyle = theme.prizeColor;
  ctx.font = 'bold 26px "Outfit", system-ui, sans-serif';
  ctx.letterSpacing = '0.5px';
  ctx.fillText(`Prêmio: ${prize}`, 600, 404);

  // Optional custom message or default context
  if (customMessage) {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'italic 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`"${customMessage}"`, 600, 442);
  } else {
    const coinsText = participant ? `Concorreu com ${participant.coins} moedas` : 'Participante da rodada';
    const dateText = new Date(winner.drawnAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '15px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(`${coinsText} · Sorteado em ${dateText}`, 600, 442);
  }

  // Organizer Signature
  ctx.fillStyle = theme.accent;
  ctx.font = 'bold 15px "Outfit", system-ui, sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText(organizerSignature, 600, 480);

  // Bottom Cryptographic Seal / Hash
  ctx.fillStyle = '#64748b';
  ctx.font = '12px "JetBrains Mono", monospace';
  const hashText = rosterHash ? `Hash de Integridade: ${rosterHash.slice(0, 32)}...` : 'Verificação Criptográfica Ativa';
  ctx.fillText(hashText, 600, 542);

  ctx.font = '11px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`Taxa: ${settings.rate} moedas por bilhete · Total na série: ${settings.total}`, 600, 562);

  return canvas;
}

/**
 * Renders the victory card and returns its image as Data URL
 */
export async function createVictoryCardDataUrl(
  winner: Winner,
  participant: Participant | undefined,
  settings: RaffleSettings,
  rosterHash?: string,
  customization?: VictoryCardCustomization
): Promise<string> {
  const canvas = await renderVictoryCardCanvas(winner, participant, settings, rosterHash, customization);
  return canvas.toDataURL('image/png');
}

/**
 * Downloads the victory card as PNG with custom options
 */
export async function downloadVictoryCardPng(
  winner: Winner,
  participant: Participant | undefined,
  settings: RaffleSettings,
  rosterHash?: string,
  customization?: VictoryCardCustomization
) {
  const canvas = await renderVictoryCardCanvas(winner, participant, settings, rosterHash, customization);
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  const safeName = (customization?.winnerName || winner.name).toLowerCase().replace(/\s+/g, '-');
  a.download = `gio-da-sorte-vitoria-${safeName}-bilhete-${winner.number}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Copies the victory card image to clipboard with custom options
 */
export async function copyVictoryCardToClipboard(
  winner: Winner,
  participant: Participant | undefined,
  settings: RaffleSettings,
  rosterHash?: string,
  customization?: VictoryCardCustomization
): Promise<boolean> {
  const canvas = await renderVictoryCardCanvas(winner, participant, settings, rosterHash, customization);
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob,
          }),
        ]);
        resolve(true);
      } catch {
        resolve(false);
      }
    }, 'image/png');
  });
}
