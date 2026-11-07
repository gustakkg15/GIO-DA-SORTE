import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Sparkles,
  Users,
  Filter,
  CheckCircle,
  Trophy,
  AtSign,
  RotateCcw,
  Upload,
  Play,
  Copy,
  Check,
  AlertCircle,
  Download,
  Video,
  ExternalLink,
  Volume2,
  VolumeX,
  Trash2,
  Clock,
  FileText,
  Code,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { TikTokComment, TikTokFilterSettings, TikTokVideoInfo, TikTokWinner, Winner, RaffleSettings } from '../types';
import {
  parseTikTokUrl,
  parseImportedComments,
  validateAndParseCommentsInput,
  mergeImportedCommentsWithoutDuplicates,
  filterComments,
  SAMPLE_TIKTOK_COMMENTS,
  loadTikTokComments,
  fetchTikTokCommentsBatch,
  fetchTikTokVideoDetails,
  clearTikTokCache,
  TIKTOK_BROWSER_CONSOLE_SNIPPET,
} from '../utils/tiktok';
import { getAuthBearerHeaders, getProPlanEntitlement } from '../utils/tiktokLiveService';
import { playTick, playWinnerFanfare, playCountdownTick, playCountdownLaunch } from '../utils/audio';
import { fireWinnerConfetti } from '../utils/confetti';
import { generateTikTokPdfReport } from '../utils/pdfReport';

interface TikTokRaffleProps {
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onOpenVictoryCard?: (winner: Winner) => void;
  settings?: RaffleSettings;
}

const TIKTOK_STORAGE_KEY = 'gio_tiktok_raffle_v1';

