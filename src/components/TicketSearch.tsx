import React, { useState, useEffect } from 'react';
import {
  Search,
  Hash,
  User,
  Sparkles,
  Trophy,
  Copy,
  CheckCircle2,
  Share2,
  RefreshCw,
  QrCode,
  Radio,
  ExternalLink,
  Users,
  ShieldCheck,
  Edit2,
  MessageCircle,
  Clock,
  ChevronDown,
} from 'lucide-react';
import { ComputedRaffle, RaffleSettings, Winner, Participant, PublicRaffle } from '../types';
import { normalizeSearch } from '../utils/raffle';
import {
  getSavedParticipantName,
  saveParticipantName,
  fetchPublicRaffle,
  publishPublicRaffle,
} from '../utils/publicRaffle';
import { RaffleFinderModal } from './RaffleFinderModal';
import { RaffleQrCodeModal } from './RaffleQrCodeModal';

interface TicketSearchProps {
  computed: ComputedRaffle;
  settings: RaffleSettings;
  winners: Winner[];
  participants: Participant[];
  onUpdateSettings?: (patch: Partial<RaffleSettings>) => void;
  onLoadPublicRaffle?: (raffle: PublicRaffle) => void;
  currentUser?: { uid: string; displayName?: string | null; email?: string | null } | null;
  onResetToLocal?: () => void;
  isViewingExternalRaffle?: boolean;
}

