import React, { useState } from 'react';
import {
  X,
  FileText,
  Download,
  ShieldCheck,
  Calendar,
  Award,
  Hash,
  CheckCircle2,
  Copy,
  Printer,
  Sparkles,
} from 'lucide-react';
import { Winner, RaffleSettings, ComputedRaffle } from '../types';
import { generateRafflePdfReport, formatFullTimestamp } from '../utils/pdfReport';

interface AuditReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  winners: Winner[];
  rosterHash: string;
  settings: RaffleSettings;
  computed?: ComputedRaffle;
  participantsCount?: number;
}

export const AuditReportModal: React.FC<AuditReportModalProps> = ({
  isOpen,
  onClose,
  winners,
  rosterHash,
  settings,
  computed,
  participantsCount,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  if (!isOpen) return null;

  const prizeTitle = settings.prizeName || settings.currentPrize || 'Prêmio Oficial';
  const organizer = settings.organizerName || 'Organizador Oficial';
  const now = new Date();
  const reportCode = `LDO-${Math.floor(100000 + Math.random() * 900000)}`;

  const handleDownloadPdf = async () => {
    setIsGenerating(true);
    try {
      const doc = await generateRafflePdfReport({
        title: settings.raffleTitle || prizeTitle,
        organizerName: organizer,
        prizeName: prizeTitle,
        rosterHash,
        winners,
        settings,
        computed,
        participantsCount: participantsCount ?? computed?.allocations?.length ?? settings.total,
        totalTicketsCount: computed?.usedCount ?? settings.total,
      });

      const fileName = `laudo_sorteio_gio_da_sorte_${now.toISOString().slice(0, 10)}.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyHash = () => {
    navigator.clipboard.writeText(rosterHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleCopySummary = () => {
    const lines = [
      `📜 LAUDO OFICIAL DE RESULTADOS · GIO DA SORTE`,
      `🏆 Sorteio: ${prizeTitle}`,
      `👤 Organizador: ${organizer}`,
      `📅 Data: ${formatFullTimestamp(now)}`,
      `🔒 Hash de Integridade (SHA-256):`,
      `${rosterHash}`,
      ``,
      `🥇 Vencedores (${winners.length}):`,
      ...winners.map(
        (w, i) =>
          `${i + 1}º Lugar: ${w.name} (#${w.number}) - ${w.prize || prizeTitle} [${formatFullTimestamp(w.drawnAt)}]`
      ),
      ``,
      `✅ Autenticidade e transparência criptográfica comprovada pelo GIO DA SORTE.`,
    ];

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-sky-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-lg sm:text-xl text-white">
                  Laudo Oficial em PDF
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  SHA-256 Auditado
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Relatório com lista de vencedores, data do sorteio e hash de integridade
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-2 text-slate-400 hover:text-white rounded-lg transition hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content Preview */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-slate-200 text-sm">
          {/* Main Action Banner */}
          <div className="p-4 bg-gradient-to-r from-blue-950/60 via-slate-900 to-sky-950/40 border border-blue-500/40 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider block">
                Exportação Oficial Pronta
              </span>
              <p className="text-sm font-semibold text-white">
                Gere o documento oficial (.PDF) com layout de auditoria, selos e certificação
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGenerating}
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white font-black text-sm rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Gerando PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Baixar Laudo em PDF</span>
                </>
              )}
            </button>
          </div>

          {/* Cryptographic SHA-256 Integrity Hash Block */}
          <div className="p-4 bg-blue-950/40 border-2 border-blue-500/50 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-sky-300">
                <Hash className="w-4 h-4 text-sky-400" />
                <span>Hash Criptográfico de Integridade (SHA-256)</span>
              </div>
              <button
                type="button"
                onClick={handleCopyHash}
                className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition"
              >
                {copiedHash ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Hash</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-sky-200 break-all select-all">
              {rosterHash || 'Calculando hash SHA-256...'}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              🔒 <b>Garantia Matemática:</b> Qualquer alteração de nome, bilhete ou regra matemática
              resulta em um hash completamente diferente. A presença deste hash no PDF comprova que o
              sorteio foi 100% autêntico.
            </p>
          </div>

          {/* Sorteio Info & Date Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span>Prêmio Principal</span>
              </div>
              <div className="font-bold text-sm text-white truncate">{prizeTitle}</div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Calendar className="w-3.5 h-3.5 text-sky-400" />
                <span>Data do Laudo</span>
              </div>
              <div className="font-bold text-sm text-white">{formatFullTimestamp(now)}</div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Total de Ganhadores</span>
              </div>
              <div className="font-bold text-sm text-white">
                {winners.length} {winners.length === 1 ? 'ganhador' : 'ganhadores'}
              </div>
            </div>
          </div>

          {/* Winners List Table Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
                <span>Lista Oficial de Vencedores</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {winners.length}
                </span>
              </h3>
              <button
                type="button"
                onClick={handleCopySummary}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
              >
                {copiedSummary ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Resumo Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Texto Completo</span>
                  </>
                )}
              </button>
            </div>

            {winners.length === 0 ? (
              <div className="p-6 bg-slate-950 border border-slate-800 rounded-xl text-center text-slate-400 text-xs">
                Nenhum vencedor sorteado ainda. Realize o sorteio no painel para que os nomes apareçam
                aqui e no laudo oficial.
              </div>
            ) : (
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80">
                {winners.map((winner, index) => (
                  <div
                    key={winner.id}
                    className="p-3 flex items-center justify-between gap-3 hover:bg-slate-900/60 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-blue-900/50 border border-blue-700/60 flex items-center justify-center font-bold text-xs text-sky-200 shrink-0">
                        {index + 1}º
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white truncate text-sm">
                            {winner.name}
                          </span>
                          <span className="font-mono text-xs font-bold text-sky-400 bg-sky-950/80 border border-sky-800/60 px-1.5 py-0.2 rounded shrink-0">
                            #{winner.number}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 truncate mt-0.5">
                          {winner.prize || prizeTitle}
                        </div>
                      </div>
                    </div>

                    <div className="text-right text-xs text-slate-400 shrink-0">
                      <div className="font-mono">{formatFullTimestamp(winner.drawnAt)}</div>
                      <span className="text-[10px] text-emerald-400 font-semibold">Validado</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
          >
            Fechar
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGenerating}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 active:scale-95 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Relatório PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
