import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Video,
  Play,
  RotateCcw,
  Trophy,
  Users,
  MessageSquare,
  CheckCircle,
  Filter,
  AtSign,
  Search,
  Copy,
  Download,
  Sparkles,
  ExternalLink,
  Trash2,
  AlertCircle,
  Check,
  Upload,
  Clock,
  Volume2,
  VolumeX,
  Code,
  Plus,
  RefreshCw,
  HelpCircle,
  FileText,
} from 'lucide-react';
import {
  TikTokComment,
  TikTokFilterSettings,
  TikTokVideoInfo,
  TikTokWinner,
  RaffleSettings,
} from '../types';
import {
  parseTikTokUrl,
  fetchTikTokVideoDetails,
  fetchTikTokCommentsBatch,
  loadTikTokComments,
  filterComments,
  parseImportedComments,
  SAMPLE_TIKTOK_COMMENTS,
  TIKTOK_BROWSER_CONSOLE_SNIPPET,
  clearTikTokCache,
} from '../utils/tiktok';
import { generateTikTokPdfReport } from '../utils/pdfReport';
import {
  playTick,
  playWinnerFanfare,
  playCountdownTick,
  playCountdownLaunch,
} from '../utils/audio';
import { fireWinnerConfetti } from '../utils/confetti';

interface TikTokRaffleProps {
  settings: RaffleSettings;
  soundEnabled: boolean;
  onToggleSound?: () => void;
  onOpenVictoryCard?: (winner: {
    id: string;
    participantId: string;
    name: string;
    number: number;
    prize: string;
    drawnAt: number;
  }) => void;
}

