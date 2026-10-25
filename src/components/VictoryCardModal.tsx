import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Download,
  Copy,
  CheckCircle2,
  Share2,
  Sparkles,
  Image as ImageIcon,
  Sliders,
  Palette,
  RefreshCw,
} from 'lucide-react';
import { Winner, Participant, RaffleSettings } from '../types';
import {
  VictoryCardCustomization,
  renderVictoryCardCanvas,
  downloadVictoryCardPng,
  copyVictoryCardToClipboard,
} from '../utils/cardGenerator';

interface VictoryCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  winner: Winner | null;
  participant: Participant | undefined;
  settings: RaffleSettings;
  rosterHash?: string;
}

export const VictoryCardModal: React.FC<VictoryCardModalProps> = ({
  isOpen,
  onClose,
  winner,
  participant,
  settings,
  rosterHash,
}) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'edit'>('preview');
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Customization state
  const [customization, setCustomization] = useState<VictoryCardCustomization>({
    title: '✦ GIO DA SORTE · CERTIFICADO OFICIAL ✦',
    subtitle: 'SORTEIO PROPORCIONAL POR MOEDAS · RESULTADO AUDITADO',
    winnerName: '',
    ticketNumber: '',
    prize: '',
    customMessage: 'Parabéns pela grande vitória no sorteio!',
    organizerSignature: 'GIO DA SORTE OFICIAL',
    theme: 'sapphire',
  });

  // Sync defaults when winner changes
  useEffect(() => {
    if (winner) {
      setCustomization((prev) => ({
        ...prev,
        winnerName: winner.name,
        ticketNumber: winner.number,
        prize: winner.prize || settings.currentPrize || 'Grande Prêmio',
      }));
    }
  }, [winner, settings.currentPrize]);

  // Re-render canvas whenever customization changes or modal opens
  useEffect(() => {
    if (!isOpen || !winner) return;

    let isMounted = true;
    renderVictoryCardCanvas(winner, participant, settings, rosterHash, customization).then((canvas) => {
      if (isMounted && canvasContainerRef.current) {
        canvasContainerRef.current.innerHTML = '';
        canvas.className = 'w-full h-auto rounded-xl shadow-2xl border border-blue-500/30';
        canvasContainerRef.current.appendChild(canvas);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, winner, participant, settings, rosterHash, customization]);

  if (!isOpen || !winner) return null;

  const handleCopy = async () => {
    const success = await copyVictoryCardToClipboard(winner, participant, settings, rosterHash, customization);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      handleDownload();
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    await downloadVictoryCardPng(winner, participant, settings, rosterHash, customization);
    setDownloading(false);
  };

  const handleCopyText = () => {
    const shareText = `🎉 Parabéns a ${customization.winnerName || winner.name}! Vencedor no GIO DA SORTE com o bilhete #${customization.ticketNumber || winner.number} conquistando o prêmio: ${customization.prize || winner.prize}! 🏆`;
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleResetDefaults = () => {
    setCustomization({
      title: '✦ GIO DA SORTE · CERTIFICADO OFICIAL ✦',
      subtitle: 'SORTEIO PROPORCIONAL POR MOEDAS · RESULTADO AUDITADO',
      winnerName: winner.name,
      ticketNumber: winner.number,
      prize: winner.prize || settings.currentPrize || 'Grande Prêmio',
      customMessage: 'Parabéns pela grande vitória no sorteio!',
      organizerSignature: 'GIO DA SORTE OFICIAL',
      theme: 'sapphire',
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950 shrink-0">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-sky-400" />
            <h3 className="font-display font-bold text-base sm:text-lg text-white">
              Card Comemorativo do Vencedor
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 bg-slate-900 border border-slate-800 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-md font-semibold transition ${
                  activeTab === 'preview' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Visualizar
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`flex items-center gap-1 px-3 py-1 rounded-md font-semibold transition ${
                  activeTab === 'edit' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Editar Card</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Canvas Live Preview */}
          <div className="space-y-2">
            <div
              ref={canvasContainerRef}
              className="flex justify-center min-h-[220px] items-center bg-slate-950 p-2 sm:p-3 rounded-xl border border-slate-800"
            />
          </div>

          {/* Edit Panel Drawer */}
          {activeTab === 'edit' && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="font-bold text-sm text-white flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-sky-400" />
                  <span>Personalizar Textos e Estilo do Card</span>
                </span>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="text-xs text-slate-400 hover:text-sky-300 flex items-center gap-1 transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Restaurar Padrão</span>
                </button>
              </div>

              {/* Theme Palette Chooser */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Palette className="w-3.5 h-3.5 text-sky-400" />
                  <span>Tema de Cores do Card:</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomization((c) => ({ ...c, theme: 'sapphire' }))}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                      customization.theme === 'sapphire'
                        ? 'bg-blue-600/30 border-blue-400 text-white ring-2 ring-blue-500/50'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-blue-500" />
                    <span>Azul Safira</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomization((c) => ({ ...c, theme: 'gold' }))}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                      customization.theme === 'gold'
                        ? 'bg-amber-600/30 border-amber-400 text-white ring-2 ring-amber-500/50'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-amber-400" />
                    <span>Dourado Imperial</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomization((c) => ({ ...c, theme: 'emerald' }))}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                      customization.theme === 'emerald'
                        ? 'bg-emerald-600/30 border-emerald-400 text-white ring-2 ring-emerald-500/50'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-emerald-400" />
                    <span>Esmeralda</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomization((c) => ({ ...c, theme: 'midnight' }))}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                      customization.theme === 'midnight'
                        ? 'bg-purple-600/30 border-purple-400 text-white ring-2 ring-purple-500/50'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-purple-500" />
                    <span>Meia-Noite</span>
                  </button>
                </div>
              </div>

              {/* Form Input Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Título Superior do Card:</label>
                  <input
                    type="text"
                    value={customization.title}
                    onChange={(e) => setCustomization((c) => ({ ...c, title: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Subtítulo / Contexto:</label>
                  <input
                    type="text"
                    value={customization.subtitle}
                    onChange={(e) => setCustomization((c) => ({ ...c, subtitle: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Nome do Vencedor:</label>
                  <input
                    type="text"
                    value={customization.winnerName}
                    onChange={(e) => setCustomization((c) => ({ ...c, winnerName: e.target.value }))}
                    placeholder="Nome ou @ do vencedor"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-400 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Prêmio Conquistado:</label>
                  <input
                    type="text"
                    value={customization.prize}
                    onChange={(e) => setCustomization((c) => ({ ...c, prize: e.target.value }))}
                    placeholder="Ex: Smartphone, Pix R$ 100..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-400 font-bold text-sky-300"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Frase de Parabéns / Mensagem:</label>
                  <input
                    type="text"
                    value={customization.customMessage}
                    onChange={(e) => setCustomization((c) => ({ ...c, customMessage: e.target.value }))}
                    placeholder="Ex: Parabéns por conquistar o 1º lugar!"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Assinatura do Organizador / Canal:</label>
                  <input
                    type="text"
                    value={customization.organizerSignature}
                    onChange={(e) => setCustomization((c) => ({ ...c, organizerSignature: e.target.value }))}
                    placeholder="Ex: GIO DA SORTE / Transmissão ao Vivo"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-400"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm transition shadow-md shadow-blue-600/30 active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Imagem PNG</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm transition active:scale-95 border border-slate-700"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Copiado para Área de Transferência!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-sky-400" />
                  <span>Copiar Imagem (Ctrl+V)</span>
                </>
              )}
            </button>
          </div>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={handleCopyText}
              className="text-xs text-slate-400 hover:text-sky-300 flex items-center gap-1.5 mx-auto transition"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Copiar texto comemorativo formatado para WhatsApp / Discord</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
