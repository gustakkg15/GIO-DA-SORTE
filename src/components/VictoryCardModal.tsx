import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Download,
  Copy,
  CheckCircle2,
  Share2,
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
        canvas.className = 'w-full h-auto rounded-xl shadow-2xl border border-[#0131CD]/30';
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
    <div className="fixed inset-0 z-50 bg-[#080D18]/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--gio-border-subtle)] flex items-center justify-between bg-[#111B30] shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#0131CD] flex items-center justify-center text-[#FFFFFF] shrink-0 shadow-md">
              <Trophy className="w-4 h-4 fill-[#FFFFFF]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base sm:text-lg text-[#FFFFFF] truncate">
                Card Comemorativo do Vencedor
              </h3>
              <p className="text-[11px] text-[#A5B1C5] truncate hidden sm:block">
                Gere certificados, personalize títulos e salve no histórico persistente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Tab switchers */}
            <div className="flex items-center p-0.5 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-md font-semibold transition ${
                  activeTab === 'preview' ? 'bg-[#0131CD] text-[#FFFFFF] shadow-sm' : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
                }`}
              >
                Visualizar
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-md font-semibold transition ${
                  activeTab === 'edit' ? 'bg-[#0131CD] text-[#FFFFFF] shadow-sm' : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
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
                    ? 'bg-[#A6C957] text-[#080D18] font-bold shadow-sm'
                    : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Histórico</span>
                {savedCards.length > 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full tabular-nums ${
                      activeTab === 'history'
                        ? 'bg-[#080D18] text-[#A6C957]'
                        : 'bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35'
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
              className="p-1.5 text-[#A5B1C5] hover:text-[#FFFFFF] rounded-lg transition"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Feedback notification banner */}
        {saveFeedback && (
          <div className="bg-[#A6C957]/15 border-b border-[#A6C957]/35 px-4 py-2 text-xs text-[#FFFFFF] flex items-center justify-between gap-2 animate-fade-in shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#A6C957] shrink-0" />
              <span className="font-medium">{saveFeedback}</span>
            </div>
            {activeTab !== 'history' && (
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="text-xs text-[#A6C957] hover:text-[#B5D477] underline font-semibold flex items-center gap-1"
              >
                <span>Ver no Histórico</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Optional Winner Switcher bar when multiple winners exist */}
        {allWinners && allWinners.length > 1 && onSelectWinner && (
          <div className="bg-[#080D18] px-4 py-2 border-b border-[var(--gio-border-subtle)] flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 text-xs">
            <span className="text-[11px] font-bold text-[#A5B1C5] uppercase tracking-wide shrink-0 flex items-center gap-1">
              <Award className="w-3 h-3 text-[#A6C957]" />
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
                      ? 'bg-[#0131CD] text-[#FFFFFF] shadow-sm ring-1 ring-[#0131CD]/40'
                      : 'bg-[#111B30] hover:bg-[#0131CD]/20 text-[#A5B1C5] border border-[var(--gio-border-subtle)]'
                  }`}
                >
                  <span className="text-[10px] opacity-75 tabular-nums">{idx + 1}º</span>
                  <span className="truncate max-w-[120px]">{w.name}</span>
                  <span className="text-[10px] text-[#A6C957] tabular-nums">#{w.number}</span>
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
                  className="flex justify-center min-h-[220px] items-center bg-[#080D18] p-2 sm:p-3 rounded-xl border border-[var(--gio-border-subtle)] shadow-inner"
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
                      ? 'bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35 hover:bg-[#A6C957]/25'
                      : 'bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18]'
                  }`}
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : isCurrentCardSaved ? (
                    <>
                      <BookmarkCheck className="w-4 h-4 text-[#A6C957]" />
                      <span>Salvo no Histórico</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-4 h-4 fill-[#080D18]" />
                      <span>Salvar no Histórico</span>
                    </>
                  )}
                </button>

                {/* Download PNG Button */}
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs sm:text-sm transition shadow-md active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Imagem PNG</span>
                </button>

                {/* Copy to Clipboard Button */}
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#080D18] hover:bg-[#0131CD]/20 text-[#FFFFFF] font-bold text-xs sm:text-sm transition active:scale-95 border border-[var(--gio-border-subtle)]"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#A6C957]" />
                      <span className="text-[#A6C957]">Imagem Copiada!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-[#A6C957]" />
                      <span>Copiar Imagem (Ctrl+V)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick links & Share helpers */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs border-t border-[var(--gio-border-subtle)]">
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="text-[#A5B1C5] hover:text-[#A6C957] flex items-center gap-1.5 transition"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Copiar texto comemorativo formatado para WhatsApp / Discord</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="text-[#A6C957] hover:text-[#B5D477] flex items-center gap-1 font-semibold transition"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Ver todos os {savedCards.length} cards salvos</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: EDIT CARD */}
          {activeTab === 'edit' && (
            <div className="bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl p-4 sm:p-5 space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--gio-border-subtle)]">
                <span className="font-bold text-sm text-[#FFFFFF] flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-[#A6C957]" />
                  <span>Personalizar Textos e Estilo do Card</span>
                </span>
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="text-xs text-[#A5B1C5] hover:text-[#A6C957] flex items-center gap-1 transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Restaurar Padrão</span>
                </button>
              </div>

              {/* Theme Palette Chooser */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#FFFFFF] flex items-center gap-1">
                  <Palette className="w-3.5 h-3.5 text-[#A6C957]" />
                  <span>Tema de Cores do Card:</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomization((c) => ({ ...c, theme: 'sapphire' }))}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                      customization.theme === 'sapphire'
                        ? 'bg-[#0131CD]/20 border-[#0131CD] text-[#FFFFFF] ring-2 ring-[#0131CD]/40'
                        : 'bg-[#111B30] border-[var(--gio-border-subtle)] text-[#A5B1C5] hover:border-[#0131CD]/40'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-[#0131CD]" />
                    <span>Azul Royal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomization((c) => ({ ...c, theme: 'gold' }))}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                      customization.theme === 'gold'
                        ? 'bg-[#A6C957]/15 border-[#A6C957] text-[#FFFFFF] ring-2 ring-[#A6C957]/35'
                        : 'bg-[#111B30] border-[var(--gio-border-subtle)] text-[#A5B1C5] hover:border-[#A6C957]/40'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-[#A6C957]" />
                    <span>Lima Neon</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomization((c) => ({ ...c, theme: 'emerald' }))}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                      customization.theme === 'emerald'
                        ? 'bg-[#A6C957]/15 border-[#A6C957] text-[#FFFFFF] ring-2 ring-[#A6C957]/35'
                        : 'bg-[#111B30] border-[var(--gio-border-subtle)] text-[#A5B1C5] hover:border-[#A6C957]/40'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-[#A6C957]" />
                    <span>Destaque PRO</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomization((c) => ({ ...c, theme: 'midnight' }))}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                      customization.theme === 'midnight'
                        ? 'bg-[#111B30] border-[#A6C957] text-[#FFFFFF] ring-2 ring-[#A6C957]/35'
                        : 'bg-[#111B30] border-[var(--gio-border-subtle)] text-[#A5B1C5] hover:border-[#A6C957]/40'
                    }`}
                  >
                    <span className="w-3.5 h-3.5 rounded-full bg-[#080D18] border border-[#FFFFFF]" />
                    <span>Meia-Noite</span>
                  </button>
                </div>
              </div>

              {/* Form Input Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[#A5B1C5] mb-1 font-medium">Título Superior do Card:</label>
                  <input
                    type="text"
                    value={customization.title}
                    onChange={(e) => setCustomization((c) => ({ ...c, title: e.target.value }))}
                    className="w-full bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-lg p-2 text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30"
                  />
                </div>

                <div>
                  <label className="block text-[#A5B1C5] mb-1 font-medium">Subtítulo / Contexto:</label>
                  <input
                    type="text"
                    value={customization.subtitle}
                    onChange={(e) => setCustomization((c) => ({ ...c, subtitle: e.target.value }))}
                    className="w-full bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-lg p-2 text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30"
                  />
                </div>

                <div>
                  <label className="block text-[#A5B1C5] mb-1 font-medium">Nome do Vencedor:</label>
                  <input
                    type="text"
                    value={customization.winnerName}
                    onChange={(e) => setCustomization((c) => ({ ...c, winnerName: e.target.value }))}
                    placeholder="Nome ou @ do vencedor"
                    className="w-full bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-lg p-2 text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[#A5B1C5] mb-1 font-medium">Prêmio Conquistado:</label>
                  <input
                    type="text"
                    value={customization.prize}
                    onChange={(e) => setCustomization((c) => ({ ...c, prize: e.target.value }))}
                    placeholder="Ex: Smartphone, Pix R$ 100..."
                    className="w-full bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-lg p-2 text-[#A6C957] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[#A5B1C5] mb-1 font-medium">Frase de Parabéns / Mensagem:</label>
                  <input
                    type="text"
                    value={customization.customMessage}
                    onChange={(e) => setCustomization((c) => ({ ...c, customMessage: e.target.value }))}
                    placeholder="Ex: Parabéns por conquistar o 1º lugar!"
                    className="w-full bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-lg p-2 text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30"
                  />
                </div>

                <div>
                  <label className="block text-[#A5B1C5] mb-1 font-medium">Assinatura do Organizador / Canal:</label>
                  <input
                    type="text"
                    value={customization.organizerSignature}
                    onChange={(e) => setCustomization((c) => ({ ...c, organizerSignature: e.target.value }))}
                    placeholder="Ex: GIO DA SORTE / Transmissão ao Vivo"
                    className="w-full bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-lg p-2 text-[#FFFFFF] focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30"
                  />
                </div>
              </div>

              {/* Action buttons inside edit panel */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--gio-border-subtle)]">
                <button
                  type="button"
                  onClick={handleSaveToHistory}
                  disabled={isSaving}
                  className="px-4 py-2 bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18] font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5"
                >
                  <Bookmark className="w-3.5 h-3.5 fill-[#080D18]" />
                  <span>Salvar no Histórico</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="px-4 py-2 bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs rounded-xl transition flex items-center gap-1.5"
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
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#080D18] border border-[var(--gio-border-subtle)] rounded-xl p-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#A5B1C5] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    placeholder="Buscar no histórico por vencedor, prêmio ou bilhete..."
                    className="w-full bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[#FFFFFF] placeholder-[#A5B1C5]/60 focus:outline-none focus:border-[#A6C957] focus:ring-2 focus:ring-[#A6C957]/30"
                  />
                </div>

                <div className="flex items-center gap-2 justify-between sm:justify-end">
                  <button
                    type="button"
                    onClick={handleSaveToHistory}
                    disabled={isSaving}
                    className="px-3 py-1.5 bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18] font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow-sm shrink-0"
                    title="Salvar o card do vencedor exibido no momento"
                  >
                    <Bookmark className="w-3.5 h-3.5 fill-[#080D18]" />
                    <span>Salvar Card Atual</span>
                  </button>

                  {savedCards.length > 0 && (
                    <>
                      {confirmClearHistory ? (
                        <div className="flex items-center gap-1 bg-[#F05262]/15 border border-[#F05262]/40 rounded-lg px-2 py-1">
                          <span className="text-[10px] text-[#F05262] font-bold">Confirmar?</span>
                          <button
                            type="button"
                            onClick={handleClearAllHistory}
                            className="px-2 py-0.5 bg-[#F05262] text-[#FFFFFF] rounded text-[10px] font-bold"
                          >
                            Sim
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmClearHistory(false)}
                            className="px-2 py-0.5 bg-[#111B30] text-[#A5B1C5] rounded text-[10px]"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmClearHistory(true)}
                          className="px-2.5 py-1.5 text-xs text-[#A5B1C5] hover:text-[#F05262] hover:bg-[#111B30] rounded-lg transition flex items-center gap-1 shrink-0"
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
                <div className="bg-[#080D18] border border-dashed border-[var(--gio-border-subtle)] rounded-2xl p-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#A6C957]/15 border border-[#A6C957]/35 flex items-center justify-center text-[#A6C957] mx-auto">
                    <History className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-base text-[#FFFFFF]">
                      {historySearch ? 'Nenhum card encontrado com esse filtro' : 'Nenhum card de vencedor salvo ainda'}
                    </h4>
                    <p className="text-xs text-[#A5B1C5] max-w-md mx-auto">
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
                        className="px-4 py-2 bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18] font-bold text-xs rounded-xl shadow-md transition inline-flex items-center gap-2"
                      >
                        <Bookmark className="w-4 h-4 fill-[#080D18]" />
                        <span>Salvar Card do Vencedor Atual Agora</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {filteredSavedCards.map((card) => {
                    const themeColors = {
                      sapphire: 'border-[#0131CD]/40 bg-[#0131CD]/20 text-[#FFFFFF]',
                      gold: 'border-[#A6C957]/35 bg-[#A6C957]/15 text-[#A6C957]',
                      emerald: 'border-[#A6C957]/35 bg-[#A6C957]/15 text-[#A6C957]',
                      midnight: 'border-[#0131CD]/40 bg-[#111B30] text-[#FFFFFF]',
                    }[card.theme || 'sapphire'];

                    const themeLabels = {
                      sapphire: 'Azul Royal',
                      gold: 'Lima Neon',
                      emerald: 'Destaque PRO',
                      midnight: 'Meia-Noite',
                    }[card.theme || 'sapphire'];

                    const isCopied = copiedCardId === card.id;

                    return (
                      <div
                        key={card.id}
                        className="bg-[#080D18] border border-[var(--gio-border-subtle)] hover:border-[#0131CD]/40 rounded-xl overflow-hidden shadow-lg flex flex-col group transition"
                      >
                        {/* Thumbnail image container */}
                        <div
                          onClick={() => setSelectedHistoricalCard(card)}
                          className="relative aspect-[1200/630] bg-[#111B30] overflow-hidden cursor-pointer group-hover:brightness-105 transition"
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
                          <div className="absolute inset-0 bg-[#080D18]/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[#FFFFFF] text-xs font-bold gap-1.5">
                            <Eye className="w-4 h-4" />
                            <span>Visualizar Card</span>
                          </div>
                        </div>

                        {/* Card metadata content */}
                        <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h4 className="font-bold text-sm text-[#FFFFFF] truncate flex items-center gap-1.5">
                                  <Trophy className="w-3.5 h-3.5 text-[#A6C957] shrink-0" />
                                  <span className="truncate">{card.winnerName}</span>
                                </h4>
                                <div className="text-[11px] text-[#A6C957] font-semibold truncate mt-0.5">
                                  🎁 {card.prize}
                                </div>
                              </div>
                              <span className="font-bold text-xs bg-[#111B30] text-[#A6C957] border border-[#0131CD]/30 px-2 py-0.5 rounded tabular-nums shrink-0">
                                #{card.ticketNumber}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[10px] text-[#A5B1C5] mt-2 tabular-nums">
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
                                <span className="font-mono truncate" title={`Hash: ${card.rosterHash}`}>
                                  · #{card.rosterHash.slice(0, 8)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Toolbar on each item */}
                          <div className="pt-2 border-t border-[var(--gio-border-subtle)] flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleLoadSavedCardIntoEditor(card)}
                                className="px-2.5 py-1 rounded bg-[#111B30] hover:bg-[#0131CD]/20 border border-[var(--gio-border-subtle)] text-[#A5B1C5] hover:text-[#FFFFFF] text-xs font-semibold flex items-center gap-1 transition"
                                title="Carregar no visualizador e editor"
                              >
                                <Sliders className="w-3 h-3 text-[#A6C957]" />
                                <span>Abrir</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => downloadSavedCardImage(card)}
                                className="px-2.5 py-1 rounded bg-[#111B30] hover:bg-[#0131CD]/20 border border-[var(--gio-border-subtle)] text-[#A5B1C5] hover:text-[#FFFFFF] text-xs font-semibold flex items-center gap-1 transition"
                                title="Baixar arquivo PNG do cartão"
                              >
                                <Download className="w-3 h-3 text-[#A6C957]" />
                                <span>Baixar</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => handleCopyHistoryCardImage(card, e)}
                                className="px-2.5 py-1 rounded bg-[#111B30] hover:bg-[#0131CD]/20 border border-[var(--gio-border-subtle)] text-[#A5B1C5] hover:text-[#FFFFFF] text-xs font-semibold flex items-center gap-1 transition"
                                title="Copiar imagem para a área de transferência"
                              >
                                {isCopied ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 text-[#A6C957]" />
                                    <span className="text-[#A6C957]">Copiado</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-[#A6C957]" />
                                    <span>Copiar</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => handleDeleteCard(card.id, e)}
                              className="p-1 rounded text-[#A5B1C5] hover:text-[#F05262] hover:bg-[#F05262]/15 transition"
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
          <div className="fixed inset-0 z-60 bg-[#080D18]/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#111B30] border border-[var(--gio-border-subtle)] rounded-2xl max-w-2xl w-full p-4 sm:p-5 space-y-4 shadow-2xl animate-slide-up">
              <div className="flex items-center justify-between border-b border-[var(--gio-border-subtle)] pb-3">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#A6C957]" />
                  <span className="font-bold text-[#FFFFFF] text-sm tabular-nums">
                    {selectedHistoricalCard.winnerName} · Bilhete #{selectedHistoricalCard.ticketNumber}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHistoricalCard(null)}
                  className="p-1 text-[#A5B1C5] hover:text-[#FFFFFF]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="rounded-xl overflow-hidden border border-[var(--gio-border-subtle)] shadow-xl bg-[#080D18]">
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
                  className="px-3 py-2 bg-[#080D18] hover:bg-[#0131CD]/20 text-[#FFFFFF] border border-[var(--gio-border-subtle)] rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#A6C957]" />
                  <span>Carregar no Editor</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleCopyHistoryCardImage(selectedHistoricalCard, e)}
                    className="px-3.5 py-2 bg-[#080D18] hover:bg-[#0131CD]/20 text-[#FFFFFF] rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-[var(--gio-border-subtle)]"
                  >
                    <Copy className="w-3.5 h-3.5 text-[#A6C957]" />
                    <span>Copiar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSavedCardImage(selectedHistoricalCard)}
                    className="px-4 py-2 bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md"
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