export const TikTokRaffle: React.FC<TikTokRaffleProps> = ({
  settings,
  soundEnabled,
  onToggleSound,
  onOpenVictoryCard,
}) => {
  // Input & Video State
  const [videoUrl, setVideoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgressMsg, setLoadingProgressMsg] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadSuccessMsg, setLoadSuccessMsg] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<TikTokVideoInfo | null>(null);

  // Comments State
  const [comments, setComments] = useState<TikTokComment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Filters State
  const [filters, setFilters] = useState<TikTokFilterSettings>({
    filterDuplicates: true,
    keyword: '',
    minMentions: 0,
    excludeAuthor: true,
    minCharacters: 0,
  });

  // Draw Configuration
  const [winnerCount, setWinnerCount] = useState<number>(1);
  const [prizeName, setPrizeName] = useState(settings.prizeName || settings.currentPrize || 'Prêmio Especial TikTok');
  const [useCountdown, setUseCountdown] = useState<boolean>(true);

  // Drawing Animation State
  const [isDrawing, setIsDrawing] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const [cyclingComment, setCyclingComment] = useState<TikTokComment | null>(null);

  // Winners State
  const [winners, setWinners] = useState<TikTokWinner[]>([]);
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Modals State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [rawImportText, setRawImportText] = useState('');
  const [isExtractorModalOpen, setIsExtractorModalOpen] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  // Filtered comments computation
  const { eligible, totalEligibleUsers } = useMemo(() => {
    return filterComments(comments, filters, videoInfo?.authorName);
  }, [comments, filters, videoInfo]);

  // Search filtered view of comments
  const displayComments = useMemo(() => {
    if (!searchQuery.trim()) return eligible;
    const query = searchQuery.toLowerCase();
    return eligible.filter(
      (c) =>
        c.username.toLowerCase().includes(query) ||
        (c.nickname && c.nickname.toLowerCase().includes(query)) ||
        c.text.toLowerCase().includes(query)
    );
  }, [eligible, searchQuery]);

  // Load sample TikTok video with comments
  const handleLoadSample = () => {
    setVideoUrl('https://www.tiktok.com/@gio_da_sorte/video/7329482710182740231');
    setVideoInfo({
      url: 'https://www.tiktok.com/@gio_da_sorte/video/7329482710182740231',
      videoId: '7329482710182740231',
      authorName: '@gio_da_sorte',
      authorUrl: 'https://www.tiktok.com/@gio_da_sorte',
      title: '🎁 SORTEIO OFICIAL! Comente marcando seus amigos e concorra ao super prêmio! #sorteio #giodasorte',
      thumbnailUrl: '',
      commentCount: SAMPLE_TIKTOK_COMMENTS.length,
      hasMoreComments: false,
    });
    setComments(SAMPLE_TIKTOK_COMMENTS);
    setLoadError(null);
    setLoadSuccessMsg('Demonstração carregada: 20 comentários de exemplo prontos para testar o sorteio!');
    setTimeout(() => setLoadSuccessMsg(null), 4000);
  };

  // Real comment fetching from URL
  const handleFetchFromUrl = async (e?: React.FormEvent, forceRefresh = false) => {
    if (e) e.preventDefault();
    if (!videoUrl.trim()) {
      setLoadError('Por favor, cole um link de vídeo do TikTok.');
      return;
    }

    const parsed = parseTikTokUrl(videoUrl);
    if (!parsed.isValid) {
      setLoadError('Link do TikTok inválido. Certifique-se de que o link contém tiktok.com (ex: https://www.tiktok.com/@usuario/video/...).');
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setLoadSuccessMsg(null);
    setLoadingProgressMsg(forceRefresh ? 'Atualizando dados diretamente do TikTok (ignorando cache)...' : 'Conectando ao TikTok e buscando vídeo...');

    try {
      const result = await loadTikTokComments(parsed.cleanUrl || videoUrl, {
        maxPages: 3, // Initial pull: up to ~150 comments
        forceRefresh,
        onProgress: (msg, currentCount) => {
          setLoadingProgressMsg(currentCount > 0 ? `${msg} (${currentCount} comentários até agora)` : msg);
        },
      });

      setVideoInfo(result.videoInfo);

      if (result.comments.length > 0) {
        setComments(result.comments);
        setLoadSuccessMsg(
          result.fromCache
            ? `⚡ ${result.comments.length} comentários recuperados do cache temporário! (${result.totalCommentsInVideo ? `${result.totalCommentsInVideo} no total do vídeo` : ''})`
            : `🎉 ${result.comments.length} comentários reais carregados com sucesso do TikTok! (${result.totalCommentsInVideo ? `${result.totalCommentsInVideo} no total do vídeo` : ''})`
        );
      } else {
        // Video was found, but 0 comments returned
        setLoadError(
          'O vídeo foi localizado, mas não retornou comentários públicos (podem estar desativados ou bloqueados pelo criador). Você pode colar os comentários ou usar nosso Extrator de 1-Clique!'
        );
      }
    } catch (err: any) {
      console.warn('Load comments notice:', err);

      // Attempt fallback to at least show video info
      try {
        const fallbackInfo = await fetchTikTokVideoDetails(parsed.cleanUrl || videoUrl, { forceRefresh });
        if (fallbackInfo) {
          setVideoInfo(fallbackInfo);
        }
      } catch {
        // ignore
      }

      setLoadError(
        'Não foi possível extrair comentários automaticamente deste link (o TikTok pode ter limitado temporariamente o acesso direto a este vídeo). Use o botão "Colar / Importar Lista" ou o "Extrator de 1-Clique" para carregar seus comentários!'
      );
    } finally {
      setIsLoading(false);
      setLoadingProgressMsg(null);
    }
  };

  // Load more comments from the next page
  const handleLoadMoreComments = async () => {
    if (!videoInfo || !videoInfo.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setLoadError(null);

    try {
      const batch = await fetchTikTokCommentsBatch(videoUrl, Number(videoInfo.nextCursor), 50);
      if (batch.comments.length > 0) {
        const seenIds = new Set(comments.map((c) => c.id));
        const newComments = [...comments];
        for (const c of batch.comments) {
          if (!seenIds.has(c.id)) {
            seenIds.add(c.id);
            newComments.push(c);
          }
        }

        setComments(newComments);
        setVideoInfo((prev) =>
          prev
            ? {
                ...prev,
                hasMoreComments: batch.hasMore,
                nextCursor: batch.nextCursor,
              }
            : null
        );
        setLoadSuccessMsg(`+${batch.comments.length} comentários adicionados! Total carregado: ${newComments.length}`);
        setTimeout(() => setLoadSuccessMsg(null), 3500);
      } else {
        setVideoInfo((prev) => (prev ? { ...prev, hasMoreComments: false } : null));
      }
    } catch (err: any) {
      console.warn(err);
      setLoadError('Não foi possível carregar mais comentários no momento.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Import comments from manual text
  const handleImportSubmit = () => {
    if (!rawImportText.trim()) return;
    const parsed = parseImportedComments(rawImportText);
    if (parsed.length > 0) {
      setComments(parsed);
      setIsImportModalOpen(false);
      setRawImportText('');
      setLoadError(null);
      setLoadSuccessMsg(`Sucesso! ${parsed.length} comentários importados para a lista.`);
      setTimeout(() => setLoadSuccessMsg(null), 4000);
    } else {
      setLoadError('Nenhum comentário detectado no texto informado.');
    }
  };

  // Copy Extractor Script
  const handleCopyExtractorSnippet = () => {
    navigator.clipboard.writeText(TIKTOK_BROWSER_CONSOLE_SNIPPET).then(() => {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 3000);
    });
  };

  // Clear all loaded data
  const handleClearAll = () => {
    clearTikTokCache();
    setComments([]);
    setVideoInfo(null);
    setVideoUrl('');
    setWinners([]);
    setLoadError(null);
    setLoadSuccessMsg(null);
    setIsConfirmingClear(false);
  };

  // Execute drawing logic
  const executeDraw = () => {
    if (eligible.length === 0) return;

    setIsDrawing(true);
    const needed = Math.min(winnerCount, eligible.length);

    // Fast cycling animation through comments
    let cycleCount = 0;
    const maxCycles = 24;
    const interval = setInterval(() => {
      cycleCount++;
      const randIdx = Math.floor(Math.random() * eligible.length);
      setCyclingComment(eligible[randIdx]);
      if (soundEnabled) playTick();

      if (cycleCount >= maxCycles) {
        clearInterval(interval);
        finalizeDraw(needed);
      }
    }, 75);
  };

  const finalizeDraw = (count: number) => {
    // Pick winners randomly without replacement
    const pool = [...eligible];
    const picked: TikTokWinner[] = [];

    for (let i = 0; i < count; i++) {
      if (pool.length === 0) break;
      const index = Math.floor(Math.random() * pool.length);
      const chosenComment = pool.splice(index, 1)[0];

      picked.push({
        id: `tk-win-${Date.now()}-${i + 1}`,
        rank: i + 1,
        comment: chosenComment,
        prize: prizeName || `Prêmio ${i + 1}º Lugar`,
        drawnAt: Date.now(),
      });
    }

    setWinners(picked);
    setIsDrawing(false);
    setCyclingComment(null);

    // Fanfare & Confetti
    if (soundEnabled) {
      playWinnerFanfare();
    }
    fireWinnerConfetti();
  };

  // Countdown timer effect
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startCountdown = () => {
    if (eligible.length === 0) return;
    setCountdownRemaining(10);
    if (soundEnabled) playCountdownTick(10);
  };

  useEffect(() => {
    if (countdownRemaining === null) return;

    if (countdownRemaining === 0) {
      if (soundEnabled) playCountdownLaunch();
      setCountdownRemaining(null);
      executeDraw();
      return;
    }

    countdownIntervalRef.current = setTimeout(() => {
      const next = countdownRemaining - 1;
      setCountdownRemaining(next);
      if (next > 0 && soundEnabled) {
        playCountdownTick(next);
      }
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearTimeout(countdownIntervalRef.current);
    };
  }, [countdownRemaining, soundEnabled]);

  const handleStartDrawFlow = () => {
    if (eligible.length === 0) return;
    if (useCountdown) {
      startCountdown();
    } else {
      executeDraw();
    }
  };

  // Copy winners result
  const handleCopyWinners = () => {
    if (winners.length === 0) return;
    const text = winners
      .map(
        (w) =>
          `🏆 ${w.rank}º Lugar: ${w.comment.username} (${w.prize})\n💬 Comentário: "${w.comment.text}"`
      )
      .join('\n\n');

    const fullSummary = `🎁 VENCEDORES DO SORTEIO TIKTOK - GIO DA SORTE\n${
      videoInfo?.title ? `Vídeo: ${videoInfo.title}\n` : ''
    }Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}\n\n${text}\n\nSorteio auditado e verificado no GIO DA SORTE!`;

    navigator.clipboard.writeText(fullSummary).then(() => {
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2500);
    });
  };

  // Export CSV
  const handleExportCSV = () => {
    if (winners.length === 0) return;
    const rows = [
      ['Posicao', 'Usuario', 'Premio', 'Comentario', 'Data Sorteio'],
      ...winners.map((w) => [
        `${w.rank}º Lugar`,
        w.comment.username,
        w.prize,
        `"${w.comment.text.replace(/"/g, '""')}"`,
        new Date(w.drawnAt).toLocaleString('pt-BR'),
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `vencedores_tiktok_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export PDF with SHA-256 hash
  const handleExportPDF = async () => {
    if (winners.length === 0) return;
    try {
      const canonical = {
        videoUrl,
        commentCount: comments.length,
        winners: winners.map((w) => ({ u: w.comment.username, r: w.rank, d: w.drawnAt })),
      };
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(canonical)));
      const integrityHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

      const doc = await generateTikTokPdfReport({
        videoTitle: videoInfo?.title || 'Sorteio TikTok',
        videoUrl: videoUrl,
        authorName: videoInfo?.authorName || '@criador',
        prizeName,
        integrityHash,
        winners,
        totalComments: comments.length,
        eligibleComments: eligible.length,
      });

      doc.save(`laudo_sorteio_tiktok_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error('Erro ao exportar PDF do TikTok:', e);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Hero Banner with TikTok Style Neon Glow */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-gradient-to-br from-[#00F2FE]/20 via-[#FE2C55]/20 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-64 h-64 bg-gradient-to-tr from-[#FE2C55]/20 via-[#00F2FE]/20 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-slate-950 border border-slate-800 text-slate-200 shadow-inner">
              <span className="w-2 h-2 rounded-full bg-[#FE2C55] animate-pulse" />
              <span className="text-[#00F2FE]">TikTok</span>
              <span className="text-slate-400">|</span>
              <span>Sorteador Oficial por Comentários</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-black tracking-tight text-white">
              Sorteador de Comentários do <span className="bg-gradient-to-r from-[#00F2FE] via-sky-300 to-[#FE2C55] bg-clip-text text-transparent">TikTok</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              Carregamento automático de comentários reais via link, filtros avançados anti-duplicidade (1 chance por @usuário, @amigos marcados, hashtags) e sorteio de múltiplos ganhadores com suspense e efeitos sonoros.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleLoadSample}
              className="px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs sm:text-sm font-semibold text-sky-300 border border-slate-700 hover:border-sky-500/50 transition flex items-center gap-2 shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-[#00F2FE]" />
              <span>Vídeo de Demonstração</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExtractorModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs sm:text-sm font-semibold text-[#00F2FE] border border-slate-700 hover:border-[#00F2FE]/40 transition flex items-center gap-2 shadow-sm"
              title="Copie todos os comentários de qualquer vídeo diretamente do seu navegador"
            >
              <Code className="w-4 h-4 text-[#00F2FE]" />
              <span>Extrator de 1-Clique</span>
            </button>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-xs sm:text-sm font-semibold text-slate-200 border border-slate-700 hover:border-slate-500 transition flex items-center gap-2 shadow-sm"
            >
              <Upload className="w-4 h-4 text-slate-300" />
              <span>Colar / Importar</span>
            </button>
            {comments.length > 0 && (
              isConfirmingClear ? (
                <div className="flex items-center gap-1.5 p-1 bg-rose-950/80 border border-rose-800 rounded-xl text-xs">
                  <span className="text-rose-200 px-2 font-semibold">Limpar tudo?</span>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg transition"
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingClear(false)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                  >
                    Não
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingClear(true)}
                  title="Limpar dados carregados"
                  className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800/60 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* URL Input Form */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 sm:p-6 backdrop-blur-md shadow-lg space-y-4">
        <form onSubmit={handleFetchFromUrl} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label htmlFor="tiktok-url-input" className="block text-sm font-bold text-slate-200">
              Link do Vídeo do TikTok (URL completa ou link curto)
            </label>
            <span className="text-xs text-slate-400">
              Suporta: <b>tiktok.com/@user/video/...</b>, <b>vm.tiktok.com/...</b> e <b>vt.tiktok.com/...</b>
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Video className="w-5 h-5 text-[#FE2C55]" />
              </div>
              <input
                id="tiktok-url-input"
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Ex: https://www.tiktok.com/@tiktok/video/7106594312292453675 ou https://vm.tiktok.com/..."
                className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-700 focus:border-[#00F2FE] focus:ring-2 focus:ring-[#00F2FE]/20 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 transition"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !videoUrl.trim()}
              className="px-6 py-3 bg-gradient-to-r from-[#00F2FE] to-[#FE2C55] hover:from-[#38f8ff] hover:to-[#ff4369] disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black text-sm rounded-xl transition shadow-lg shadow-[#FE2C55]/20 flex items-center justify-center gap-2 shrink-0 active:scale-95"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Carregando Comentários...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 text-slate-950" />
                  <span>Carregar Comentários Reais</span>
                </>
              )}
            </button>
          </div>

          {/* Real-time Progress Bar during live fetching */}
          {isLoading && loadingProgressMsg && (
            <div className="flex items-center gap-2 p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl text-xs sm:text-sm text-sky-300 animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-[#00F2FE] shrink-0" />
              <span>{loadingProgressMsg}</span>
            </div>
          )}

          {/* Success Message */}
          {loadSuccessMsg && (
            <div className="flex items-center gap-2 p-3 bg-emerald-950/50 border border-emerald-800/80 rounded-xl text-xs sm:text-sm text-emerald-300">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{loadSuccessMsg}</span>
            </div>
          )}

          {/* Error Message with action buttons */}
          {loadError && (
            <div className="p-3.5 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs sm:text-sm text-rose-300 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{loadError}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 pl-6">
                <button
                  type="button"
                  onClick={() => setIsExtractorModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-[#00F2FE] border border-slate-700"
                >
                  ⚡ Usar Extrator de 1-Clique
                </button>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white border border-slate-700"
                >
                  📋 Colar Comentários Manualmente
                </button>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-bold text-sky-300 border border-slate-700"
                >
                  🧪 Testar com Dados de Exemplo
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Video Metadata Preview Card */}
        {videoInfo && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/60">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-14 h-14 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                {videoInfo.thumbnailUrl ? (
                  <img src={videoInfo.thumbnailUrl} alt="Thumbnail do TikTok" className="w-full h-full object-cover" />
                ) : (
                  <Video className="w-6 h-6 text-[#00F2FE]" />
                )}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-white truncate">{videoInfo.authorName}</span>
                  {videoInfo.commentCount !== undefined && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-950/80 text-sky-300 border border-blue-800/50">
                      💬 {videoInfo.commentCount} comentários no TikTok
                    </span>
                  )}
                  {videoInfo.videoId && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      ID: {videoInfo.videoId}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 line-clamp-1">{videoInfo.title || 'Vídeo do TikTok'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {videoInfo.hasMoreComments && (
                <button
                  type="button"
                  onClick={handleLoadMoreComments}
                  disabled={isLoadingMore}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md"
                >
                  {isLoadingMore ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Buscando...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Mais Comentários (+50)</span>
                    </>
                  )}
                </button>
              )}

              {videoInfo.url && (
                <a
                  href={videoInfo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-[#00F2FE] hover:underline flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800"
                >
                  <span>Abrir TikTok</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Sorteio Configuration & Draw Trigger */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[#00F2FE]" />
                <span>Configuração do Sorteio</span>
              </h2>
              {onToggleSound && (
                <button
                  type="button"
                  onClick={onToggleSound}
                  title={soundEnabled ? 'Silenciar som' : 'Ativar som'}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4 text-sky-400" /> : <VolumeX className="w-4 h-4" />}
                </button>
              )}
            </div>

            {/* Number of Winners */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span>Quantidade de Vencedores</span>
                <span className="text-[#00F2FE] font-bold text-sm">{winnerCount} {winnerCount === 1 ? 'Vencedor' : 'Vencedores'}</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 5, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setWinnerCount(num)}
                    className={`py-2 text-xs font-bold rounded-xl transition ${
                      winnerCount === num
                        ? 'bg-gradient-to-r from-[#00F2FE] to-[#FE2C55] text-slate-950 font-black shadow-md'
                        : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Prize Name */}
            <div className="space-y-1.5">
              <label htmlFor="tiktok-prize-input" className="block text-xs font-semibold text-slate-300">
                Nome do Prêmio
              </label>
              <input
                id="tiktok-prize-input"
                type="text"
                value={prizeName}
                onChange={(e) => setPrizeName(e.target.value)}
                placeholder="Ex: iPhone 15, PIX R$ 500, Camiseta Oficial"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-[#00F2FE] rounded-xl text-sm text-slate-100"
              />
            </div>

            {/* Filter Rules Accordion / Card */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#00F2FE]" />
                <span>Regras de Validação & Filtros</span>
              </h3>

              <div className="space-y-2.5 text-xs text-slate-300">
                {/* 1 Entry per User */}
                <label className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/60 cursor-pointer hover:bg-slate-950 transition">
                  <input
                    type="checkbox"
                    checked={filters.filterDuplicates}
                    onChange={(e) => setFilters((f) => ({ ...f, filterDuplicates: e.target.checked }))}
                    className="w-4 h-4 rounded text-[#FE2C55] focus:ring-[#FE2C55] bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">1 chance por usuário (Desduplicar)</span>
                    <p className="text-[11px] text-slate-400">Mesmo que alguém comente várias vezes, concorre só com 1 cupom.</p>
                  </div>
                </label>

                {/* Exclude Creator */}
                <label className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/60 cursor-pointer hover:bg-slate-950 transition">
                  <input
                    type="checkbox"
                    checked={filters.excludeAuthor}
                    onChange={(e) => setFilters((f) => ({ ...f, excludeAuthor: e.target.checked }))}
                    className="w-4 h-4 rounded text-[#FE2C55] focus:ring-[#FE2C55] bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">Excluir comentários do autor do vídeo</span>
                    <p className="text-[11px] text-slate-400">Garante que respostas do criador não entrem no sorteio.</p>
                  </div>
                </label>

                {/* Required Keyword or Hashtag */}
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 space-y-1.5">
                  <span className="font-semibold text-slate-200 block">Palavra-chave ou Hashtag obrigatória</span>
                  <input
                    type="text"
                    value={filters.keyword}
                    onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
                    placeholder="Ex: #sorteio, #giodasorte, eu quero (vazio = qualquer comentário)"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 focus:border-[#00F2FE] rounded-lg text-xs text-slate-100"
                  />
                </div>

                {/* Min Mentions Required */}
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-slate-200 block">Mínimo de amigos marcados (@)</span>
                    <span className="text-[11px] text-slate-400">Exige @amigo no texto do comentário</span>
                  </div>
                  <select
                    value={filters.minMentions}
                    onChange={(e) => setFilters((f) => ({ ...f, minMentions: Number(e.target.value) }))}
                    className="px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 font-bold"
                  >
                    <option value={0}>Nenhum</option>
                    <option value={1}>1 amigo (@)</option>
                    <option value={2}>2 amigos (@)</option>
                    <option value={3}>3 amigos (@)</option>
                  </select>
                </div>

                {/* Countdown 10s Toggle */}
                <label className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/60 cursor-pointer hover:bg-slate-950 transition">
                  <input
                    type="checkbox"
                    checked={useCountdown}
                    onChange={(e) => setUseCountdown(e.target.checked)}
                    className="w-4 h-4 rounded text-[#00F2FE] focus:ring-[#00F2FE] bg-slate-900 border-slate-700"
                  />
                  <div>
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#00F2FE]" />
                      <span>Contagem regressiva de suspense (10 segundos)</span>
                    </span>
                    <p className="text-[11px] text-slate-400">Cria suspense na live antes da revelação do ganhador.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Draw CTA Button */}
            <div className="pt-2">
              <button
                type="button"
                disabled={isDrawing || eligible.length === 0 || countdownRemaining !== null}
                onClick={handleStartDrawFlow}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#00F2FE] via-sky-400 to-[#FE2C55] hover:from-[#38f8ff] hover:to-[#ff4369] disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-display font-black text-base sm:text-lg tracking-tight uppercase shadow-xl shadow-[#FE2C55]/20 hover:shadow-[#00F2FE]/30 transition transform active:scale-95 flex items-center justify-center gap-3"
              >
                {isDrawing ? (
                  <>
                    <div className="w-5 h-5 border-3 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Sorteando Comentário...</span>
                  </>
                ) : countdownRemaining !== null ? (
                  <>
                    <Clock className="w-5 h-5 animate-spin" />
                    <span>Iniciando em {countdownRemaining}s...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-slate-950 text-slate-950" />
                    <span>
                      {winnerCount === 1 ? 'Sortear 1 Vencedor' : `Sortear ${winnerCount} Vencedores`}
                    </span>
                  </>
                )}
              </button>
              {eligible.length === 0 && (
                <p className="text-center text-xs text-amber-400 mt-2">
                  Carregue comentários ou ajuste os filtros para realizar o sorteio.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Stats, Comments Feed & Winners Podium */}
        <div className="lg:col-span-7 space-y-6">
          {/* Winners Card (if drawn) */}
          {winners.length > 0 && (
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border-2 border-[#00F2FE]/50 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F2FE] to-[#FE2C55] flex items-center justify-center text-slate-950 font-black shadow-lg">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">
                      {winners.length === 1 ? 'Vencedor Sorteado!' : `${winners.length} Vencedores Sorteados!`}
                    </h3>
                    <p className="text-xs text-[#00F2FE] font-medium">Sorteio auditado e verificado</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyWinners}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
                  >
                    {copiedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSuccess ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPDF}
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-xs font-bold text-white shadow-md shadow-blue-600/30 transition flex items-center gap-1.5 active:scale-95"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Winners Podium List */}
              <div className="space-y-3">
                {winners.map((winner) => (
                  <div
                    key={winner.id}
                    className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 hover:border-[#00F2FE]/40 transition space-y-2 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black text-xs flex items-center justify-center shadow-md shrink-0">
                          {winner.rank}º
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{winner.comment.username}</span>
                            {winner.comment.nickname && (
                              <span className="text-xs text-slate-400">({winner.comment.nickname})</span>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-[#00F2FE]">{winner.prize}</span>
                        </div>
                      </div>

                      {onOpenVictoryCard && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenVictoryCard({
                              id: winner.id,
                              participantId: winner.comment.id,
                              name: winner.comment.username,
                              number: winner.rank,
                              prize: winner.prize,
                              drawnAt: winner.drawnAt,
                            })
                          }
                          className="px-2.5 py-1 rounded-md bg-blue-600/30 hover:bg-blue-600/50 text-[#00F2FE] text-[11px] font-bold border border-blue-500/30 transition shrink-0"
                        >
                          Cartão VIP
                        </button>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs text-slate-200 italic">
                      "{winner.comment.text}"
                    </div>

                    {winner.comment.mentions.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[#FE2C55]">
                        <AtSign className="w-3 h-3" />
                        <span>Amigos marcados: {winner.comment.mentions.join(', ')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cycling Animation Display while drawing */}
          {isDrawing && cyclingComment && (
            <div className="bg-slate-900 border-2 border-[#FE2C55] rounded-2xl p-6 text-center space-y-3 animate-pulse shadow-2xl shadow-[#FE2C55]/30">
              <span className="text-xs font-bold uppercase tracking-wider text-[#00F2FE]">
                Sorteando entre {eligible.length} comentários...
              </span>
              <div className="text-2xl font-black text-white tracking-tight">{cyclingComment.username}</div>
              <p className="text-xs text-slate-300 italic line-clamp-2 max-w-md mx-auto">
                "{cyclingComment.text}"
              </p>
            </div>
          )}

          {/* Comments Data Grid & Search */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-md shadow-xl space-y-4">
            {/* Header & Stats Badges */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#FE2C55]" />
                  <span>Comentários Carregados</span>
                </h3>
                <p className="text-xs text-slate-400">Lista com validação em tempo real</p>
              </div>

              {/* Metrics Pill */}
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                  Total: <b className="text-white">{comments.length}</b>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-300">
                  Elegíveis: <b className="text-white">{eligible.length}</b>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-blue-950/60 border border-blue-800/60 text-sky-300">
                  Únicos: <b className="text-white">{totalEligibleUsers}</b>
                </span>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por @usuário, nome ou texto do comentário..."
                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-[#00F2FE] rounded-xl text-xs text-slate-100 placeholder:text-slate-500"
              />
            </div>

            {/* Comments Scrollable List */}
            <div className="max-h-[460px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {displayComments.length > 0 ? (
                displayComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/70 hover:border-slate-700 transition space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {comment.avatarUrl ? (
                          <img
                            src={comment.avatarUrl}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover border border-slate-700"
                            onError={(e) => {
                              // If image fails to load, fallback to initial
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#00F2FE]/40 to-[#FE2C55]/40 text-white text-[10px] font-bold flex items-center justify-center">
                            {comment.username.replace('@', '').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="font-bold text-xs text-white">{comment.username}</span>
                        {comment.nickname && (
                          <span className="text-[11px] text-slate-400 truncate max-w-[120px]">
                            {comment.nickname}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        {comment.likes !== undefined && comment.likes > 0 && (
                          <span>❤️ {comment.likes}</span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/40 font-semibold">
                          Elegível
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 leading-snug break-words">
                      {comment.text}
                    </p>

                    {comment.mentions.length > 0 && (
                      <div className="text-[10px] text-[#FE2C55] flex items-center gap-1">
                        <AtSign className="w-2.5 h-2.5" />
                        <span>{comment.mentions.join(' ')}</span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-slate-300">Nenhum comentário na lista</h4>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {comments.length === 0
                        ? 'Cole o link de qualquer vídeo do TikTok acima e clique em "Carregar Comentários Reais" para começar.'
                        : 'Nenhum comentário passou pelos filtros selecionados. Tente relaxar as regras de validação.'}
                    </p>
                  </div>
                  {comments.length === 0 && (
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleLoadSample}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-[#00F2FE] border border-slate-700"
                      >
                        Carregar Exemplo Rápido
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsImportModalOpen(true)}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700"
                      >
                        Colar Comentários
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Load More Button at bottom of list */}
            {videoInfo?.hasMoreComments && comments.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMoreComments}
                  disabled={isLoadingMore}
                  className="px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-xs font-bold text-[#00F2FE] border border-slate-800 hover:border-[#00F2FE]/40 transition flex items-center gap-2 shadow-sm"
                >
                  {isLoadingMore ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-[#00F2FE] border-t-transparent rounded-full animate-spin" />
                      <span>Buscando mais comentários...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Carregar Mais Comentários do TikTok (+50)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 10-Second Suspense Countdown Modal for TikTok Raffle */}
      {countdownRemaining !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
        >
          <div className="relative w-full max-w-md bg-slate-900 border-2 border-[#00F2FE] rounded-3xl p-8 text-center space-y-6 shadow-2xl shadow-[#FE2C55]/30 animate-slide-up">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-950 border border-slate-800 text-[#00F2FE]">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>Sorteio do TikTok Iniciando</span>
              </span>
              <h2 className="text-xl font-bold text-white">{prizeName}</h2>
              <p className="text-xs text-slate-400">
                Sorteando entre {eligible.length} comentários qualificados
              </p>
            </div>

            {/* Glowing Big Counter */}
            <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#00F2FE]/20 to-[#FE2C55]/20 animate-ping opacity-30" />
              <div className="w-32 h-32 rounded-full bg-slate-950 border-4 border-[#FE2C55] flex items-center justify-center shadow-inner">
                <span className="font-display font-black text-6xl text-white">
                  {countdownRemaining}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 italic">
              Preparem os prints e preparem a torcida!
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setCountdownRemaining(null);
                  executeDraw();
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00F2FE] to-[#FE2C55] text-slate-950 font-bold text-xs"
              >
                Pular Contagem
              </button>
              <button
                type="button"
                onClick={() => setCountdownRemaining(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1-Click Extractor Modal for TikTok */}
      {isExtractorModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
        >
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl animate-slide-up">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Code className="w-5 h-5 text-[#00F2FE]" />
                  <span>Extrator de 1-Clique para TikTok</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Extraia 100% dos comentários de qualquer vídeo do TikTok diretamente pelo seu próprio navegador sem bloqueios de API.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExtractorModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Steps */}
            <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#00F2FE] text-slate-950 font-black text-[11px] flex items-center justify-center shrink-0">1</span>
                <span>Abra o vídeo no site do TikTok no computador (role os comentários um pouco para carregar mais).</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#00F2FE] text-slate-950 font-black text-[11px] flex items-center justify-center shrink-0">2</span>
                <span>Pressione <b>F12</b> no teclado (ou clique com botão direito &gt; Inspecionar) e clique na aba <b>Console</b>.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#00F2FE] text-slate-950 font-black text-[11px] flex items-center justify-center shrink-0">3</span>
                <span>Cole o código abaixo e aperte <b>Enter</b>. Ele copia todos os comentários para sua área de transferência!</span>
              </div>
            </div>

            {/* Code Snippet Box */}
            <div className="relative">
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-sky-200 font-mono overflow-x-auto max-h-36">
                {TIKTOK_BROWSER_CONSOLE_SNIPPET}
              </pre>
              <button
                type="button"
                onClick={handleCopyExtractorSnippet}
                className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md"
              >
                {copiedSnippet ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSnippet ? 'Código Copiado!' : 'Copiar Código'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsExtractorModalOpen(false);
                  setIsImportModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700"
              >
                Ir para Colar Comentários
              </button>

              <button
                type="button"
                onClick={() => setIsExtractorModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#00F2FE] to-[#FE2C55] text-slate-950 font-bold text-xs"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Comments Import Modal */}
      {isImportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
        >
          <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl animate-slide-up">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Upload className="w-5 h-5 text-[#00F2FE]" />
                  <span>Importar / Colar Comentários</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Cole os comentários copiados de ferramentas como TikTok Studio, ExportComments ou JSON/CSV.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <label htmlFor="import-textarea" className="font-semibold">
                  Cole a lista (Formato: @usuario: comentario ou usuario,texto ou JSON)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setIsExtractorModalOpen(true);
                  }}
                  className="text-[#00F2FE] hover:underline"
                >
                  Como extrair do TikTok?
                </button>
              </div>
              <textarea
                id="import-textarea"
                rows={8}
                value={rawImportText}
                onChange={(e) => setRawImportText(e.target.value)}
                placeholder={`@maria_silva: Eu quero muito ganhar esse prêmio @joao #sorteio\n@pedro_gamer: Participando da live!\n@carla_costa: Maravilhoso @amiga1 @amiga2`}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 focus:border-[#00F2FE] rounded-xl text-xs text-slate-100 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={!rawImportText.trim()}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#00F2FE] to-[#FE2C55] disabled:opacity-50 text-slate-950 font-bold text-xs"
              >
                Importar Lista
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