export const TikTokRaffle: React.FC<TikTokRaffleProps> = ({
  soundEnabled = true,
  onToggleSound,
  onOpenVictoryCard,
  settings,
}) => {
  // Video & Comments State
  const [videoUrl, setVideoUrl] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(TIKTOK_STORAGE_KEY);
      if (saved) return JSON.parse(saved).videoUrl || '';
    } catch {}
    return '';
  });

  const [videoInfo, setVideoInfo] = useState<TikTokVideoInfo | null>(() => {
    try {
      const saved = localStorage.getItem(TIKTOK_STORAGE_KEY);
      if (saved && JSON.parse(saved).videoInfo) return JSON.parse(saved).videoInfo;
    } catch {}
    return null;
  });

  const [comments, setComments] = useState<TikTokComment[]>(() => {
    try {
      const saved = localStorage.getItem(TIKTOK_STORAGE_KEY);
      if (saved && Array.isArray(JSON.parse(saved).comments)) {
        return JSON.parse(saved).comments;
      }
    } catch {}
    return SAMPLE_TIKTOK_COMMENTS;
  });

  // Loading & Import State
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingProgressMsg, setLoadingProgressMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadSuccessMsg, setLoadSuccessMsg] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExtractorModalOpen, setIsExtractorModalOpen] = useState(false);
  const [rawImportText, setRawImportText] = useState('');
  const [selectedImportFileName, setSelectedImportFileName] = useState<string | null>(null);
  const [importModalError, setImportModalError] = useState<string | null>(null);
  const [importModalInfo, setImportModalInfo] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter & Draw Rules
  const [filters, setFilters] = useState<TikTokFilterSettings>(() => {
    try {
      const saved = localStorage.getItem(TIKTOK_STORAGE_KEY);
      if (saved && JSON.parse(saved).filters) return JSON.parse(saved).filters;
    } catch {}
    return {
      filterDuplicates: true,
      keyword: '',
      minMentions: 0,
      excludeAuthor: true,
      minCharacters: 0,
    };
  });

  const [winnerCount, setWinnerCount] = useState<number>(1);
  const [prizeName, setPrizeName] = useState<string>(
    settings?.prizeName || settings?.currentPrize || 'Prêmio Especial TikTok'
  );
  const [useCountdown, setUseCountdown] = useState<boolean>(true);
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);

  // Sync with global settings prize if updated
  useEffect(() => {
    if (settings?.prizeName) {
      setPrizeName(settings.prizeName);
    } else if (settings?.currentPrize) {
      setPrizeName(settings.currentPrize);
    }
  }, [settings?.prizeName, settings?.currentPrize]);

  // Winners & Drawing Animation State
  const [winners, setWinners] = useState<TikTokWinner[]>(() => {
    try {
      const saved = localStorage.getItem(TIKTOK_STORAGE_KEY);
      if (saved && Array.isArray(JSON.parse(saved).winners)) {
        return JSON.parse(saved).winners;
      }
    } catch {}
    return [];
  });

  const [isDrawing, setIsDrawing] = useState(false);
  const [cyclingComment, setCyclingComment] = useState<TikTokComment | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  // Save to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        TIKTOK_STORAGE_KEY,
        JSON.stringify({
          videoUrl,
          videoInfo,
          comments,
          filters,
          winners,
        })
      );
    } catch (e) {
      console.warn('Erro ao salvar estado do sorteio TikTok:', e);
    }
  }, [videoUrl, videoInfo, comments, filters, winners]);

  // Filtered Eligible Comments
  const { eligible, totalEligibleUsers } = useMemo(() => {
    return filterComments(comments, filters, videoInfo?.authorName);
  }, [comments, filters, videoInfo]);

  // Searched comments for table preview
  const displayComments = useMemo(() => {
    if (!searchQuery.trim()) return eligible;
    const q = searchQuery.toLowerCase();
    return eligible.filter(
      (c) =>
        c.username.toLowerCase().includes(q) ||
        c.text.toLowerCase().includes(q) ||
        (c.nickname && c.nickname.toLowerCase().includes(q))
    );
  }, [eligible, searchQuery]);

  // Load sample video
  const handleLoadSample = () => {
    setLoadError(null);
    setVideoUrl('https://www.tiktok.com/@gio_da_sorte/video/7329482710182740231');
    setVideoInfo({
      url: 'https://www.tiktok.com/@gio_da_sorte/video/7329482710182740231',
      videoId: '7329482710182740231',
      authorName: '@gio_da_sorte',
      authorUrl: 'https://www.tiktok.com/@gio_da_sorte',
      title: 'SORTEIO OFICIAL! Comente marcando seus amigos e concorra ao prêmio! #sorteio #giodasorte',
      thumbnailUrl: '',
      commentCount: SAMPLE_TIKTOK_COMMENTS.length,
      hasMoreComments: false,
    });
    setComments(SAMPLE_TIKTOK_COMMENTS);
    setWinners([]);
    setLoadSuccessMsg('Vídeo de demonstração carregado com 20 comentários.');
    setTimeout(() => setLoadSuccessMsg(null), 4000);
  };

  // Fetch comments from URL via protected backend PRO endpoint
  const handleFetchFromUrl = async (e?: React.FormEvent, forceRefresh = false) => {
    if (e) e.preventDefault();
    if (!videoUrl.trim()) {
      setLoadError('Por favor, cole um link de vídeo do TikTok.');
      return;
    }

    const parsed = parseTikTokUrl(videoUrl);
    if (!parsed.isValid) {
      setLoadError(
        'Link do TikTok inválido. Certifique-se de que o link contém tiktok.com (ex: https://www.tiktok.com/@usuario/video/...).'
      );
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    setLoadSuccessMsg(null);
    setLoadingProgressMsg(
      forceRefresh
        ? 'Atualizando dados diretamente do TikTok via backend PRO (sem cache)...'
        : 'Conectando ao TikTok e buscando vídeo via backend PRO...'
    );

    try {
      const authHeaders = await getAuthBearerHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch('/api/tiktok/pro/comments/extract', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          videoUrl: parsed.cleanUrl || videoUrl,
          maxPages: 3,
          forceRefresh,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            errorData.error ||
              'A extração de comentários requer login Firebase e plano TikTok LIVE PRO ativo no backend.'
          );
        }
        throw new Error(errorData.error || `Erro ${response.status} ao extrair comentários no servidor.`);
      }

      const result = await response.json();
      if (result.videoInfo) {
        setVideoInfo(result.videoInfo);
      }

      if (Array.isArray(result.comments) && result.comments.length > 0) {
        setComments(result.comments);
        setLoadSuccessMsg(
          `${result.comments.length} comentários reais processados com segurança pelo backend PRO!`
        );
      } else {
        setLoadError(
          'O vídeo foi localizado, mas não retornou comentários públicos. Você pode colar os comentários usando "Colar / Importar".'
        );
      }
    } catch (err: any) {
      console.warn('Load comments notice:', err);
      setLoadError(
        err.message ||
          'Não foi possível extrair comentários automaticamente deste link. Certifique-se de possuir o plano PRO ativo.'
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

  // Read .txt or .csv file locally and populate import payload
  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportModalError(null);
    setImportModalInfo(null);
    setSelectedImportFileName(file.name);

    const lowerName = file.name.trim().toLowerCase();
    if (!lowerName.endsWith('.txt') && !lowerName.endsWith('.csv')) {
      setImportModalError('Formato de arquivo inválido. Selecione apenas arquivos .txt ou .csv.');
      e.target.value = '';
      return;
    }

    if (file.size === 0) {
      setImportModalError('O arquivo selecionado está vazio. Escolha um arquivo .txt ou .csv com comentários válidos.');
      setRawImportText('');
      e.target.value = '';
      return;
    }

    try {
      const content = await file.text();
      if (!content.replace(/^\uFEFF/, '').trim()) {
        setImportModalError('O arquivo selecionado está vazio. Escolha um arquivo .txt ou .csv com comentários válidos.');
        setRawImportText('');
        e.target.value = '';
        return;
      }

      const validation = validateAndParseCommentsInput(content);
      if (!validation.valid) {
        setImportModalError(
          validation.error ||
            'Formato inválido: não foi possível identificar comentários válidos neste arquivo.'
        );
        setRawImportText('');
        e.target.value = '';
        return;
      }

      setRawImportText(content);
      setImportModalInfo(
        `Arquivo "${file.name}" carregado localmente: ${validation.comments.length} comentário(s) válido(s) identificado(s)${
          validation.headerSkipped ? ' (cabeçalho CSV ignorado automaticamente)' : ''
        }. Clique em "Importar Lista" para confirmar.`
      );
    } catch {
      setImportModalError('Não foi possível ler o arquivo selecionado. Verifique se está em texto UTF-8.');
    } finally {
      e.target.value = '';
    }
  };

  // Import comments from manual text or uploaded .txt/.csv file via protected backend PRO endpoint
  const handleImportSubmit = async () => {
    setImportModalError(null);
    setImportModalInfo(null);

    const validation = validateAndParseCommentsInput(rawImportText);
    if (!validation.valid) {
      const msg =
        validation.error ||
        'Formato inválido: nenhum comentário válido foi encontrado no texto ou arquivo informado.';
      setImportModalError(msg);
      setLoadError(msg);
      return;
    }

    try {
      const authHeaders = await getAuthBearerHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch('/api/tiktok/pro/comments/import', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ rawInput: rawImportText }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error || 'A importação de comentários requer autenticação e plano PRO ativo no backend.'
        );
      }

      const result = await response.json();
      if (Array.isArray(result.comments) && result.comments.length > 0) {
        const mergeOutcome = mergeImportedCommentsWithoutDuplicates(comments, result.comments);
        setComments(mergeOutcome.merged);
        setIsImportModalOpen(false);
        setRawImportText('');
        setSelectedImportFileName(null);
        setImportModalError(null);
        setImportModalInfo(null);
        setLoadError(null);

        if (mergeOutcome.addedCount === 0 && mergeOutcome.duplicatesSkipped > 0) {
          setLoadSuccessMsg(
            `Importação concluída: todos os ${mergeOutcome.duplicatesSkipped} participante(s) enviados já estavam na lista (duplicações evitadas).`
          );
        } else if (mergeOutcome.duplicatesSkipped > 0) {
          setLoadSuccessMsg(
            `Sucesso! ${mergeOutcome.addedCount} novo(s) participante(s) importado(s) pelo backend PRO (${mergeOutcome.duplicatesSkipped} duplicado(s) ignorado(s)). Total: ${mergeOutcome.merged.length}.`
          );
        } else {
          setLoadSuccessMsg(
            `Sucesso! ${mergeOutcome.addedCount} comentário(s) importado(s) e validado(s) pelo backend PRO.`
          );
        }
        setTimeout(() => setLoadSuccessMsg(null), 4500);
      } else {
        const msg = 'Nenhum comentário válido detectado no conteúdo enviado.';
        setImportModalError(msg);
        setLoadError(msg);
      }
    } catch (err: any) {
      const msg = err.message || 'Falha ao importar comentários via backend.';
      setImportModalError(msg);
      setLoadError(msg);
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

  // Execute drawing logic (validated against PRO plan and executed via backend CSPRNG)
  const executeDraw = () => {
    if (eligible.length === 0) return;

    const entitlement = getProPlanEntitlement();
    if (!entitlement.active || entitlement.tier !== 'PRO' || entitlement.statusState !== 'ACTIVE') {
      setLoadError(
        'O Sorteio por Comentários TikTok é exclusivo para assinantes do plano TikTok LIVE PRO ativo.'
      );
      return;
    }

    setIsDrawing(true);
    setLoadError(null);
    const needed = Math.min(winnerCount, eligible.length);

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

  const finalizeDraw = async (count: number) => {
    try {
      const authHeaders = await getAuthBearerHeaders({ 'Content-Type': 'application/json' });
      const response = await fetch('/api/tiktok/pro/comments/draw', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          comments,
          filters,
          authorName: videoInfo?.authorName,
          winnerCount: count,
          prizeName: prizeName || `Prêmio Especial TikTok`,
          videoUrl,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error || 'Falha ao executar o sorteio com CSPRNG no backend protegido.'
        );
      }

      const result = await response.json();
      setWinners(result.winners || []);
      setIsDrawing(false);
      setCyclingComment(null);

      if (soundEnabled) {
        playWinnerFanfare();
      }
      fireWinnerConfetti();
    } catch (err: any) {
      setIsDrawing(false);
      setCyclingComment(null);
      setLoadError(err.message || 'Erro ao processar sorteio no backend.');
    }
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
          `${w.rank}º Lugar: ${w.comment.username} (${w.prize})\nComentário: "${w.comment.text}"`
      )
      .join('\n\n');

    const fullSummary = `VENCEDORES DO SORTEIO POR COMENTÁRIOS - GIO DA SORTE\n${
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
      const integrityHash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

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
    <div className="space-y-6 animate-fade-in min-w-0 overflow-x-hidden">
      {/* Top Header & Quick Actions Card */}
      <div className="rounded-xl bg-[#101F3D] border border-[#182943] p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wider bg-[#050D20] border border-[#182943] text-[#00A9FF]">
              <MessageSquare className="w-3.5 h-3.5 text-[#F5B942]" />
              <span>Sorteio Oficial por Comentários</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-[#F8FAFC]">
              Sorteador de Comentários do TikTok
            </h2>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
              Carregue comentários reais via link do vídeo, aplique filtros anti-duplicidade (1 chance por @usuário, palavras-chave e menções) e sorteie com certificado SHA-256.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleLoadSample}
              className="min-h-[38px] px-3.5 py-2 rounded-lg bg-[#050D20] hover:bg-[#182943] text-xs font-semibold text-[#F8FAFC] border border-[#182943] transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#F5B942]" />
              <span>Vídeo de Demonstração</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExtractorModalOpen(true)}
              className="min-h-[38px] px-3.5 py-2 rounded-lg bg-[#050D20] hover:bg-[#182943] text-xs font-semibold text-[#00A9FF] border border-[#182943] transition flex items-center gap-1.5"
              title="Copie todos os comentários de qualquer vídeo diretamente do seu navegador"
            >
              <Code className="w-3.5 h-3.5 text-[#00A9FF]" />
              <span>Extrator de 1-Clique</span>
            </button>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="min-h-[38px] px-3.5 py-2 rounded-lg bg-[#050D20] hover:bg-[#182943] text-xs font-semibold text-[#F8FAFC] border border-[#182943] transition flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-[#94A3B8]" />
              <span>Colar / Importar</span>
            </button>
            {comments.length > 0 &&
              (isConfirmingClear ? (
                <div className="flex items-center gap-1.5 p-1 bg-[#F05262]/10 border border-[#F05262]/40 rounded-lg text-xs">
                  <span className="text-[#F05262] px-2 font-semibold">Limpar tudo?</span>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="px-2.5 py-1 bg-[#F05262] text-[#F8FAFC] font-semibold rounded transition"
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingClear(false)}
                    className="px-2 py-1 bg-[#050D20] text-[#94A3B8] hover:text-[#F8FAFC] rounded transition"
                  >
                    Não
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingClear(true)}
                  title="Limpar dados carregados"
                  className="min-h-[38px] p-2 rounded-lg bg-[#050D20] hover:bg-[#F05262]/15 text-[#94A3B8] hover:text-[#F05262] border border-[#182943] transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ))}
          </div>
        </div>
      </div>

      {/* URL Input Form */}
      <div className="bg-[#101F3D] border border-[#182943] rounded-xl p-4 sm:p-6 space-y-4">
        <form onSubmit={handleFetchFromUrl} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label htmlFor="tiktok-url-input" className="block text-sm font-semibold text-[#F8FAFC]">
              Link do Vídeo do TikTok (URL completa ou link curto)
            </label>
            <span className="text-xs text-[#94A3B8]">
              Compatível com <strong className="text-[#F8FAFC]">tiktok.com/@user/video/...</strong> e <strong className="text-[#F8FAFC]">vm.tiktok.com/...</strong>
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#94A3B8]">
                <Video className="w-4 h-4 text-[#00A9FF]" />
              </div>
              <input
                id="tiktok-url-input"
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="Ex: https://www.tiktok.com/@usuario/video/7106594312292453675"
                className="w-full pl-10 pr-4 py-2.5 bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none rounded-lg text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 transition"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !videoUrl.trim()}
              className="min-h-[42px] px-5 py-2.5 bg-[#0866F5] hover:bg-[#00A9FF] disabled:opacity-50 disabled:cursor-not-allowed text-[#F8FAFC] font-semibold text-sm rounded-lg transition flex items-center justify-center gap-2 shrink-0 shadow-sm shadow-[#0866F5]/25"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#F8FAFC] border-t-transparent rounded-full animate-spin" />
                  <span>Carregando Comentários...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Carregar Comentários Reais</span>
                </>
              )}
            </button>
          </div>

          {/* Real-time Progress Bar during live fetching */}
          {isLoading && loadingProgressMsg && (
            <div className="flex items-center gap-2 p-3 bg-[#050D20] border border-[#00A9FF]/40 rounded-lg text-xs sm:text-sm text-[#F8FAFC]">
              <RefreshCw className="w-4 h-4 animate-spin text-[#00A9FF] shrink-0" />
              <span>{loadingProgressMsg}</span>
            </div>
          )}

          {/* Success Message */}
          {loadSuccessMsg && (
            <div className="flex items-center gap-2 p-3 bg-[#20C997]/15 border border-[#20C997]/40 rounded-lg text-xs sm:text-sm text-[#20C997]">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{loadSuccessMsg}</span>
            </div>
          )}

          {/* Error Message with action buttons */}
          {loadError && (
            <div className="p-3.5 bg-[#F05262]/10 border border-[#F05262]/40 rounded-lg text-xs sm:text-sm text-[#F05262] space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{loadError}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 pl-6">
                <button
                  type="button"
                  onClick={() => setIsExtractorModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#050D20] hover:bg-[#182943] text-xs font-semibold text-[#00A9FF] border border-[#182943]"
                >
                  Usar Extrator de 1-Clique
                </button>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#050D20] hover:bg-[#182943] text-xs font-semibold text-[#F8FAFC] border border-[#182943]"
                >
                  Colar Comentários Manualmente
                </button>
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="px-3 py-1.5 rounded-lg bg-[#050D20] hover:bg-[#182943] text-xs font-semibold text-[#F5B942] border border-[#182943]"
                >
                  Testar com Dados de Exemplo
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Video Metadata Preview Card */}
        {videoInfo && (
          <div className="mt-4 pt-4 border-t border-[#182943] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#050D20] rounded-xl p-3.5 border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-lg bg-[#101F3D] border border-[#182943] flex items-center justify-center overflow-hidden shrink-0">
                {videoInfo.thumbnailUrl ? (
                  <img src={videoInfo.thumbnailUrl} alt="Thumbnail do TikTok" className="w-full h-full object-cover" />
                ) : (
                  <Video className="w-5 h-5 text-[#00A9FF]" />
                )}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-[#F8FAFC] truncate">{videoInfo.authorName}</span>
                  {videoInfo.commentCount !== undefined && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[#101F3D] text-[#00A9FF] border border-[#182943] tabular-nums">
                      {videoInfo.commentCount} comentários no vídeo
                    </span>
                  )}
                  {videoInfo.videoId && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#101F3D] text-[#94A3B8] tabular-nums">
                      ID: {videoInfo.videoId}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#94A3B8] line-clamp-1">{videoInfo.title || 'Vídeo do TikTok'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {videoInfo.hasMoreComments && (
                <button
                  type="button"
                  onClick={handleLoadMoreComments}
                  disabled={isLoadingMore}
                  className="px-3 py-1.5 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] disabled:opacity-50 text-[#F8FAFC] font-semibold text-xs flex items-center gap-1.5"
                >
                  {isLoadingMore ? (
                    <>
                      <div className="w-3 h-3 border-2 border-[#F8FAFC] border-t-transparent rounded-full animate-spin" />
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
                  className="text-xs font-medium text-[#F8FAFC] hover:text-[#00A9FF] flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg bg-[#101F3D] border border-[#182943]"
                >
                  <span>Abrir Vídeo</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Sorteio Configuration & Draw Trigger */}
        <div className="lg:col-span-5 space-y-6 min-w-0">
          <div className="bg-[#101F3D] border border-[#182943] rounded-xl p-5 sm:p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#182943]">
              <h2 className="text-base sm:text-lg font-semibold text-[#F8FAFC] flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[#F5B942]" />
                <span>Regras e Sorteio</span>
              </h2>
              {onToggleSound && (
                <button
                  type="button"
                  onClick={onToggleSound}
                  title={soundEnabled ? 'Silenciar som' : 'Ativar som'}
                  className="p-1.5 rounded-lg bg-[#050D20] border border-[#182943] text-[#94A3B8] hover:text-[#F8FAFC]"
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4 text-[#00A9FF]" /> : <VolumeX className="w-4 h-4" />}
                </button>
              )}
            </div>

            {/* Number of Winners */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-[#94A3B8]">
                <span>Quantidade de Vencedores</span>
                <span className="text-[#F5B942] font-semibold tabular-nums">
                  {winnerCount} {winnerCount === 1 ? 'Vencedor' : 'Vencedores'}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 5, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setWinnerCount(num)}
                    className={`py-2 text-xs font-semibold rounded-lg transition tabular-nums ${
                      winnerCount === num
                        ? 'bg-[#0866F5] text-[#F8FAFC] font-bold shadow-sm shadow-[#0866F5]/25'
                        : 'bg-[#050D20] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#182943]'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Prize Name */}
            <div className="space-y-1.5">
              <label htmlFor="tiktok-prize-input" className="block text-xs font-medium text-[#94A3B8]">
                Nome do Prêmio
              </label>
              <input
                id="tiktok-prize-input"
                type="text"
                value={prizeName}
                onChange={(e) => setPrizeName(e.target.value)}
                placeholder="Ex: PIX R$ 500,00 ou Prêmio Especial"
                className="w-full px-3.5 py-2.5 bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none rounded-lg text-sm text-[#F8FAFC]"
              />
            </div>

            {/* Filter Rules */}
            <div className="space-y-3 pt-3 border-t border-[#182943]">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8] flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#00A9FF]" />
                <span>Filtros de Qualificação</span>
              </h3>

              <div className="space-y-2.5 text-xs text-[#F8FAFC]">
                {/* 1 Entry per User */}
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#050D20] border border-[#182943] cursor-pointer hover:border-[#00A9FF]/40 transition">
                  <input
                    type="checkbox"
                    checked={filters.filterDuplicates}
                    onChange={(e) => setFilters((f) => ({ ...f, filterDuplicates: e.target.checked }))}
                    className="w-4 h-4 rounded text-[#0866F5] focus:ring-[#00A9FF] bg-[#101F3D] border-[#182943]"
                  />
                  <div>
                    <span className="font-semibold text-[#F8FAFC]">1 chance por @usuário (Desduplicar)</span>
                    <p className="text-[11px] text-[#94A3B8]">Mesmo comentando várias vezes, cada perfil concorre uma única vez.</p>
                  </div>
                </label>

                {/* Exclude Creator */}
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#050D20] border border-[#182943] cursor-pointer hover:border-[#00A9FF]/40 transition">
                  <input
                    type="checkbox"
                    checked={filters.excludeAuthor}
                    onChange={(e) => setFilters((f) => ({ ...f, excludeAuthor: e.target.checked }))}
                    className="w-4 h-4 rounded text-[#0866F5] focus:ring-[#00A9FF] bg-[#101F3D] border-[#182943]"
                  />
                  <div>
                    <span className="font-semibold text-[#F8FAFC]">Excluir comentários do autor do vídeo</span>
                    <p className="text-[11px] text-[#94A3B8]">Impede que respostas do próprio criador sejam sorteadas.</p>
                  </div>
                </label>

                {/* Required Keyword or Hashtag */}
                <div className="p-2.5 rounded-lg bg-[#050D20] border border-[#182943] space-y-1.5">
                  <span className="font-semibold text-[#F8FAFC] block">Palavra-chave ou Hashtag obrigatória</span>
                  <input
                    type="text"
                    value={filters.keyword}
                    onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
                    placeholder="Ex: #sorteio, eu quero (vazio = qualquer comentário)"
                    className="w-full px-3 py-1.5 bg-[#101F3D] border border-[#182943] focus:border-[#00A9FF] focus:outline-none rounded-lg text-xs text-[#F8FAFC]"
                  />
                </div>

                {/* Min Mentions Required */}
                <div className="p-2.5 rounded-lg bg-[#050D20] border border-[#182943] flex items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-[#F8FAFC] block">Mínimo de amigos marcados (@)</span>
                    <span className="text-[11px] text-[#94A3B8]">Exige @amigo no comentário</span>
                  </div>
                  <select
                    value={filters.minMentions}
                    onChange={(e) => setFilters((f) => ({ ...f, minMentions: Number(e.target.value) }))}
                    className="px-2.5 py-1.5 bg-[#101F3D] border border-[#182943] rounded-lg text-xs text-[#F8FAFC] font-semibold"
                  >
                    <option value={0}>Nenhum</option>
                    <option value={1}>1 amigo (@)</option>
                    <option value={2}>2 amigos (@)</option>
                    <option value={3}>3 amigos (@)</option>
                  </select>
                </div>

                {/* Countdown 10s Toggle */}
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#050D20] border border-[#182943] cursor-pointer hover:border-[#00A9FF]/40 transition">
                  <input
                    type="checkbox"
                    checked={useCountdown}
                    onChange={(e) => setUseCountdown(e.target.checked)}
                    className="w-4 h-4 rounded text-[#0866F5] focus:ring-[#00A9FF] bg-[#101F3D] border-[#182943]"
                  />
                  <div>
                    <span className="font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#F5B942]" />
                      <span>Contagem regressiva de 10 segundos</span>
                    </span>
                    <p className="text-[11px] text-[#94A3B8]">Exibe contagem antes de revelar o comentário vencedor.</p>
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
                className="w-full min-h-[48px] py-3.5 px-6 rounded-xl bg-[#0866F5] hover:bg-[#00A9FF] disabled:bg-[#101F3D] disabled:text-[#94A3B8] disabled:border disabled:border-[#182943] disabled:opacity-60 disabled:cursor-not-allowed text-[#F8FAFC] font-semibold text-sm sm:text-base transition flex items-center justify-center gap-2.5 shadow-md shadow-[#0866F5]/25"
              >
                {isDrawing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-[#F8FAFC] border-t-transparent rounded-full animate-spin" />
                    <span>Sorteando Comentário...</span>
                  </>
                ) : countdownRemaining !== null ? (
                  <>
                    <Clock className="w-5 h-5 animate-spin" />
                    <span>Iniciando em {countdownRemaining}s...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {winnerCount === 1 ? 'Sortear Agora (1 Vencedor)' : `Sortear Agora (${winnerCount} Vencedores)`}
                    </span>
                  </>
                )}
              </button>
              {eligible.length === 0 && (
                <p className="text-center text-xs text-[#F05262] mt-2">
                  Nenhum comentário elegível disponível. Carregue comentários ou relaxe os filtros acima.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Stats, Comments Feed & Winners Podium */}
        <div className="lg:col-span-7 space-y-6 min-w-0">
          {/* Winners Card (if drawn) */}
          {winners.length > 0 && (
            <div className="bg-[#101F3D] border border-[#F5B942] rounded-xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#182943]">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-lg bg-[#050D20] border border-[#F5B942]/50 flex items-center justify-center text-[#F5B942]">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-[#F8FAFC]">
                      {winners.length === 1 ? 'Comentário Vencedor!' : `${winners.length} Comentários Vencedores!`}
                    </h3>
                    <p className="text-xs text-[#20C997] font-medium">Resultado auditado e verificado</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleCopyWinners}
                    className="px-3 py-1.5 rounded-lg bg-[#050D20] hover:bg-[#182943] text-xs font-medium text-[#F8FAFC] border border-[#182943] transition flex items-center gap-1.5"
                  >
                    {copiedSuccess ? <Check className="w-3.5 h-3.5 text-[#20C997]" /> : <Copy className="w-3.5 h-3.5 text-[#94A3B8]" />}
                    <span>{copiedSuccess ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportPDF}
                    className="px-3 py-1.5 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] text-xs font-semibold text-[#F8FAFC] transition flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Laudo PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 rounded-lg bg-[#050D20] hover:bg-[#182943] text-xs font-medium text-[#F8FAFC] border border-[#182943] transition flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-[#F5B942]" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Winners Podium List */}
              <div className="space-y-3">
                {winners.map((winner) => (
                  <div
                    key={winner.id}
                    className="p-4 rounded-xl bg-[#050D20] border border-[#182943] space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[#101F3D] border border-[#F5B942]/50 text-[#F5B942] font-mono font-bold text-xs flex items-center justify-center shrink-0 tabular-nums">
                          {winner.rank}º
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-[#F8FAFC] truncate">{winner.comment.username}</span>
                            {winner.comment.nickname && (
                              <span className="text-xs text-[#94A3B8] truncate">({winner.comment.nickname})</span>
                            )}
                          </div>
                          <span className="text-xs font-medium text-[#F5B942]">{winner.prize}</span>
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
                          className="px-2.5 py-1 rounded-lg bg-[#101F3D] hover:bg-[#182943] text-[#F5B942] text-xs font-medium border border-[#F5B942]/40 transition shrink-0"
                        >
                          Cartão VIP
                        </button>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#101F3D] border border-[#182943] text-xs text-[#F8FAFC] italic">
                      &ldquo;{winner.comment.text}&rdquo;
                    </div>

                    {winner.comment.mentions.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-[#00A9FF]">
                        <AtSign className="w-3 h-3" />
                        <span>Menções: {winner.comment.mentions.join(', ')}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cycling Animation Display while drawing */}
          {isDrawing && cyclingComment && (
            <div className="bg-[#101F3D] border border-[#00A9FF] rounded-xl p-6 text-center space-y-2.5 animate-pulse">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#00A9FF]">
                Sorteando entre {eligible.length} comentários elegíveis...
              </span>
              <div className="text-2xl font-bold text-[#F8FAFC]">{cyclingComment.username}</div>
              <p className="text-xs text-[#94A3B8] italic line-clamp-2 max-w-md mx-auto">
                &ldquo;{cyclingComment.text}&rdquo;
              </p>
            </div>
          )}

          {/* Comments Data Grid & Search */}
          <div className="bg-[#101F3D] border border-[#182943] rounded-xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#F8FAFC] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#00A9FF]" />
                  <span>Comentários Qualificados</span>
                </h3>
                <p className="text-xs text-[#94A3B8]">Lista filtrada em tempo real conforme as regras ao lado</p>
              </div>

              <div className="flex items-center gap-2 text-xs flex-wrap tabular-nums">
                <span className="px-2.5 py-1 rounded-lg bg-[#050D20] border border-[#182943] text-[#94A3B8]">
                  Total: <strong className="text-[#F8FAFC]">{comments.length}</strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#0866F5]/15 border border-[#00A9FF]/40 text-[#00A9FF]">
                  Elegíveis: <strong className="text-[#F8FAFC]">{eligible.length}</strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#050D20] border border-[#182943] text-[#F5B942]">
                  Únicos: <strong className="text-[#F8FAFC]">{totalEligibleUsers}</strong>
                </span>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#94A3B8]">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por @usuário, nome ou texto do comentário..."
                className="w-full pl-9 pr-4 py-2 bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none rounded-lg text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/50"
              />
            </div>

            {/* Comments Scrollable List */}
            <div className="max-h-[460px] overflow-y-auto space-y-2 pr-1">
              {displayComments.length > 0 ? (
                displayComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="p-3 rounded-xl bg-[#050D20] border border-[#182943] hover:border-[#00A9FF]/40 transition space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {comment.avatarUrl ? (
                          <img
                            src={comment.avatarUrl}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover border border-[#182943] shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-[#101F3D] border border-[#182943] text-[#F5B942] text-[10px] font-bold flex items-center justify-center shrink-0">
                            {comment.username.replace('@', '').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="font-semibold text-xs text-[#F8FAFC] truncate">{comment.username}</span>
                        {comment.nickname && (
                          <span className="text-[11px] text-[#94A3B8] truncate max-w-[120px]">
                            {comment.nickname}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-[#94A3B8] shrink-0">
                        {comment.likes !== undefined && comment.likes > 0 && (
                          <span className="tabular-nums">♥ {comment.likes}</span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-[#20C997]/15 text-[#20C997] border border-[#20C997]/30 font-medium">
                          Elegível
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-[#F8FAFC]/90 leading-snug break-words">
                      {comment.text}
                    </p>

                    {comment.mentions.length > 0 && (
                      <div className="text-[10px] text-[#F5B942] flex items-center gap-1">
                        <AtSign className="w-2.5 h-2.5" />
                        <span>{comment.mentions.join(' ')}</span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-12 text-center space-y-3 bg-[#050D20]/60 rounded-xl border border-dashed border-[#182943]">
                  <div className="w-11 h-11 rounded-xl bg-[#101F3D] border border-[#182943] flex items-center justify-center mx-auto text-[#94A3B8]">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 px-4">
                    <h4 className="text-sm font-semibold text-[#F8FAFC]">Nenhum comentário elegível na lista</h4>
                    <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
                      {comments.length === 0
                        ? 'Cole o link de um vídeo do TikTok acima ou importe uma lista de comentários para começar.'
                        : 'Nenhum comentário atendeu aos filtros atuais. Relaxe os filtros ao lado para ver os participantes.'}
                    </p>
                  </div>
                  {comments.length === 0 && (
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleLoadSample}
                        className="px-3.5 py-1.5 rounded-lg bg-[#101F3D] hover:bg-[#182943] text-xs font-semibold text-[#00A9FF] border border-[#182943]"
                      >
                        Carregar Exemplo Rápido
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsImportModalOpen(true)}
                        className="px-3.5 py-1.5 rounded-lg bg-[#101F3D] hover:bg-[#182943] text-xs font-semibold text-[#F8FAFC] border border-[#182943]"
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
              <div className="pt-2 border-t border-[#182943] flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMoreComments}
                  disabled={isLoadingMore}
                  className="px-4 py-2 rounded-lg bg-[#050D20] hover:bg-[#182943] text-xs font-semibold text-[#00A9FF] border border-[#182943] transition flex items-center gap-2"
                >
                  {isLoadingMore ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-[#00A9FF] border-t-transparent rounded-full animate-spin" />
                      <span>Buscando mais comentários...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Carregar Mais Comentários (+50)</span>
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
          className="fixed inset-0 z-[70] bg-[#050D20]/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
        >
          <div className="relative w-full max-w-md bg-[#101F3D] border border-[#00A9FF] rounded-2xl p-8 text-center space-y-6 shadow-2xl">
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#050D20] border border-[#182943] text-[#00A9FF]">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>Sorteio por Comentários</span>
              </span>
              <h2 className="text-xl font-semibold text-[#F8FAFC]">{prizeName}</h2>
              <p className="text-xs text-[#94A3B8] tabular-nums">
                Sorteando entre {eligible.length} comentários qualificados
              </p>
            </div>

            <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
              <div className="w-32 h-32 rounded-full bg-[#050D20] border-4 border-[#F5B942] flex items-center justify-center">
                <span className="font-mono font-bold text-5xl text-[#F8FAFC] tabular-nums">
                  {countdownRemaining}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setCountdownRemaining(null);
                  executeDraw();
                }}
                className="px-4 py-2 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-semibold text-xs shadow-sm shadow-[#0866F5]/25"
              >
                Revelar Agora
              </button>
              <button
                type="button"
                onClick={() => setCountdownRemaining(null)}
                className="px-4 py-2 rounded-lg bg-[#050D20] hover:bg-[#182943] text-[#94A3B8] hover:text-[#F8FAFC] border border-[#182943] font-semibold text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1-Click Extractor Modal */}
      {isExtractorModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#050D20]/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
        >
          <div className="relative w-full max-w-xl bg-[#101F3D] border border-[#182943] rounded-2xl p-6 sm:p-7 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[#F8FAFC] flex items-center gap-2">
                  <Code className="w-5 h-5 text-[#00A9FF]" />
                  <span>Extrator de 1-Clique para TikTok</span>
                </h3>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Extraia todos os comentários carregados na página do vídeo diretamente pelo navegador.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExtractorModalOpen(false)}
                className="p-1.5 rounded-lg bg-[#050D20] border border-[#182943] text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 bg-[#050D20] p-4 rounded-xl border border-[#182943] text-xs text-[#F8FAFC]">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#0866F5] text-[#F8FAFC] font-bold text-[11px] flex items-center justify-center shrink-0">1</span>
                <span>Abra o vídeo no site do TikTok no computador e role os comentários que deseja incluir.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#0866F5] text-[#F8FAFC] font-bold text-[11px] flex items-center justify-center shrink-0">2</span>
                <span>Pressione <strong>F12</strong> (Inspecionar) e abra a aba <strong>Console</strong>.</span>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#0866F5] text-[#F8FAFC] font-bold text-[11px] flex items-center justify-center shrink-0">3</span>
                <span>Cole o comando abaixo e pressione <strong>Enter</strong>. Os comentários serão copiados automaticamente.</span>
              </div>
            </div>

            <div className="relative">
              <pre className="p-3 bg-[#050D20] border border-[#182943] rounded-xl text-[11px] text-[#F8FAFC] font-mono overflow-x-auto max-h-36">
                {TIKTOK_BROWSER_CONSOLE_SNIPPET}
              </pre>
              <button
                type="button"
                onClick={handleCopyExtractorSnippet}
                className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-semibold text-xs flex items-center gap-1.5"
              >
                {copiedSnippet ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSnippet ? 'Copiado!' : 'Copiar Código'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsExtractorModalOpen(false);
                  setIsImportModalOpen(true);
                }}
                className="px-4 py-2 rounded-lg bg-[#050D20] hover:bg-[#182943] text-xs font-semibold text-[#F8FAFC] border border-[#182943]"
              >
                Ir para Colar Comentários
              </button>

              <button
                type="button"
                onClick={() => setIsExtractorModalOpen(false)}
                className="px-5 py-2 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-semibold text-xs"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual & File (.TXT / .CSV) Comments Import Modal */}
      {isImportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#050D20]/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
        >
          <div className="relative w-full max-w-xl bg-[#101F3D] border border-[#182943] rounded-2xl p-6 sm:p-7 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[#F8FAFC] flex items-center gap-2">
                  <Upload className="w-5 h-5 text-[#00A9FF]" />
                  <span>Importar / Colar Comentários (.TXT ou .CSV)</span>
                </h3>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Selecione um arquivo <code>.txt</code> ou <code>.csv</code> do seu dispositivo ou cole comentários nos formatos <code>@usuario: texto</code>, <code>usuario,comentario,curtidas</code> ou JSON.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportModalError(null);
                  setImportModalInfo(null);
                }}
                className="p-1.5 rounded-lg bg-[#050D20] border border-[#182943] text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                ✕
              </button>
            </div>

            {/* Upload de Arquivo .TXT ou .CSV Local */}
            <div className="p-3.5 rounded-xl bg-[#050D20] border border-[#182943] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <span className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#00A9FF] shrink-0" />
                  <span className="truncate">
                    {selectedImportFileName
                      ? `Arquivo selecionado: ${selectedImportFileName}`
                      : 'Importar de arquivo local (.txt ou .csv)'}
                  </span>
                </span>
                <p className="text-[11px] text-[#94A3B8]">
                  Cabeçalhos CSV (ex: <code>usuario,comentario,curtidas</code>) são reconhecidos e ignorados automaticamente.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  ref={importFileInputRef}
                  id="comments-file-upload-input"
                  type="file"
                  accept=".txt,.csv,text/plain,text/csv"
                  onChange={handleImportFileSelected}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => importFileInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-lg bg-[#101F3D] hover:bg-[#182943] text-[#F8FAFC] border border-[#00A9FF]/50 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Upload className="w-3.5 h-3.5 text-[#00A9FF]" />
                  <span>Escolher Arquivo (.TXT / .CSV)</span>
                </button>
              </div>
            </div>

            {importModalError && (
              <div className="p-3 rounded-xl bg-[#F05262]/10 border border-[#F05262]/40 text-xs text-[#F05262] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{importModalError}</span>
              </div>
            )}

            {importModalInfo && (
              <div className="p-3 rounded-xl bg-[#20C997]/15 border border-[#20C997]/40 text-xs text-[#20C997] flex items-start gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{importModalInfo}</span>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                <label htmlFor="import-textarea" className="font-semibold text-[#F8FAFC]">
                  Lista de comentários (colagem manual ou pré-visualização do arquivo)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setIsExtractorModalOpen(true);
                  }}
                  className="text-[#00A9FF] hover:underline"
                >
                  Como extrair do TikTok?
                </button>
              </div>
              <textarea
                id="import-textarea"
                rows={8}
                value={rawImportText}
                onChange={(e) => {
                  setRawImportText(e.target.value);
                  if (importModalError) setImportModalError(null);
                }}
                placeholder={`@maria_silva: Eu quero ganhar @joao #sorteio\n@pedro_gamer: Participando!\nusuario,comentario,curtidas\n@carla_costa,"Muito bom, quero ganhar! @amiga1 @amiga2",15`}
                className="w-full px-3.5 py-2.5 bg-[#050D20] border border-[#182943] focus:border-[#00A9FF] focus:outline-none rounded-lg text-xs text-[#F8FAFC] font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportModalError(null);
                  setImportModalInfo(null);
                }}
                className="px-4 py-2 rounded-lg bg-[#050D20] hover:bg-[#182943] text-xs font-semibold text-[#94A3B8] hover:text-[#F8FAFC] border border-[#182943]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleImportSubmit}
                className="px-5 py-2 rounded-lg bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-semibold text-xs shadow-sm shadow-[#0866F5]/25"
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
