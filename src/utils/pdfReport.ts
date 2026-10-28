import { jsPDF } from 'jspdf';
import { Winner, RaffleSettings, ComputedRaffle, TikTokWinner } from '../types';
import { formatDateTime } from './raffle';

export interface GeneratePdfReportOptions {
  title?: string;
  organizerName?: string;
  prizeName?: string;
  drawDate?: Date | number;
  reportDate?: Date;
  rosterHash: string;
  winners: Winner[];
  participantsCount?: number;
  totalTicketsCount?: number;
  settings?: RaffleSettings;
  computed?: ComputedRaffle;
  raffleCode?: string;
}

export interface GenerateTikTokPdfReportOptions {
  videoTitle?: string;
  videoUrl?: string;
  authorName?: string;
  prizeName?: string;
  drawDate?: Date | number;
  integrityHash: string;
  winners: TikTokWinner[];
  totalComments?: number;
  eligibleComments?: number;
}

/**
 * Formats full readable date and time in Brazilian Portuguese (DD/MM/AAAA às HH:MM:SS)
 */
export function formatFullTimestamp(timestamp?: number | Date): string {
  const d = timestamp ? new Date(timestamp) : new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  const secs = String(d.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} às ${hours}:${mins}:${secs}`;
}

/**
 * Generates an official, audited PDF Report for standard raffles
 */
export async function generateRafflePdfReport(options: GeneratePdfReportOptions): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm
  let currentY = margin;

  const now = options.reportDate || new Date();
  const reportCode = `LDO-${Math.floor(100000 + Math.random() * 900000)}-${now.getFullYear()}`;
  const raffleTitle = options.title || options.settings?.raffleTitle || options.prizeName || options.settings?.prizeName || options.settings?.currentPrize || 'Sorteio Oficial GIO DA SORTE';
  const organizer = options.organizerName || options.settings?.organizerName || 'Organizador Oficial';
  const prize = options.prizeName || options.settings?.prizeName || options.settings?.currentPrize || 'Prêmio Especial';
  const hash = options.rosterHash || 'Não especificado';

  // Helper for adding footer to current page
  const addFooter = (pageNumber: number, totalPagesPlaceholder = false) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(
      `GIO DA SORTE · Laudo Oficial de Auditoria e Integridade · Documento: ${reportCode}`,
      margin,
      pageHeight - 8
    );
    doc.text(
      `Página ${pageNumber}`,
      pageWidth - margin,
      pageHeight - 8,
      { align: 'right' }
    );
  };

  // --- HEADER BANNER ---
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(margin, currentY, contentWidth, 26, 'F');

  // Accent cyan top border stripe
  doc.setFillColor(2, 132, 199); // sky-600
  doc.rect(margin, currentY, contentWidth, 2, 'F');

  // Brand Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('GIO DA SORTE', margin + 6, currentY + 11);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(186, 230, 253); // sky-200
  doc.text('LAUDO OFICIAL DE AUDITORIA, RESULTADOS E INTEGRIDADE CRIPTOGRÁFICA', margin + 6, currentY + 18);

  // Status Badge on Header Right
  doc.setFillColor(6, 78, 59); // emerald-900
  doc.roundedRect(pageWidth - margin - 52, currentY + 6, 46, 14, 2, 2, 'F');
  doc.setDrawColor(16, 185, 129); // emerald-500
  doc.setLineWidth(0.3);
  doc.roundedRect(pageWidth - margin - 52, currentY + 6, 46, 14, 2, 2, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text('AUDITORIA OFICIAL', pageWidth - margin - 29, currentY + 11.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(209, 250, 229);
  doc.text('AUTENTICIDADE VÁLIDA', pageWidth - margin - 29, currentY + 16, { align: 'center' });

  currentY += 30;

  // --- SUMMARY / METADATA SECTION ---
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, currentY, contentWidth, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text('TÍTULO DO SORTEIO:', margin + 4, currentY + 6);
  doc.text('ORGANIZADOR:', margin + 4, currentY + 13);
  doc.text('PRÊMIO PRINCIPAL:', margin + 4, currentY + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(raffleTitle.length > 40 ? raffleTitle.slice(0, 38) + '...' : raffleTitle, margin + 42, currentY + 6);
  doc.text(organizer, margin + 42, currentY + 13);
  doc.text(prize, margin + 42, currentY + 20);

  // Column 2 of Metadata
  const col2X = margin + 110;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('CÓDIGO LAUDO:', col2X, currentY + 6);
  doc.text('DATA DO LAUDO:', col2X, currentY + 13);
  doc.text('MODO SORTEIO:', col2X, currentY + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(reportCode, col2X + 32, currentY + 6);
  doc.text(formatFullTimestamp(now), col2X + 32, currentY + 13);
  const modeText = options.settings?.drawMode === 'wheel' ? 'Roleta Proporcional' : options.settings?.drawMode === 'battleroyale' ? 'Battle Royale' : 'Globo Digital (Bilhetes)';
  doc.text(modeText, col2X + 32, currentY + 20);

  currentY += 28;

  // --- CRYPTOGRAPHIC INTEGRITY HASH BOX (SHA-256) ---
  doc.setFillColor(239, 246, 255); // blue-50
  doc.setDrawColor(59, 130, 246); // blue-500
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, currentY, contentWidth, 27, 2, 2, 'FD');

  // Header of Hash Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(29, 78, 216); // blue-700
  doc.text('HASH CRIPTOGRÁFICO DE INTEGRIDADE (SHA-256)', margin + 4, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(16, 185, 129); // emerald-600
  doc.text('PROVA MATEMÁTICA IMUTÁVEL', pageWidth - margin - 4, currentY + 6, { align: 'right' });

  // Monospace Hash string display
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(191, 219, 254); // blue-200
  doc.roundedRect(margin + 4, currentY + 8.5, contentWidth - 8, 8, 1.5, 1.5, 'FD');

  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  // Fit hash or split if needed
  doc.text(hash, margin + 6, currentY + 13.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(
    'Qualquer modificação nos nomes dos participantes, números de bilhetes ou configurações alteraria este hash de 64 caracteres.',
    margin + 4,
    currentY + 22
  );

  currentY += 31;

  // --- AUDIT METRICS STATS BAR ---
  const partCount = options.participantsCount ?? options.settings?.total ?? options.computed?.allocations?.length ?? 0;
  const ticketsCount = options.totalTicketsCount ?? options.computed?.usedCount ?? options.settings?.total ?? 0;
  const winnersCount = options.winners.length;

  const statWidth = (contentWidth - 6) / 3;
  const stats = [
    { label: 'PARTICIPANTES AUDITADOS', val: String(partCount) },
    { label: 'BILHETES / COTAS GERADAS', val: String(ticketsCount) },
    { label: 'VENCEDORES SORTEADOS', val: `${winnersCount} ${winnersCount === 1 ? 'ganhador' : 'ganhadores'}` },
  ];

  stats.forEach((st, idx) => {
    const x = margin + idx * (statWidth + 3);
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.roundedRect(x, currentY, statWidth, 14, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(st.label, x + statWidth / 2, currentY + 5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(st.val, x + statWidth / 2, currentY + 11, { align: 'center' });
  });

  currentY += 18;

  // --- OFFICIAL WINNERS TABLE ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('LISTA OFICIAL DE VENCEDORES DO SORTEIO', margin, currentY + 4);

  currentY += 7;

  // Table Header row
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(margin, currentY, contentWidth, 7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);

  const colX = {
    pos: margin + 3,
    name: margin + 18,
    ticket: margin + 85,
    prize: margin + 112,
    date: margin + 150,
  };

  doc.text('ORDEM', colX.pos, currentY + 4.8);
  doc.text('NOME DO GANHADOR', colX.name, currentY + 4.8);
  doc.text('Nº / BILHETE', colX.ticket, currentY + 4.8);
  doc.text('PRÊMIO', colX.prize, currentY + 4.8);
  doc.text('DATA E HORA DO SORTEIO', colX.date, currentY + 4.8);

  currentY += 7;

  if (options.winners.length === 0) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, currentY, contentWidth, 12, 'FD');

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Nenhum ganhador registrado até o momento da geração deste laudo.', margin + contentWidth / 2, currentY + 7.5, {
      align: 'center',
    });
    currentY += 14;
  } else {
    options.winners.forEach((winner, index) => {
      // Check if we need a new page for long lists of winners
      if (currentY > pageHeight - 45) {
        addFooter(doc.getNumberOfPages());
        doc.addPage();
        currentY = margin;

        // Re-print table header on next page
        doc.setFillColor(30, 41, 59);
        doc.rect(margin, currentY, contentWidth, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text('ORDEM', colX.pos, currentY + 4.8);
        doc.text('NOME DO GANHADOR', colX.name, currentY + 4.8);
        doc.text('Nº / BILHETE', colX.ticket, currentY + 4.8);
        doc.text('PRÊMIO', colX.prize, currentY + 4.8);
        doc.text('DATA E HORA DO SORTEIO', colX.date, currentY + 4.8);
        currentY += 7;
      }

      // Alternate row backgrounds
      const isEven = index % 2 === 0;
      doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, currentY, contentWidth, 8, 'FD');

      // Rank Badge
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      if (index === 0) {
        doc.setTextColor(180, 83, 9); // amber-700
      } else if (index === 1) {
        doc.setTextColor(71, 85, 105); // slate-600
      } else {
        doc.setTextColor(100, 116, 139);
      }
      doc.text(`${index + 1}º Lugar`, colX.pos, currentY + 5.2);

      // Winner Name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      const cleanName = winner.name.length > 32 ? winner.name.slice(0, 30) + '...' : winner.name;
      doc.text(cleanName, colX.name, currentY + 5.2);

      // Ticket Number
      doc.setFont('courier', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(2, 132, 199); // sky-600
      doc.text(`#${winner.number}`, colX.ticket, currentY + 5.2);

      // Prize
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      const prizeTitle = winner.prize || prize || 'Sorteio Oficial';
      const cleanPrize = prizeTitle.length > 24 ? prizeTitle.slice(0, 22) + '...' : prizeTitle;
      doc.text(cleanPrize, colX.prize, currentY + 5.2);

      // Drawn Date & Time
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(formatFullTimestamp(winner.drawnAt), colX.date, currentY + 5.2);

      currentY += 8;
    });
  }

  currentY += 8;

  // --- SIGNATURES & LEGAL DECLARATION ---
  if (currentY > pageHeight - 50) {
    addFooter(doc.getNumberOfPages());
    doc.addPage();
    currentY = margin + 10;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, currentY, contentWidth, 34, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('TERMO DE COMPROMISSO E DECLARAÇÃO DE AUDITORIA', margin + 4, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Atestamos que os resultados contidos neste laudo foram extraídos diretamente do motor algorítmico do GIO DA SORTE, sem intervenção humana discricionária, respeitando os parâmetros matemáticos do algoritmo pseudo-aleatório seguro e o hash de integridade verificado.',
    margin + 4,
    currentY + 11,
    { maxWidth: contentWidth - 8 }
  );

  // Signature lines
  const sigWidth = 65;
  const sig1X = margin + 15;
  const sig2X = pageWidth - margin - sigWidth - 15;
  const sigY = currentY + 28;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(sig1X, sigY, sig1X + sigWidth, sigY);
  doc.line(sig2X, sigY, sig2X + sigWidth, sigY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(organizer, sig1X + sigWidth / 2, sigY + 3.5, { align: 'center' });
  doc.text('Auditor / Testemunha Independente', sig2X + sigWidth / 2, sigY + 3.5, { align: 'center' });

  // Add final footer
  addFooter(doc.getNumberOfPages());

  return doc;
}

/**
 * Generates an official PDF report for TikTok Raffles
 */
export async function generateTikTokPdfReport(options: GenerateTikTokPdfReportOptions): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let currentY = margin;

  const now = new Date();
  const reportCode = `TK-LDO-${Math.floor(100000 + Math.random() * 900000)}-${now.getFullYear()}`;

  const addFooter = (pageNumber: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `GIO DA SORTE · Sorteio no TikTok · Laudo Oficial: ${reportCode}`,
      margin,
      pageHeight - 8
    );
    doc.text(`Página ${pageNumber}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  };

  // HEADER BANNER (TikTok Gradient Theme)
  doc.setFillColor(1, 1, 1); // Dark TikTok Black
  doc.rect(margin, currentY, contentWidth, 26, 'F');

  // Accent TikTok Red/Cyan line
  doc.setFillColor(254, 44, 85); // TikTok Red
  doc.rect(margin, currentY, contentWidth / 2, 2, 'F');
  doc.setFillColor(0, 242, 254); // TikTok Cyan
  doc.rect(margin + contentWidth / 2, currentY, contentWidth / 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text('GIO DA SORTE · TIKTOK', margin + 6, currentY + 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(254, 44, 85);
  doc.text('RELATÓRIO OFICIAL DE AUDITORIA DE COMENTÁRIOS E GANHADORES', margin + 6, currentY + 18);

  // Status Badge
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(pageWidth - margin - 52, currentY + 6, 46, 14, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(0, 242, 254);
  doc.text('VERIFICAÇÃO TIKTOK', pageWidth - margin - 29, currentY + 11.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('COMENTÁRIOS REAIS', pageWidth - margin - 29, currentY + 16, { align: 'center' });

  currentY += 30;

  // Metadata Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, currentY, contentWidth, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('CRIADOR TIKTOK:', margin + 4, currentY + 6);
  doc.text('VÍDEO / LINK:', margin + 4, currentY + 13);
  doc.text('PRÊMIO SORTEADO:', margin + 4, currentY + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(options.authorName || '@criador', margin + 38, currentY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const cleanLink = options.videoUrl || 'Vídeo TikTok';
  doc.text(cleanLink.length > 55 ? cleanLink.slice(0, 52) + '...' : cleanLink, margin + 38, currentY + 13);
  doc.setFont('helvetica', 'bold');
  doc.text(options.prizeName || 'Prêmio Especial', margin + 38, currentY + 20);

  // Date metadata
  const col2X = margin + 120;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('DATA AUDITORIA:', col2X, currentY + 6);
  doc.text('COMENTÁRIOS:', col2X, currentY + 13);
  doc.text('VENCEDORES:', col2X, currentY + 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(formatFullTimestamp(now), col2X + 28, currentY + 6);
  doc.text(String(options.eligibleComments || options.totalComments || 0), col2X + 28, currentY + 13);
  doc.text(String(options.winners.length), col2X + 28, currentY + 20);

  currentY += 28;

  // HASH BOX
  doc.setFillColor(243, 244, 246);
  doc.setDrawColor(209, 213, 219);
  doc.roundedRect(margin, currentY, contentWidth, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(17, 24, 39);
  doc.text('HASH CRIPTOGRÁFICO DE INTEGRIDADE DA LISTA DE COMENTÁRIOS', margin + 4, currentY + 6);

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(margin + 4, currentY + 8.5, contentWidth - 8, 8, 1, 1, 'FD');

  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(options.integrityHash, margin + 6, currentY + 13.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(107, 114, 128);
  doc.text('Certificação imutável: qualquer exclusão, edição ou inserção forjada altera este hash.', margin + 4, currentY + 20.5);

  currentY += 28;

  // WINNERS TABLE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('GANHADORES DO VÍDEO DO TIKTOK', margin, currentY + 4);

  currentY += 7;

  doc.setFillColor(15, 23, 42);
  doc.rect(margin, currentY, contentWidth, 7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);

  doc.text('ORDEM', margin + 3, currentY + 4.8);
  doc.text('USUÁRIO TIKTOK', margin + 20, currentY + 4.8);
  doc.text('COMENTÁRIO PREMIADO', margin + 65, currentY + 4.8);
  doc.text('DATA DO SORTEIO', margin + 145, currentY + 4.8);

  currentY += 7;

  options.winners.forEach((winner, index) => {
    const isEven = index % 2 === 0;
    doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, currentY, contentWidth, 10, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(254, 44, 85);
    doc.text(`${index + 1}º Lugar`, margin + 3, currentY + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    const username = winner.comment?.username || (winner as any).username || '@usuario';
    doc.text(username, margin + 20, currentY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const comment = winner.comment?.text || (winner as any).commentText || '';
    doc.text(comment.length > 55 ? comment.slice(0, 52) + '...' : comment, margin + 65, currentY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(formatFullTimestamp(winner.drawnAt), margin + 145, currentY + 6);

    currentY += 10;
  });

  addFooter(doc.getNumberOfPages());
  return doc;
}