export const TicketSearch: React.FC<TicketSearchProps> = ({
  computed,
  settings,
  winners,
  participants,
  onUpdateSettings,
  onLoadPublicRaffle,
  currentUser,
  onResetToLocal,
  isViewingExternalRaffle = false,
}) => {
  const [searchMode, setSearchMode] = useState<'name' | 'number' | 'all' | 'winners'>('name');
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isFinderOpen, setIsFinderOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);

  // Participant VIP identity
  const [savedName, setSavedName] = useState<string>(() => getSavedParticipantName());
  const [editingName, setEditingName] = useState(false);
  const [tempNameInput, setTempNameInput] = useState('');

  // Sorteador publish & share status
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<string | null>(null);
  const [isSyncingLive, setIsSyncingLive] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const wonIds = new Set(winners.map((w) => w.participantId));
  const normQuery = normalizeSearch(query);

  const raffleCode = settings.raffleCode || 'GIO-7492';
  const organizerName = settings.organizerName || currentUser?.displayName || 'Sorteador Oficial';
  const raffleTitle = settings.raffleTitle || 'Sorteio GIO DA SORTE';

  // Find saved participant allocation if available
  const normSavedName = normalizeSearch(savedName);
  const myAllocation = normSavedName
    ? computed.allocations.find((a) => normalizeSearch(a.participant.name) === normSavedName)
    : null;

  // Filtered lists
  const nameResults = normQuery
    ? computed.allocations.filter((a) => normalizeSearch(a.participant.name).includes(normQuery))
    : [];

  const parsedNumber = parseInt(query, 10);
  const numberResult =
    !isNaN(parsedNumber) && searchMode === 'number'
      ? computed.allocations.find((a) => a.tickets.includes(parsedNumber))
      : null;

  const currentUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  const directLink = `${currentUrl}?sorteio=${encodeURIComponent(raffleCode)}`;

  // Save Participant Name
  const handleSaveName = (name: string) => {
    const clean = name.trim();
    saveParticipantName(clean);
    setSavedName(clean);
    setEditingName(false);
    setTempNameInput('');
  };

  // Copy individual participant summary
  const handleCopyUserSummary = (name: string, tickets: number[]) => {
    const text = `GIO DA SORTE - ${name}: possui ${tickets.length} bilhetes (${tickets.map((n) => `#${n}`).join(', ')})`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(name);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Copy participant VIP summary
  const handleCopyMyTickets = () => {
    if (!myAllocation) return;
    const p = myAllocation.participant;
    const text = `🎯 Meus bilhetes no GIO DA SORTE do sorteador ${organizerName}:\n👤 Participante: ${p.name}\n💰 Moedas: ${p.coins}\n🎟️ Bilhetes (${myAllocation.assignedTickets}): ${myAllocation.tickets.map((t) => `#${t}`).join(', ')}\n🍀 Chance de Vitória: ${myAllocation.winProbability}%`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId('my-tickets');
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Copy raffle code
  const handleCopyRaffleCode = () => {
    navigator.clipboard.writeText(raffleCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  // Copy direct link
  const handleCopyDirectLink = () => {
    navigator.clipboard.writeText(directLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // Share via WhatsApp
  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `🎉 Participe e consulte seus bilhetes no GIO DA SORTE!\n\n👑 Sorteador: ${organizerName}\n🏆 Sorteio: ${raffleTitle}\n🔑 Código do Sorteio: ${raffleCode}\n\n👉 Acesse o link para ver seus números da sorte:\n${directLink}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  // Publish / Sync to Cloud
  const handlePublishToCloud = async () => {
    setIsPublishing(true);
    setPublishFeedback(null);
    try {
      const result = await publishPublicRaffle(
        raffleCode,
        organizerName,
        raffleTitle,
        settings,
        participants,
        winners,
        currentUser?.uid || 'organizer'
      );
      if (result.success) {
        setPublishFeedback('Sorteio publicado com sucesso na nuvem! Seus participantes já podem consultar.');
      } else {
        setPublishFeedback(`Aviso: ${result.error || 'Não foi possível publicar na nuvem.'}`);
      }
    } catch {
      setPublishFeedback('Erro ao sincronizar na nuvem.');
    } finally {
      setIsPublishing(false);
      setTimeout(() => setPublishFeedback(null), 4000);
    }
  };

  // Sync / Refresh Live Data
  const handleSyncLive = async () => {
    setIsSyncingLive(true);
    try {
      const refreshed = await fetchPublicRaffle(raffleCode);
      if (refreshed && onLoadPublicRaffle) {
        onLoadPublicRaffle(refreshed);
      }
    } catch (err) {
      console.warn('Sync live failed:', err);
    } finally {
      setIsSyncingLive(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Modals */}
      <RaffleFinderModal
        isOpen={isFinderOpen}
        onClose={() => setIsFinderOpen(false)}
        currentCode={raffleCode}
        onSelectRaffle={(raffle) => {
          if (onLoadPublicRaffle) onLoadPublicRaffle(raffle);
        }}
        onResetToLocal={onResetToLocal}
        isViewingExternal={isViewingExternalRaffle}
      />

      <RaffleQrCodeModal
        isOpen={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        raffleCode={raffleCode}
        organizerName={organizerName}
        raffleTitle={raffleTitle}
      />

      {/* TOP BAR: Current Connected Sorteador & Raffle */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border-2 border-blue-600/50 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-display font-black text-xl text-white shadow-lg shadow-blue-600/40 ring-2 ring-sky-300/40">
              {organizerName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                  Sorteador Verificado
                </span>
                <span className="flex items-center gap-0.5 text-[10px] font-semibold bg-emerald-950 border border-emerald-500/50 text-emerald-300 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Ao Vivo</span>
                </span>
              </div>
              <h2 className="font-display font-black text-xl sm:text-2xl text-white flex items-center gap-2">
                <span>{organizerName}</span>
                <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {raffleTitle} · <span className="text-sky-300 font-semibold">{computed.usedCount} de {settings.total} bilhetes alocados</span>
              </p>
              {(settings.prizeName || settings.currentPrize || settings.prizeImage) && (
                <div className="flex items-center gap-2 mt-2 px-3 py-1 rounded-xl bg-slate-950/80 border border-amber-500/30 w-fit">
                  {settings.prizeImage ? (
                    <img
                      src={settings.prizeImage}
                      alt={settings.prizeName || settings.currentPrize || 'Prêmio'}
                      className="w-5 h-5 rounded-full object-cover border border-amber-300/80 shrink-0"
                    />
                  ) : (
                    <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                  <span className="text-xs text-slate-300">
                    Prêmio: <b className="text-amber-300">{settings.prizeName || settings.currentPrize || 'Prêmio Principal'}</b>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Raffle Code Tag with 1-click copy */}
            <button
              type="button"
              onClick={handleCopyRaffleCode}
              title="Copiar código do sorteio"
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-950/80 hover:bg-slate-900 border border-blue-500/40 rounded-xl text-xs font-mono font-bold text-sky-300 transition active:scale-95"
            >
              <Hash className="w-3.5 h-3.5 text-sky-400" />
              <span>#{raffleCode}</span>
              {copiedCode ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-1" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400 ml-1" />
              )}
            </button>

            {/* Switch / Find Raffle */}
            <button
              type="button"
              onClick={() => setIsFinderOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-blue-600/30 active:scale-95"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Trocar Sorteio</span>
            </button>

            {/* Refresh Live */}
            <button
              type="button"
              onClick={handleSyncLive}
              disabled={isSyncingLive}
              title="Atualizar bilhetes agora"
              className="p-2 bg-slate-950/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs transition"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingLive ? 'animate-spin text-sky-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* ORGANIZER TOOLKIT BANNER (For Hosts) */}
        <div className="pt-3 border-t border-blue-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <span className="text-slate-400">
            É o sorteador? Compartilhe este sorteio para os participantes consultarem de graça:
          </span>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyDirectLink}
              aria-label="Copiar link direto do sorteio"
              className="min-h-[40px] px-3 py-2 bg-slate-950/90 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {copiedLink ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-sky-400" />
                  <span>Copiar Link</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsQrOpen(true)}
              aria-label="Visualizar QR code do sorteio"
              className="min-h-[40px] px-3 py-2 bg-slate-950/90 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <QrCode className="w-3.5 h-3.5 text-amber-400" />
              <span>QR Code</span>
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              aria-label="Compartilhar sorteio via WhatsApp"
              className="min-h-[40px] px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handlePublishToCloud}
              disabled={isPublishing}
              aria-label="Sincronizar dados do sorteio na nuvem"
              className="min-h-[40px] px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-sky-300 rounded-xl font-semibold flex items-center justify-center gap-1.5 transition text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {isPublishing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span>Sincronizar</span>
            </button>
          </div>
        </div>

        {publishFeedback && (
          <div className="p-2.5 bg-blue-950/80 border border-blue-500/50 rounded-xl text-sky-200 text-xs flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{publishFeedback}</span>
          </div>
        )}
      </div>

      {/* PARTICIPANT VIP CARD ("Lembrar Meu Nome") */}
      {savedName ? (
        <div className="bg-gradient-to-br from-blue-900/40 via-slate-900 to-slate-950 border-2 border-sky-400/50 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block">
                  Meu Acesso Rápido de Participante
                </span>
                <h3 className="font-display font-black text-xl text-white flex items-center gap-2">
                  <span>Olá, {savedName}!</span>
                  {myAllocation && wonIds.has(myAllocation.participant.id) && (
                    <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-400/50 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <Trophy className="w-3 h-3 text-amber-400" />
                      <span>Você Ganhou!</span>
                    </span>
                  )}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition"
              >
                <Edit2 className="w-3 h-3" />
                <span>Trocar Nome</span>
              </button>
            </div>
          </div>

          {editingName ? (
            <div className="flex gap-2 pt-2">
              <input
                type="text"
                autoFocus
                defaultValue={savedName}
                placeholder="Seu nome ou apelido..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName((e.target as HTMLInputElement).value);
                }}
                id="edit-name-input"
              />
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('edit-name-input') as HTMLInputElement;
                  if (el) handleSaveName(el.value);
                }}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="px-3 py-2 bg-slate-800 text-slate-300 text-xs rounded-xl"
              >
                Cancelar
              </button>
            </div>
          ) : myAllocation ? (
            <div className="space-y-3">
              {/* Stats badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Seus Bilhetes:</span>
                  <span className="text-xl font-mono font-black text-sky-400 tabular-nums">
                    {myAllocation.assignedTickets}
                  </span>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Suas Moedas:</span>
                  <span className="text-xl font-mono font-black text-white tabular-nums">
                    {myAllocation.participant.coins}
                  </span>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Chance de Ganhar:</span>
                  <span className="text-xl font-mono font-black text-emerald-400 tabular-nums">
                    {myAllocation.winProbability}%
                  </span>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 block">Para +1 Bilhete:</span>
                  <span className="text-xs font-semibold text-amber-300 block mt-1">
                    {myAllocation.remainderCoins === 0
                      ? 'Nenhuma sobra'
                      : `Faltam ${settings.rate - myAllocation.remainderCoins} moedas`}
                  </span>
                </div>
              </div>

              {/* Ticket numbers grid */}
              {myAllocation.tickets.length > 0 && (
                <div className="pt-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span className="font-bold text-slate-200">Seus Números da Sorte Concorrendo:</span>
                    <button
                      type="button"
                      onClick={handleCopyMyTickets}
                      className="flex items-center gap-1 text-sky-400 hover:text-sky-300 font-semibold"
                    >
                      {copiedId === 'my-tickets' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Cartela Copiada!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar Minha Cartela</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {myAllocation.tickets.map((num) => (
                      <span
                        key={num}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 text-white font-mono font-black text-sm px-3 py-1.5 rounded-xl shadow-md shadow-blue-900/40 border border-sky-300/30 tabular-nums transition"
                      >
                        #{num}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 text-xs text-slate-400">
              Não encontramos o nome <b className="text-white">"{savedName}"</b> na lista de participantes deste sorteio.
              Você pode trocar o nome no botão acima ou procurar na busca abaixo.
            </div>
          )}
        </div>
      ) : (
        /* Prompt to save name */
        <div className="bg-slate-900/80 border border-dashed border-slate-700 rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>Participa deste sorteio?</span>
            </h4>
            <p className="text-xs text-slate-400">
              Digite seu nome para salvar seu acesso rápido e ver seus bilhetes destacados em 1 toque neste aparelho.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tempNameInput}
              onChange={(e) => setTempNameInput(e.target.value)}
              placeholder="Digite seu nome..."
              className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-400"
              onKeyDown={(e) => e.key === 'Enter' && tempNameInput.trim() && handleSaveName(tempNameInput)}
            />
            <button
              type="button"
              disabled={!tempNameInput.trim()}
              onClick={() => handleSaveName(tempNameInput)}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition"
            >
              Salvar
            </button>
          </div>
        </div>
      )}

      {/* SEARCH SECTION */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="text-center space-y-1">
          <h3 className="font-display font-black text-2xl text-white">Consultar Bilhetes da Sorte</h3>
          <p className="text-xs sm:text-sm text-slate-400">
            Encontre participantes pelo nome, confira números de bilhetes sorteados ou veja a lista completa.
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center justify-center">
          <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-2xl flex-wrap justify-center">
            <button
              type="button"
              onClick={() => {
                setSearchMode('name');
                setQuery('');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
                searchMode === 'name'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Por Nome</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSearchMode('number');
                setQuery('');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
                searchMode === 'number'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Hash className="w-4 h-4" />
              <span>Por Número</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSearchMode('all');
                setQuery('');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
                searchMode === 'all'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Todos ({computed.allocations.length})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSearchMode('winners');
                setQuery('');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
                searchMode === 'winners'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Ganhadores ({winners.length})</span>
            </button>
          </div>
        </div>

        {/* Input box for Name / Number */}
        {(searchMode === 'name' || searchMode === 'number') && (
          <div className="relative max-w-xl mx-auto">
            <input
              type={searchMode === 'number' ? 'number' : 'text'}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                searchMode === 'name'
                  ? 'Digite seu nome ou apelido (ex: Ana, Carlos...)'
                  : `Digite o número do bilhete (${settings.start} a ${settings.start + settings.total - 1})...`
              }
              className="w-full bg-slate-950 border-2 border-slate-700 focus:border-blue-400 rounded-2xl pl-11 pr-4 py-3.5 text-base text-white placeholder:text-slate-500 focus:outline-none transition shadow-inner"
            />
            <div className="absolute left-3.5 top-3.5 text-sky-400 pointer-events-none">
              {searchMode === 'name' ? <Search className="w-5 h-5" /> : <Hash className="w-5 h-5" />}
            </div>
          </div>
        )}
      </div>

      {/* RESULTS SECTION */}
      <div className="space-y-4">
        {/* MODE: SEARCH BY NAME */}
        {searchMode === 'name' && (
          <>
            {!query.trim() ? (
              <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-8 text-center space-y-2">
                <Sparkles className="w-8 h-8 text-sky-400/50 mx-auto" />
                <p className="text-sm font-medium text-slate-300">Digite seu nome acima para ver seus bilhetes</p>
                <p className="text-xs text-slate-500">
                  A busca aceita apelidos, primeiro nome ou sobrenome sem se preocupar com maiúsculas ou acentos.
                </p>
              </div>
            ) : nameResults.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-2">
                <p className="text-sm font-bold text-slate-300">Nenhum participante encontrado</p>
                <p className="text-xs text-slate-400">
                  Não encontramos ninguém cadastrado com "{query}" no sorteio de {organizerName}.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-400 px-1">
                  Encontrado(s) {nameResults.length} participante(s):
                </div>

                {nameResults.map((alloc) => {
                  const p = alloc.participant;
                  const hasWon = wonIds.has(p.id);

                  return (
                    <div
                      key={p.id}
                      className="bg-slate-900 border border-slate-800 hover:border-blue-600/70 rounded-3xl p-5 shadow-lg space-y-3 transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-display font-black text-xl text-white">{p.name}</h3>
                            {hasWon && (
                              <span className="flex items-center gap-1 text-[11px] font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-400/40">
                                <Trophy className="w-3 h-3 text-amber-400" />
                                <span>Ganhador</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-1">
                            Saldo: <b className="text-sky-400 font-semibold">{p.coins} moedas</b>
                            {alloc.assignedTickets === 0 ? (
                              <span> · Faltam {settings.rate - alloc.remainderCoins} moedas para o 1º bilhete</span>
                            ) : (
                              <span> · {alloc.winProbability}% de chance no sorteio atual</span>
                            )}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-display font-black text-2xl text-sky-400 tabular-nums">
                            {alloc.assignedTickets}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            {alloc.assignedTickets === 1 ? 'Bilhete' : 'Bilhetes'}
                          </div>
                        </div>
                      </div>

                      {/* Bilhetes Chips */}
                      {alloc.tickets.length > 0 ? (
                        <div className="pt-3 border-t border-slate-800/80">
                          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                            <span className="font-semibold text-slate-300">Números Concorrendo:</span>
                            <button
                              type="button"
                              onClick={() => handleCopyUserSummary(p.name, alloc.tickets)}
                              className="flex items-center gap-1 text-slate-400 hover:text-white transition"
                            >
                              {copiedId === p.name ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-400">Copiado</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copiar bilhetes</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {alloc.tickets.map((num) => (
                              <span
                                key={num}
                                className="bg-blue-600 hover:bg-blue-500 text-white font-mono font-extrabold text-sm px-2.5 py-1 rounded-lg tabular-nums shadow-sm transition"
                              >
                                #{num}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 bg-slate-950/40 p-2.5 rounded-xl">
                          Esta pessoa precisa de pelo menos <b>{settings.rate} moedas</b> para receber seu primeiro bilhete.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* MODE: SEARCH BY NUMBER */}
        {searchMode === 'number' && (
          <>
            {!query.trim() ? (
              <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-8 text-center space-y-2">
                <Hash className="w-8 h-8 text-sky-400/50 mx-auto" />
                <p className="text-sm font-medium text-slate-300">Digite um número de bilhete acima</p>
                <p className="text-xs text-slate-500">
                  Ideal para quando um número for sorteado e você quiser confirmar imediatamente o participante.
                </p>
              </div>
            ) : isNaN(parsedNumber) ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center text-xs text-slate-400">
                Por favor, digite um número inteiro válido.
              </div>
            ) : numberResult ? (
              <div className="bg-slate-900 border-2 border-blue-500/80 rounded-3xl p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-mono font-black text-2xl flex items-center justify-center shadow-lg shadow-blue-600/30 ring-1 ring-sky-300/40">
                      #{parsedNumber}
                    </div>
                    <div>
                      <span className="text-xs text-sky-400 font-bold uppercase tracking-wider">
                        Dono do Bilhete Encontrado
                      </span>
                      <h3 className="font-display font-black text-2xl text-white">
                        {numberResult.participant.name}
                      </h3>
                    </div>
                  </div>

                  {wonIds.has(numberResult.participant.id) && (
                    <span className="bg-amber-500/20 text-amber-300 border border-amber-400/40 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <span>Já Premiado</span>
                    </span>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                    <span className="text-slate-400 block">Total de moedas:</span>
                    <span className="text-base font-bold text-white tabular-nums">
                      {numberResult.participant.coins}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                    <span className="text-slate-400 block">Total de bilhetes:</span>
                    <span className="text-base font-bold text-sky-400 tabular-nums">
                      {numberResult.assignedTickets} bilhetes
                    </span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 col-span-2 sm:col-span-1">
                    <span className="text-slate-400 block">Chance de vitória:</span>
                    <span className="text-base font-bold text-emerald-400 tabular-nums">
                      {numberResult.winProbability}%
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-xs font-semibold text-slate-400 block mb-2">
                    Todos os bilhetes de {numberResult.participant.name}:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {numberResult.tickets.map((num) => (
                      <span
                        key={num}
                        className={`font-mono font-bold text-xs px-2.5 py-1 rounded-lg ${
                          num === parsedNumber
                            ? 'bg-blue-600 text-white ring-2 ring-sky-300'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        #{num}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-2">
                <p className="text-sm font-bold text-slate-300">Bilhete #{parsedNumber} não foi distribuído</p>
                <p className="text-xs text-slate-500">
                  Esse número ainda não pertence a ninguém ou está fora da faixa configurada do sorteio de {organizerName}.
                </p>
              </div>
            )}
          </>
        )}

        {/* MODE: ALL PARTICIPANTS */}
        {searchMode === 'all' && (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-400 px-1">
              Todos os {computed.allocations.length} participantes deste sorteio:
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {computed.allocations.map((alloc) => (
                <div
                  key={alloc.participant.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3 hover:border-slate-700 transition"
                >
                  <div>
                    <h4 className="font-bold text-sm text-white">{alloc.participant.name}</h4>
                    <span className="text-xs text-slate-400">
                      {alloc.participant.coins} moedas · {alloc.winProbability}% chance
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-base text-sky-400 tabular-nums">
                      {alloc.assignedTickets}
                    </span>
                    <span className="block text-[10px] text-slate-500 uppercase">bilhetes</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODE: DRAWN WINNERS */}
        {searchMode === 'winners' && (
          <div className="space-y-3">
            {winners.length > 0 ? (
              winners.map((w, index) => (
                <div
                  key={w.id}
                  className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/40 rounded-3xl p-5 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 font-mono font-black text-lg">
                      #{index + 1}
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block">
                        {w.prize}
                      </span>
                      <h4 className="font-display font-black text-lg text-white">{w.name}</h4>
                      <span className="text-xs text-slate-400">
                        Bilhete sorteado: <b className="text-white font-mono">#{w.number}</b>
                      </span>
                    </div>
                  </div>
                  <Trophy className="w-6 h-6 text-amber-400 shrink-0" />
                </div>
              ))
            ) : (
              <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-8 text-center space-y-2">
                <Trophy className="w-8 h-8 text-amber-400/50 mx-auto" />
                <p className="text-sm font-bold text-slate-300">Nenhum ganhador sorteado ainda</p>
                <p className="text-xs text-slate-500">
                  Os vencedores aparecerão aqui assim que o sorteador realizar a rodada!
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
