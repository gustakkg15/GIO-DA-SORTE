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
    bgStart: '#080D18',
    bgMid: '#111B30',
    bgEnd: '#080D18',
    glowColor1: 'rgba(1, 49, 205, 0.35)',
    glowColor2: 'rgba(166, 201, 87, 0.12)',
    outerBorder: '#0131CD',
    innerBorder: 'rgba(165, 177, 197, 0.35)',
    accent: '#A6C957',
    badgeStart: '#0131CD',
    badgeMid: '#0131CD',
    badgeEnd: '#111B30',
    badgeBorder: '#A6C957',
    badgeText: '#FFFFFF',
    numberColor: '#FFFFFF',
    prizeColor: '#A6C957',
  },
  gold: {
    bgStart: '#080D18',
    bgMid: '#111B30',
    bgEnd: '#080D18',
    glowColor1: 'rgba(166, 201, 87, 0.22)',
    glowColor2: 'rgba(1, 49, 205, 0.2)',
    outerBorder: '#A6C957',
    innerBorder: 'rgba(166, 201, 87, 0.38)',
    accent: '#A6C957',
    badgeStart: '#111B30',
    badgeMid: '#0131CD',
    badgeEnd: '#111B30',
    badgeBorder: '#A6C957',
    badgeText: '#A6C957',
    numberColor: '#FFFFFF',
    prizeColor: '#A6C957',
  },
  emerald: {
    bgStart: '#080D18',
    bgMid: '#111B30',
    bgEnd: '#080D18',
    glowColor1: 'rgba(166, 201, 87, 0.24)',
    glowColor2: 'rgba(1, 49, 205, 0.18)',
    outerBorder: '#A6C957',
    innerBorder: 'rgba(165, 177, 197, 0.35)',
    accent: '#A6C957',
    badgeStart: '#0131CD',
    badgeMid: '#111B30',
    badgeEnd: '#0131CD',
    badgeBorder: '#A6C957',
    badgeText: '#FFFFFF',
    numberColor: '#FFFFFF',
    prizeColor: '#A6C957',
  },
  midnight: {
    bgStart: '#080D18',
    bgMid: '#111B30',
    bgEnd: '#080D18',
    glowColor1: 'rgba(1, 49, 205, 0.3)',
    glowColor2: 'rgba(165, 177, 197, 0.12)',
    outerBorder: '#0131CD',
    innerBorder: 'rgba(165, 177, 197, 0.3)',
    accent: '#FFFFFF',
    badgeStart: '#111B30',
    badgeMid: '#0131CD',
    badgeEnd: '#111B30',
    badgeBorder: '#FFFFFF',
    badgeText: '#A5B1C5',
    numberColor: '#FFFFFF',
    prizeColor: '#A6C957',
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
  ctx.font = '700 20px "Inter", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.letterSpacing = '2px';
  ctx.fillText(title, 600, 105);

  // Subtitle
  ctx.fillStyle = '#A5B1C5';
  ctx.font = '500 15px "Inter", system-ui, sans-serif';
  ctx.letterSpacing = '0.5px';
  ctx.fillText(subtitle, 600, 136);

  // Divider Line
  const divGrad = ctx.createLinearGradient(350, 0, 850, 0);
  divGrad.addColorStop(0, 'rgba(1, 49, 205, 0)');
  divGrad.addColorStop(0.5, theme.accent);
  divGrad.addColorStop(1, 'rgba(1, 49, 205, 0)');
  ctx.strokeStyle = divGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(350, 158);
  ctx.lineTo(850, 158);
  ctx.stroke();

  // Winner Big Name
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '800 56px "Inter", system-ui, sans-serif';
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
  ctx.font = '700 14px "Inter", system-ui, sans-serif';
  ctx.letterSpacing = '1.5px';
  ctx.fillText('BILHETE PREMIADO', 600, 302);

  ctx.fillStyle = theme.numberColor;
  ctx.font = '800 44px "Inter", system-ui, sans-serif';
  ctx.letterSpacing = '0px';
  ctx.fillText(`#${ticketNumber}`, 600, 344);

  // Prize Description
  ctx.fillStyle = theme.prizeColor;
  ctx.font = '700 26px "Inter", system-ui, sans-serif';
  ctx.letterSpacing = '0px';
  ctx.fillText(`Prêmio: ${prize}`, 600, 404);

  // Optional custom message or default context
  if (customMessage) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'italic 16px "Inter", system-ui, sans-serif';
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
    ctx.fillStyle = '#A5B1C5';
    ctx.font = '15px "Inter", system-ui, sans-serif';
    ctx.fillText(`${coinsText} · Sorteado em ${dateText}`, 600, 442);
  }

  // Organizer Signature
  ctx.fillStyle = theme.accent;
  ctx.font = '700 15px "Inter", system-ui, sans-serif';
  ctx.letterSpacing = '0.5px';
  ctx.fillText(organizerSignature, 600, 480);

  // Bottom Cryptographic Seal / Hash
  ctx.fillStyle = '#A5B1C5';
  ctx.font = '12px "JetBrains Mono", monospace';
  const hashText = rosterHash ? `Hash de Integridade: ${rosterHash.slice(0, 32)}...` : 'Verificação Criptográfica Ativa';
  ctx.fillText(hashText, 600, 542);

  ctx.font = '11px "Inter", system-ui, sans-serif';
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
