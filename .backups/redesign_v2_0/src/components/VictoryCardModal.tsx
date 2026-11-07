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
  Bookmark,
  BookmarkCheck,
  History,
  Trash2,
  Trophy,
  Search,
  Award,
  Calendar,
  ExternalLink,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { Winner, Participant, RaffleSettings } from '../types';
import {
  VictoryCardCustomization,
  renderVictoryCardCanvas,
  downloadVictoryCardPng,
  copyVictoryCardToClipboard,
  createVictoryCardDataUrl,
} from '../utils/cardGenerator';
import {
  SavedVictoryCard,
  loadSavedVictoryCards,
  saveVictoryCardRecord,
  deleteSavedVictoryCard,
  clearAllSavedVictoryCards,
  downloadSavedCardImage,
  copySavedCardImageToClipboard,
} from '../utils/savedCards';

interface VictoryCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  winner: Winner | null;
  participant: Participant | undefined;
  settings: RaffleSettings;
  rosterHash?: string;
  allWinners?: Winner[];
  onSelectWinner?: (winner: Winner) => void;
}

export const VictoryCardModal: React.FC<VictoryCardModalProps> = ({
  isOpen,
  onClose,
  winner,
  participant,
  settings,
  rosterHash,
  allWinners,
  onSelectWinner,
}) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'edit' | 'history'>('preview');
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Saved cards state
  const [savedCards, setSavedCards] = useState<SavedVictoryCard[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [selectedHistoricalCard, setSelectedHistoricalCard] = useState<SavedVictoryCard | null>(null);

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

  // Load saved cards on modal mount or when opening
  useEffect(() => {
    if (isOpen) {
      setSavedCards(loadSavedVictoryCards());
    }
  }, [isOpen]);

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

  // Check if current card is already saved
  const isCurrentCardSaved = savedCards.some(
    (c) =>
      c.winnerName.toLowerCase() === (customization.winnerName || winner.name).toLowerCase() &&
      String(c.ticketNumber) === String(customization.ticketNumber || winner.number) &&
      c.theme === customization.theme
  );

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

  const handleSaveToHistory = async () => {
    setIsSaving(true);
    try {
      const dataUrl = await createVictoryCardDataUrl(winner, participant, settings, rosterHash, customization);
      const newCard: SavedVictoryCard = {
        id: `card_${winner.id || Date.now()}_${Date.now()}`,
        savedAt: Date.now(),
        winnerName: customization.winnerName || winner.name,
        ticketNumber: customization.ticketNumber || winner.number,
        prize: customization.prize || winner.prize || settings.currentPrize || 'Grande Prêmio',
        drawnAt: winner.drawnAt || new Date().toISOString(),
        theme: customization.theme || 'sapphire',
        imageDataUrl: dataUrl,
        customization: { ...customization },
        rosterHash,
        organizerSignature: customization.organizerSignature || 'GIO DA SORTE OFICIAL',
      };

      const success = saveVictoryCardRecord(newCard);
      if (success) {
        const updated = loadSavedVictoryCards();
        setSavedCards(updated);
        setSaveFeedback('Card salvo com sucesso no Histórico de Vencedores!');
        setTimeout(() => setSaveFeedback(null), 3000);
      } else {
        setSaveFeedback('Não foi possível salvar o card.');
        setTimeout(() => setSaveFeedback(null), 3000);
      }
    } catch (err) {
      console.error('Erro ao salvar no histórico:', err);
      setSaveFeedback('Erro ao capturar a imagem do cartão.');
      setTimeout(() => setSaveFeedback(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCard = (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = deleteSavedVictoryCard(cardId);
    setSavedCards(updated);
    if (selectedHistoricalCard?.id === cardId) {
      setSelectedHistoricalCard(null);
    }
  };

  const handleClearAllHistory = () => {
    clearAllSavedVictoryCards();
    setSavedCards([]);
    setConfirmClearHistory(false);
    setSelectedHistoricalCard(null);
  };

  const handleLoadSavedCardIntoEditor = (card: SavedVictoryCard) => {
    setCustomization({ ...card.customization });
    setSelectedHistoricalCard(null);
    setActiveTab('preview');
    setSaveFeedback(`Card de ${card.winnerName} carregado no visualizador!`);
    setTimeout(() => setSaveFeedback(null), 3000);
  };

  const handleCopyHistoryCardImage = async (card: SavedVictoryCard, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copySavedCardImageToClipboard(card);
    if (ok) {
      setCopiedCardId(card.id);
      setTimeout(() => setCopiedCardId(null), 2500);
    } else {
      downloadSavedCardImage(card);
    }
  };

  // Filter saved cards by query
  const filteredSavedCards = savedCards.filter((c) => {
    const q = historySearch.toLowerCase().trim();
    if (!q) return true;
    return (
      c.winnerName.toLowerCase().includes(q) ||
      String(c.ticketNumber).includes(q) ||
      c.prize.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md">
              <Trophy className="w-4 h-4 fill-white" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-base sm:text-lg text-white truncate">
                Card Comemorativo do Vencedor
              </h3>
              <p className="text-[11px] text-slate-400 truncate hidden sm:block">
                Gere certificados, personalize títulos e salve no histórico persistente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Tab switchers */}
            <div className="flex items-center p-0.5 bg-slate-900 border border-slate-800 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md font-semibold transition ${
                  activeTab === 'preview' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Visualizar
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-md font-semibold transition ${
                  activeTab === 'edit' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Editar Card</span>
                <span className="sm:hidden">Editar</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-md font-semibold transition relative ${
                  activeTab === 'history'
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Histórico</span>
                {savedCards.length > 0 && (
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.2 rounded-full tabular-nums ${
                      activeTab === 'history'
                        ? 'bg-slate-950 text-amber-300'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {savedCards.length}
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Feedback notification banner */}
        {saveFeedback && (
          <div className="bg-emerald-950/90 border-b border-emerald-500/40 px-4 py-2 text-xs text-emerald-200 flex items-center justify-between gap-2 animate-fade-in shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">{saveFeedback}</span>
            </div>
            {activeTab !== 'history' && (
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="text-xs text-emerald-300 hover:text-white underline font-semibold flex items-center gap-1"
              >
                <span>Ver no Histórico</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Optional Winner Switcher bar when multiple winners exist */}
        {allWinners && allWinners.length > 1 && onSelectWinner && (
          <div className="bg-slate-950/80 px-4 py-2 border-b border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 text-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
              <Award className="w-3 h-3 text-sky-400" />
              <span>Ganhadores da Rodada:</span>
            </span>
            {allWinners.map((w, idx) => {
              const isSelected = w.id === winner.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onSelectWinner(w)}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs shrink-0 transition flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm ring-1 ring-sky-300/40'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                  }`}
                >
                  <span className="text-[10px] opacity-75">{idx + 1}º</span>
                  <span className="truncate max-w-[120px]">{w.name}</span>
                  <span className="font-mono text-[10px] text-sky-200">#{w.number}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Canvas Live Preview */}
              <div className="space-y-2">
                <div
                  ref={canvasContainerRef}
                  className="flex justify-center min-h-[220px] items-center bg-slate-950 p-2 sm:p-3 rounded-xl border border-slate-800 shadow-inner"
                />
              </div>

              {/* Primary Actions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                {/* Save to History Button */}
                <button
                  type="button"
                  onClick={handleSaveToHistory}
                  disabled={isSaving}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs sm:text-sm transition shadow-md active:scale-95 ${
                    isCurrentCardSaved
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                      : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-amber-500/20'
                  }`}
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : isCurrentCardSaved ? (
                    <>
                      <BookmarkCheck className="w-4 h-4 text-amber-400" />
                      <span>Salvo no Histórico</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-4 h-4 fill-slate-950" />
                      <span>Salvar no Histórico</span>
                    </>
                  )}
                </button>

                {/* Download PNG Button */}
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm transition shadow-md shadow-blue-600/30 active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Imagem PNG</span>
                </button>

                {/* Copy to Clipboard Button */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs sm:text-sm transition active:scale-95 border border-slate-700"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Imagem Copiada!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-sky-400" />
                      <span>Copiar Imagem (Ctrl+V)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick links & Share helpers */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="text-slate-400 hover:text-sky-300 flex items-center gap-1.5 transition"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Copiar texto comemorativo formatado para WhatsApp / Discord</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold transition"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Ver todos os {savedCards.length} cards salvos</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: EDIT CARD */}
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

              {/* Action buttons inside edit panel */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleSaveToHistory}
                  disabled={isSaving}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
                >
                  <Bookmark className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Salvar no Histórico</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Ver Card Atualizado</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: HISTÓRICO DE VENCEDORES (PERSISTENT SAVED CARDS) */}
          {activeTab === 'history' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* History Search & Toolbar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-xl p-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Buscar no histórico por vencedor, prêmio ou bilhete..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div className="flex items-center gap-2 justify-between sm:justify-end">
                  <button
                    type="button"
                    onClick={handleSaveToHistory}
                    disabled={isSaving}
                    className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow-sm shrink-0"
                    title="Salvar o card do vencedor exibido no momento"
                  >
                    <Bookmark className="w-3.5 h-3.5 fill-slate-950" />
                    <span>Salvar Card Atual</span>
                  </button>

                  {savedCards.length > 0 && (
                    <>
                      {confirmClearHistory ? (
                        <div className="flex items-center gap-1 bg-rose-950/80 border border-rose-800 rounded-lg px-2 py-1">
                          <span className="text-[10px] text-rose-300 font-bold">Confirmar?</span>
                          <button
                            type="button"
                            onClick={handleClearAllHistory}
                            className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold"
                          >
                            Sim
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmClearHistory(false)}
                            className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmClearHistory(true)}
                          className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition flex items-center gap-1 shrink-0"
                          title="Limpar todos os cartões salvos do histórico local"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Limpar Tudo</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* History Content: Empty State vs Cards Grid */}
              {filteredSavedCards.length === 0 ? (
                <div className="bg-slate-950 border border-dashed border-slate-800 rounded-2xl p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                    <History className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-display font-bold text-base text-white">
                      {historySearch ? 'Nenhum card encontrado com esse filtro' : 'Nenhum card de vencedor salvo ainda'}
                    </h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      {historySearch
                        ? 'Tente buscar por outro termo ou limpe o campo de busca.'
                        : 'Salve os certificados dos seus ganhadores para guardá-los permanentemente neste aparelho, mesmo ao fechar ou reabrir o sorteio.'}
                    </p>
                  </div>

                  {!historySearch && (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={handleSaveToHistory}
                        disabled={isSaving}
                        className="px-4 py-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition inline-flex items-center gap-2"
                      >
                        <Bookmark className="w-4 h-4 fill-slate-950" />
                        <span>Salvar Card do Vencedor Atual Agora</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredSavedCards.map((card) => {
                    const themeColors = {
                      sapphire: 'border-blue-500/40 bg-blue-950/20 text-blue-300',
                      gold: 'border-amber-500/40 bg-amber-950/20 text-amber-300',
                      emerald: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300',
                      midnight: 'border-purple-500/40 bg-purple-950/20 text-purple-300',
                    }[card.theme || 'sapphire'];

                    const themeLabels = {
                      sapphire: 'Safira',
                      gold: 'Dourado',
                      emerald: 'Esmeralda',
                      midnight: 'Meia-Noite',
                    }[card.theme || 'sapphire'];

                    const isCopied = copiedCardId === card.id;

                    return (
                      <div
                        key={card.id}
                        className="bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden shadow-lg flex flex-col group transition"
                      >
                        {/* Thumbnail image container */}
                        <div
                          onClick={() => setSelectedHistoricalCard(card)}
                          className="relative aspect-[1200/630] bg-slate-900 overflow-hidden cursor-pointer group-hover:brightness-105 transition"
                          title="Clique para expandir visualização"
                        >
                          <img
                            src={card.imageDataUrl}
                            alt={`Card de ${card.winnerName}`}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          />
                          <div className="absolute top-2 right-2 flex items-center gap-1.5">
                            <span
                              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border backdrop-blur-md ${themeColors}`}
                            >
                              {themeLabels}
                            </span>
                          </div>
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-bold gap-1.5">
                            <Eye className="w-4 h-4" />
                            <span>Visualizar Card</span>
                          </div>
                        </div>

                        {/* Card metadata content */}
                        <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h4 className="font-display font-black text-sm text-white truncate flex items-center gap-1.5">
                                  <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span className="truncate">{card.winnerName}</span>
                                </h4>
                                <div className="text-[11px] text-sky-300 font-semibold truncate mt-0.5">
                                  🎁 {card.prize}
                                </div>
                              </div>
                              <span className="font-mono font-bold text-xs bg-blue-950 text-sky-200 border border-blue-800 px-2 py-0.5 rounded tabular-nums shrink-0">
                                #{card.ticketNumber}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-2">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(card.savedAt).toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {card.rosterHash && (
                                <span className="truncate" title={`Hash: ${card.rosterHash}`}>
                                  · #{card.rosterHash.slice(0, 8)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Toolbar on each item */}
                          <div className="pt-2 border-t border-slate-900 flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleLoadSavedCardIntoEditor(card)}
                                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition"
                                title="Carregar no visualizador e editor"
                              >
                                <Sliders className="w-3 h-3 text-sky-400" />
                                <span>Abrir</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => downloadSavedCardImage(card)}
                                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition"
                                title="Baixar arquivo PNG do cartão"
                              >
                                <Download className="w-3 h-3 text-emerald-400" />
                                <span>Baixar</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => handleCopyHistoryCardImage(card, e)}
                                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1 transition"
                                title="Copiar imagem para a área de transferência"
                              >
                                {isCopied ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400">Copiado</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-sky-400" />
                                    <span>Copiar</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => handleDeleteCard(card.id, e)}
                              className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition"
                              title="Excluir este cartão do histórico"
                              aria-label="Excluir card"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal for viewing a historical card in enlarged preview */}
        {selectedHistoricalCard && (
          <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-4 sm:p-5 space-y-4 shadow-2xl animate-slide-up">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-white text-sm">
                    {selectedHistoricalCard.winnerName} · Bilhete #{selectedHistoricalCard.ticketNumber}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHistoricalCard(null)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="rounded-xl overflow-hidden border border-slate-800 shadow-xl bg-slate-950">
                <img
                  src={selectedHistoricalCard.imageDataUrl}
                  alt={`Card de ${selectedHistoricalCard.winnerName}`}
                  className="w-full h-auto"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleLoadSavedCardIntoEditor(selectedHistoricalCard)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5 text-sky-400" />
                  <span>Carregar no Editor</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleCopyHistoryCardImage(selectedHistoricalCard, e)}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-700"
                  >
                    <Copy className="w-3.5 h-3.5 text-sky-400" />
                    <span>Copiar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSavedCardImage(selectedHistoricalCard)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-blue-600/30"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar PNG</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
