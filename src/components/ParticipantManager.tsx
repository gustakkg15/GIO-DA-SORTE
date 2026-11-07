import React, { useState, useRef } from 'react';
import {
  UserPlus,
  Upload,
  Trash2,
  Coins,
  Search,
  ArrowUpDown,
  AlertTriangle,
  Ticket,
  X,
  Download,
  FileSpreadsheet,
  Sliders,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { Participant, ComputedRaffle, RaffleSettings, Winner } from '../types';
import {
  parseRawTextList,
  parseExcelBuffer,
  exportToCsv,
} from '../utils/raffle';
import { playCoinChime } from '../utils/audio';
import { ParticipantImportModal } from './ParticipantImportModal';

interface ParticipantManagerProps {
  participants: Participant[];
  computed: ComputedRaffle;
  settings: RaffleSettings;
  winners: Winner[];
  onAddParticipant: (name: string, coins: number) => void;
  onUpdateCoins: (id: string, coins: number) => void;
  onRemoveParticipant: (id: string) => void;
  onClearAll: () => void;
  onBulkAdd: (items: { name: string; coins: number }[], replace: boolean) => void;
  onSetParticipants?: (newParticipants: Participant[]) => void;
  onUpdateSettings?: (patch: Partial<RaffleSettings>) => void;
}

export const ParticipantManager: React.FC<ParticipantManagerProps> = ({
  participants,
  computed,
  settings,
  winners,
  onAddParticipant,
  onUpdateCoins,
  onRemoveParticipant,
  onClearAll,
  onBulkAdd,
  onSetParticipants,
  onUpdateSettings,
}) => {
  const [nameInput, setNameInput] = useState('');
  const [coinsInput, setCoinsInput] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [replaceOnImport, setReplaceOnImport] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [ticketSearchQuery, setTicketSearchQuery] = useState('');
  const [filterOnlyTicketMatch, setFilterOnlyTicketMatch] = useState(false);
  const [sortBy, setSortBy] = useState<'coins-desc' | 'tickets-desc' | 'name-asc' | 'recent'>('tickets-desc');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'info' | 'warn' | 'error' } | null>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const wonIds = new Set(winners.map((w) => w.participantId));

  const showFeedback = (text: string, type: 'info' | 'warn' | 'error' = 'info') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => {
      setFeedbackMsg((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    const coins = parseInt(coinsInput, 10);

    if (!trimmed) {
      showFeedback('Por favor, informe o nome do participante.', 'error');
      return;
    }
    if (isNaN(coins) || coins < 0) {
      showFeedback('Informe uma quantidade válida de moedas (0 ou mais).', 'error');
      return;
    }

    onAddParticipant(trimmed, coins);
    playCoinChime();
    setNameInput('');
    setCoinsInput('');

    if (coins < settings.rate) {
      showFeedback(
        `${trimmed} adicionado(a) com ${coins} moedas. Faltam ${settings.rate - coins} moedas para ganhar 1 bilhete.`,
        'warn'
      );
    } else {
      const ticketsEarned = Math.floor(coins / settings.rate);
      showFeedback(`${trimmed} adicionado(a) com ${ticketsEarned} bilhete(s)!`, 'info');
    }
  };

  const handleBulkSubmit = () => {
    if (!bulkText.trim()) {
      showFeedback('Cole os dados no campo de texto.', 'warn');
      return;
    }
    const parsed = parseRawTextList(bulkText);
    if (parsed.length === 0) {
      showFeedback('Nenhum participante válido encontrado. Use o formato: Nome 200', 'error');
      return;
    }
    onBulkAdd(parsed, false);
    playCoinChime();
    setBulkText('');
    setIsBulkOpen(false);
    showFeedback(`${parsed.length} participantes processados com sucesso!`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();

    try {
      if (extension === 'xlsx' || extension === 'xls') {
        const buffer = await file.arrayBuffer();
        const parsed = parseExcelBuffer(buffer);
        if (parsed.length === 0) {
          showFeedback('Nenhum participante encontrado na planilha. Colunas: Nome e Moedas.', 'error');
          return;
        }
        onBulkAdd(parsed, replaceOnImport);
        playCoinChime();
        showFeedback(`${parsed.length} participantes importados da planilha com sucesso!`);
        setIsImportOpen(false);
      } else {
        const text = await file.text();
        const parsed = parseRawTextList(text);
        if (parsed.length === 0) {
          showFeedback('Nenhuma linha no formato "Nome 200" encontrada no arquivo.', 'error');
          return;
        }
        onBulkAdd(parsed, replaceOnImport);
        playCoinChime();
        showFeedback(`${parsed.length} participantes importados com sucesso!`);
        setIsImportOpen(false);
      }
    } catch {
      showFeedback('Erro ao ler o arquivo. Tente usar CSV, TXT ou XLSX válido.', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportCsv = () => {
    if (participants.length === 0) {
      showFeedback('Não há participantes na lista para exportar.', 'warn');
      return;
    }

    try {
      const csvContent = exportToCsv(computed.allocations, settings);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `gio-da-sorte-participantes-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      playCoinChime();
      showFeedback(`${participants.length} participantes com seus saldos de moedas exportados em CSV com sucesso!`);
    } catch (err) {
      console.error('Erro ao exportar CSV:', err);
      showFeedback('Erro ao gerar arquivo CSV.', 'error');
    }
  };

  // Ticket Number Search processing
  const cleanTicketInput = ticketSearchQuery.trim().replace(/^#+/, '');
  const parsedTicketNum = cleanTicketInput !== '' ? parseInt(cleanTicketInput, 10) : null;
  const isValidTicketSearch = parsedTicketNum !== null && !isNaN(parsedTicketNum);

  const ticketHolder = isValidTicketSearch
    ? computed.allocations.find((a) => a.tickets.includes(parsedTicketNum))
    : null;

  const filteredAllocations = computed.allocations.filter((a) => {
    const matchesName = a.participant.name.toLowerCase().includes(filterQuery.toLowerCase());
    if (!matchesName) return false;

    if (isValidTicketSearch && filterOnlyTicketMatch) {
      return a.tickets.includes(parsedTicketNum);
    }
    return true;
  });

  filteredAllocations.sort((a, b) => {
    if (isValidTicketSearch && !filterOnlyTicketMatch) {
      const aMatches = a.tickets.includes(parsedTicketNum);
      const bMatches = b.tickets.includes(parsedTicketNum);
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
    }

    if (sortBy === 'coins-desc') return b.participant.coins - a.participant.coins;
    if (sortBy === 'tickets-desc') return b.assignedTickets - a.assignedTickets;
    if (sortBy === 'name-asc') return a.participant.name.localeCompare(b.participant.name);
    return b.participant.addedAt - a.participant.addedAt;
  });

  const isCapacityExceeded = computed.usedCount >= settings.total;

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden animate-fade-in">
      {/* Add Participant & Conversion Rule Card */}
      <div className="gio-card p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0866F5]/15 border border-[#0866F5]/35 flex items-center justify-center text-[#35B9F5] shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-base sm:text-lg text-[#F8FAFC]">
                  Adicionar Participantes
                </h2>
                <span className="gio-badge-info text-[10px]">Manual ou Planilha</span>
              </div>
              <p className="text-xs text-[#94A3B8] font-mono tabular-nums mt-0.5">
                Regra oficial: <strong className="text-[#F5B942]">{settings.rate} moedas = 1 bilhete</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsBulkOpen(!isBulkOpen)}
              className="gio-btn-secondary text-xs min-h-[38px] px-3.5 py-1.5"
            >
              {isBulkOpen ? 'Fechar Colagem' : 'Colar Lista'}
            </button>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="gio-btn-secondary text-xs min-h-[38px] px-3.5 py-1.5 flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#00A9FF]" />
              <span className="hidden sm:inline">Importar Planilha / CSV</span>
              <span className="sm:hidden">Importar</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={participants.length === 0}
              title="Exportar lista atual de participantes e saldo de moedas em CSV"
              className="gio-btn-secondary text-xs min-h-[38px] px-3.5 py-1.5 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 text-[#F5B942]" />
              <span className="hidden sm:inline">Exportar CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
          </div>
        </div>

        {/* Real Persisted Conversion Rate Bar (when onUpdateSettings is provided) */}
        {onUpdateSettings && (
          <div className="p-3.5 rounded-xl bg-[#081226]/80 border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[#94A3B8]">
              <Sliders className="w-4 h-4 text-[#F5B942] shrink-0" />
              <span>Regra de conversão deste sorteio:</span>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-2 bg-[#101F3D] border border-white/[0.1] rounded-lg px-3 py-1.5 shadow-xs">
                <input
                  type="number"
                  min={1}
                  step={1}
                  aria-label="Moedas necessárias para 1 bilhete"
                  value={settings.rate}
                  onChange={(e) => {
                    const nextRate = Math.max(1, parseInt(e.target.value, 10) || 1);
                    onUpdateSettings({ rate: nextRate });
                  }}
                  className="w-16 bg-transparent text-right font-mono font-bold text-xs text-[#F5B942] focus:outline-none tabular-nums"
                />
                <span className="text-[11px] text-[#94A3B8]">moedas = 1 bilhete</span>
              </div>
              <div className="flex items-center gap-2 bg-[#101F3D] border border-white/[0.1] rounded-lg px-3 py-1.5 shadow-xs">
                <span className="text-[11px] text-[#94A3B8]">Capacidade:</span>
                <input
                  type="number"
                  min={10}
                  max={100000}
                  step={10}
                  aria-label="Capacidade total de bilhetes"
                  value={settings.total}
                  onChange={(e) => {
                    const nextTotal = Math.max(10, parseInt(e.target.value, 10) || 100);
                    onUpdateSettings({ total: nextTotal });
                  }}
                  className="w-16 bg-transparent text-right font-mono font-bold text-xs text-[#F8FAFC] focus:outline-none tabular-nums"
                />
                <span className="text-[11px] text-[#94A3B8]">bilhetes</span>
              </div>
            </div>
          </div>
        )}

        {/* Single participant form */}
        <form onSubmit={handleSingleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-6">
              <label htmlFor="participant-name-input" className="block text-xs text-[#94A3B8] mb-1.5 font-medium">
                Nome completo ou @usuário
              </label>
              <input
                id="participant-name-input"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Ex.: Mariana Silva (@marianasilva)"
                className="gio-input w-full min-h-[42px] px-3.5 py-2 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/40"
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="participant-coins-input" className="block text-xs text-[#94A3B8] mb-1.5 font-medium">
                Moedas ({settings.rate} = 1 bil.)
              </label>
              <div className="relative">
                <input
                  id="participant-coins-input"
                  type="number"
                  min="0"
                  step="1"
                  value={coinsInput}
                  onChange={(e) => setCoinsInput(e.target.value)}
                  placeholder={`Ex.: ${settings.rate}`}
                  className="gio-input w-full min-h-[42px] pl-3.5 pr-8 py-2 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/40 font-mono tabular-nums"
                />
                <Coins className="w-4 h-4 text-[#F5B942] absolute right-2.5 top-3 pointer-events-none" />
              </div>
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                className="gio-btn-primary w-full min-h-[42px] py-2 px-4 text-sm font-semibold justify-center shadow-md"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Adicionar</span>
              </button>
            </div>
          </div>
        </form>

        {/* Bulk Paste Accordion */}
        {isBulkOpen && (
          <div className="pt-4 border-t border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between text-xs text-[#94A3B8]">
              <span className="font-semibold text-[#F8FAFC]">Colar Lista Rápida</span>
              <span className="font-mono">Formato: Nome {settings.rate} (um por linha)</span>
            </div>
            <textarea
              rows={4}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`Ana ${settings.rate * 2}\nBruno, ${settings.rate}\nCarla; ${settings.rate * 3}`}
              className="gio-input w-full p-3.5 text-xs sm:text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/40 font-mono leading-relaxed"
            />
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setBulkText('')}
                className="gio-btn-secondary text-xs px-3.5 py-1.5"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={handleBulkSubmit}
                className="gio-btn-primary text-xs px-4 py-1.5 font-semibold"
              >
                Processar e Adicionar
              </button>
            </div>
          </div>
        )}

        {/* File Import Accordion */}
        {isImportOpen && (
          <div className="pt-4 border-t border-white/[0.08] space-y-3">
            <div className="text-xs text-[#F8FAFC] font-semibold">
              Importar de Planilha (.xlsx, .xls) ou Texto (.csv, .txt, .tsv)
            </div>
            <div className="p-6 bg-[#081226] border border-dashed border-white/[0.15] rounded-xl text-center space-y-2.5">
              <Upload className="w-7 h-7 text-[#00A9FF] mx-auto" />
              <p className="text-xs text-[#94A3B8]">
                Selecione o arquivo da lista. A primeira coluna deve conter os nomes e a segunda as moedas.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="text-xs text-[#94A3B8] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#0866F5] file:text-[#F8FAFC] hover:file:bg-[#00A9FF] cursor-pointer"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-[#94A3B8] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={replaceOnImport}
                onChange={(e) => setReplaceOnImport(e.target.checked)}
                className="w-4 h-4 rounded text-[#0866F5] bg-[#081226] border-white/[0.15]"
              />
              <span>Substituir a lista existente por esta (apagar os atuais)</span>
            </label>
          </div>
        )}

        {/* Feedback Alert Bar */}
        {feedbackMsg && (
          <div
            className={`text-xs p-3 rounded-xl border flex items-center justify-between transition-all ${
              feedbackMsg.type === 'error'
                ? 'bg-[#F05262]/12 border-[#F05262]/40 text-[#F05262]'
                : feedbackMsg.type === 'warn'
                ? 'bg-[#F5B942]/12 border-[#F5B942]/40 text-[#F5B942]'
                : 'bg-[#20C997]/12 border-[#20C997]/40 text-[#20C997]'
            }`}
          >
            <span>{feedbackMsg.text}</span>
          </div>
        )}
      </div>

      {/* Capacity & Distribution Warning */}
      {isCapacityExceeded && (
        <div className="bg-[#F5B942]/10 border border-[#F5B942]/40 rounded-xl p-3.5 flex items-start gap-3 text-[#F8FAFC] text-xs">
          <AlertTriangle className="w-5 h-5 shrink-0 text-[#F5B942] mt-0.5" />
          <div>
            <p className="font-semibold text-[#F8FAFC]">Capacidade máxima de bilhetes atingida ({settings.total})</p>
            <p className="text-[#94A3B8] mt-0.5">
              Os participantes acumularam moedas para mais bilhetes do que o limite atual ({settings.total}). Aumente o limite de bilhetes acima ou nas Configurações para contemplar todos.
            </p>
          </div>
        </div>
      )}

      {/* Participants Table & List View */}
      <div className="gio-card p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#0866F5]/15 border border-[#0866F5]/30 flex items-center justify-center text-[#35B9F5]">
                <Users className="w-4 h-4" />
              </div>
              <h2 className="font-display font-bold text-lg sm:text-xl text-[#F8FAFC]">
                Participantes do Sorteio
              </h2>
              <span className="text-xs font-mono font-bold bg-[#081226] border border-white/[0.1] text-[#35B9F5] px-2.5 py-0.5 rounded-md tabular-nums">
                {participants.length}
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-1 font-mono tabular-nums">
              <strong className="text-[#F8FAFC]">{computed.usedCount}</strong> de{' '}
              <strong className="text-[#F8FAFC]">{settings.total}</strong> bilhetes emitidos ({settings.rate} moedas = 1 bilhete)
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
            {/* Filter by Name */}
            <div className="relative flex-1 sm:w-48 min-w-[140px]">
              <input
                type="text"
                placeholder="Filtrar por nome..."
                aria-label="Filtrar participante por nome"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="gio-input pl-8 pr-7 py-2 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/40 w-full min-h-[38px]"
              />
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-3 pointer-events-none" />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  className="absolute right-2 top-2.5 text-[#94A3B8] hover:text-[#F8FAFC]"
                  title="Limpar filtro de nome"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter / Search by Ticket Number */}
            <div className="relative flex-1 sm:w-40 min-w-[120px]">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Nº Bilhete..."
                aria-label="Buscar por número de bilhete"
                value={ticketSearchQuery}
                onChange={(e) => setTicketSearchQuery(e.target.value)}
                className={`gio-input pl-8 pr-7 py-2 text-xs w-full min-h-[38px] tabular-nums font-mono ${
                  isValidTicketSearch
                    ? 'border-[#F5B942] text-[#F5B942] bg-[#F5B942]/10 ring-1 ring-[#F5B942]/40'
                    : 'text-[#F8FAFC] placeholder:text-[#94A3B8]/40'
                }`}
              />
              <Ticket
                className={`w-3.5 h-3.5 absolute left-2.5 top-3 pointer-events-none ${
                  isValidTicketSearch ? 'text-[#F5B942]' : 'text-[#94A3B8]'
                }`}
              />
              {ticketSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTicketSearchQuery('')}
                  className="absolute right-2 top-2.5 text-[#94A3B8] hover:text-[#F8FAFC]"
                  title="Limpar busca de bilhete"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-[#081226] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs text-[#F8FAFC] min-h-[38px]">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#94A3B8]" />
              <select
                value={sortBy}
                aria-label="Ordenar participantes por"
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-transparent text-xs text-[#F8FAFC] focus:outline-none cursor-pointer py-0.5"
              >
                <option value="tickets-desc" className="bg-[#0B1730]">Mais bilhetes</option>
                <option value="coins-desc" className="bg-[#0B1730]">Mais moedas</option>
                <option value="name-asc" className="bg-[#0B1730]">Nome (A-Z)</option>
                <option value="recent" className="bg-[#0B1730]">Mais recentes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ticket Search Active Status Bar */}
        {isValidTicketSearch && (
          <div
            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm transition-all ${
              ticketHolder
                ? 'bg-[#F5B942]/12 border-[#F5B942]/50 text-[#F8FAFC] shadow-sm'
                : 'bg-[#081226] border-white/[0.1] text-[#94A3B8]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Ticket className={`w-4 h-4 shrink-0 ${ticketHolder ? 'text-[#F5B942]' : 'text-[#94A3B8]'}`} />
              {ticketHolder ? (
                <div className="truncate">
                  <span>Bilhete </span>
                  <span className="font-mono font-bold text-[#F5B942] bg-[#101F3D] border border-[#F5B942]/40 px-2 py-0.5 rounded-md mr-1.5 tabular-nums">
                    #{parsedTicketNum}
                  </span>
                  <span>pertence a </span>
                  <strong className="text-[#F8FAFC] font-semibold">{ticketHolder.participant.name}</strong>
                  <span className="text-[#94A3B8] ml-1.5 font-mono tabular-nums">
                    ({ticketHolder.assignedTickets} {ticketHolder.assignedTickets === 1 ? 'bilhete' : 'bilhetes'})
                  </span>
                </div>
              ) : (
                <div>
                  <span>Bilhete </span>
                  <span className="font-mono font-bold text-[#F8FAFC] bg-[#101F3D] border border-white/[0.1] px-2 py-0.5 rounded-md mr-1.5 tabular-nums">
                    #{parsedTicketNum}
                  </span>
                  <span>não atribuído a nenhum participante</span>
                  {parsedTicketNum < settings.start || parsedTicketNum >= settings.start + settings.total ? (
                    <span className="text-[#F05262] ml-1.5 font-medium">
                      (fora da série #{settings.start} a #{settings.start + settings.total - 1})
                    </span>
                  ) : (
                    <span className="text-[#94A3B8] ml-1.5">(disponível na série)</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setFilterOnlyTicketMatch(!filterOnlyTicketMatch)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${
                  filterOnlyTicketMatch
                    ? 'bg-[#F5B942] text-[#050D20] border-[#F5B942] font-bold shadow-xs'
                    : 'bg-[#101F3D] text-[#F8FAFC] border-white/[0.1] hover:border-white/[0.2]'
                }`}
              >
                <span>{filterOnlyTicketMatch ? 'Filtrando Portador' : 'Destacando na Lista'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTicketSearchQuery('')}
                className="p-1 hover:bg-white/[0.08] rounded-md text-[#94A3B8] hover:text-[#F8FAFC] transition"
                title="Limpar busca de bilhete"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Participant List */}
        {participants.length === 0 ? (
          <div className="py-12 text-center space-y-2 border border-dashed border-white/[0.1] rounded-2xl bg-[#081226]/50">
            <Users className="w-8 h-8 text-[#94A3B8]/40 mx-auto" />
            <p className="text-sm sm:text-base font-semibold text-[#F8FAFC]">Nenhum participante cadastrado ainda</p>
            <p className="text-xs text-[#94A3B8] max-w-sm mx-auto">
              Adicione participantes individualmente ou importe uma planilha no formulário acima para iniciar o sorteio.
            </p>
          </div>
        ) : filteredAllocations.length === 0 ? (
          <div className="py-10 text-center text-xs sm:text-sm text-[#94A3B8] space-y-2 border border-white/[0.05] rounded-xl bg-[#081226]/30">
            <p>
              {isValidTicketSearch
                ? `Nenhum participante possui o bilhete #${parsedTicketNum}.`
                : `Nenhum participante encontrado com o termo "${filterQuery}".`}
            </p>
            {isValidTicketSearch && (
              <button
                type="button"
                onClick={() => setTicketSearchQuery('')}
                className="gio-btn-secondary text-xs px-3.5 py-1.5"
              >
                Limpar busca de bilhete
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
            {filteredAllocations.map((alloc) => {
              const p = alloc.participant;
              const hasWon = wonIds.has(p.id);
              const neededNext = settings.rate - alloc.remainderCoins;
              const isHoldingSearchedTicket = isValidTicketSearch && alloc.tickets.includes(parsedTicketNum);

              let ticketsToDisplay = alloc.tickets.slice(0, 10);
              if (isHoldingSearchedTicket && !ticketsToDisplay.includes(parsedTicketNum)) {
                ticketsToDisplay = [parsedTicketNum, ...ticketsToDisplay.slice(0, 9)];
              }

              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-xl border transition-all duration-200 ${
                    isHoldingSearchedTicket
                      ? 'bg-[#182943] border-[#F5B942] ring-1 ring-[#F5B942]/60 shadow-md'
                      : hasWon
                      ? 'bg-[#081226]/90 border-[#20C997]/40 ring-1 ring-[#20C997]/20'
                      : 'bg-[#081226]/70 border-white/[0.08] hover:border-[#00A9FF]/35'
                  }`}
                >
                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                      <div className="w-8 h-8 rounded-full bg-[#101F3D] border border-white/[0.1] flex items-center justify-center font-bold text-xs text-[#35B9F5] shrink-0 font-mono">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-sm sm:text-base text-[#F8FAFC] truncate max-w-[220px] sm:max-w-none">
                        {p.name}
                      </span>
                      {isHoldingSearchedTicket && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-[#F5B942] text-[#050D20] px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0 font-mono tabular-nums shadow-xs">
                          <Ticket className="w-3 h-3" />
                          <span>Portador #{parsedTicketNum}</span>
                        </span>
                      )}
                      {hasWon && (
                        <span className="gio-badge-success text-[10px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Premiado</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-auto">
                      <div className="flex items-center gap-1.5 bg-[#101F3D] border border-white/[0.1] rounded-lg px-2.5 py-1 min-h-[36px] shadow-xs">
                        <span className="text-xs text-[#94A3B8] font-medium">Moedas:</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          aria-label={`Moedas de ${p.name}`}
                          value={p.coins}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            onUpdateCoins(p.id, isNaN(val) || val < 0 ? 0 : val);
                          }}
                          className="w-18 bg-[#081226] border border-white/[0.1] rounded px-2 py-0.5 text-xs sm:text-sm text-right text-[#F8FAFC] font-mono font-bold focus:outline-none focus:border-[#00A9FF] tabular-nums"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveParticipant(p.id)}
                        title={`Remover ${p.name}`}
                        aria-label={`Remover participante ${p.name}`}
                        className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center text-[#94A3B8] hover:text-[#F05262] hover:bg-[#F05262]/10 rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2.5 text-xs">
                    <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                      <span className="text-[#94A3B8] tabular-nums">
                        {alloc.assignedTickets === 0 ? (
                          <span className="text-[#94A3B8]">
                            Sem bilhete · Faltam <strong className="text-[#F8FAFC] font-mono">{neededNext}</strong> moedas
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#0866F5]/15 border border-[#0866F5]/35 text-[#35B9F5] font-mono font-bold">
                            <Ticket className="w-3.5 h-3.5 text-[#00A9FF]" />
                            {alloc.assignedTickets} {alloc.assignedTickets === 1 ? 'bilhete' : 'bilhetes'}
                          </span>
                        )}
                      </span>

                      {alloc.tickets.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {ticketsToDisplay.map((num) => {
                            const isTargetTicket = isValidTicketSearch && num === parsedTicketNum;
                            return (
                              <span
                                key={num}
                                className={`font-mono font-semibold px-2 py-0.5 rounded-md text-xs tabular-nums transition ${
                                  isTargetTicket
                                    ? 'bg-[#F5B942] text-[#050D20] font-bold ring-1 ring-[#F5B942] shadow-xs'
                                    : 'bg-[#101F3D] text-[#F8FAFC] border border-white/[0.08]'
                                }`}
                              >
                                #{num} {isTargetTicket && '★'}
                              </span>
                            );
                          })}
                          {alloc.tickets.length > ticketsToDisplay.length && (
                            <span className="text-[#94A3B8] text-xs font-mono tabular-nums px-1">
                              +{alloc.tickets.length - ticketsToDisplay.length} mais
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-[#94A3B8] text-xs flex items-center gap-2 ml-auto font-mono tabular-nums">
                      {alloc.assignedTickets > 0 && (
                        <span className="px-2.5 py-0.5 rounded-md bg-[#20C997]/15 border border-[#20C997]/35 text-[#20C997] font-bold">
                          {alloc.winProbability}% chance
                        </span>
                      )}
                      {alloc.assignedTickets < alloc.wantedTickets && (
                        <span className="text-[#F05262] font-medium font-sans">
                          (Faltaram {alloc.wantedTickets - alloc.assignedTickets} por limite)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {participants.length > 0 && (
          <div className="pt-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs sm:text-sm text-[#94A3B8] tabular-nums">
              Total acumulado:{' '}
              <strong className="text-[#F5B942] font-mono text-sm">
                {participants.reduce((acc, p) => acc + p.coins, 0)} moedas
              </strong>
            </span>

            {isConfirmingClear ? (
              <div className="flex items-center gap-2 bg-[#F05262]/10 border border-[#F05262]/30 p-1.5 rounded-lg">
                <span className="text-xs text-[#F05262] font-semibold px-1">Confirmar exclusão de todos?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setIsConfirmingClear(false);
                    showFeedback('Todos os participantes foram removidos.');
                  }}
                  className="px-2.5 py-1 text-xs font-semibold bg-[#F05262] hover:bg-[#F05262]/90 text-[#F8FAFC] rounded-md transition shadow-xs"
                >
                  Sim, Apagar Tudo
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingClear(false)}
                  className="px-2.5 py-1 text-xs text-[#94A3B8] hover:text-[#F8FAFC]"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingClear(true)}
                className="text-xs text-[#94A3B8] hover:text-[#F05262] transition flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-[#F05262]/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpar todos os participantes</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Advanced File & Participant Import Modal */}
      <ParticipantImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentParticipants={participants}
        settings={settings}
        onConfirmImport={(newParticipants) => {
          if (onSetParticipants) {
            onSetParticipants(newParticipants);
          } else {
            onBulkAdd(newParticipants.map((p) => ({ name: p.name, coins: p.coins })), true);
          }
          playCoinChime();
          showFeedback(`${newParticipants.length} participantes configurados na lista com sucesso!`);
        }}
      />
    </div>
  );
};
