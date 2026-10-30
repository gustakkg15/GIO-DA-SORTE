import React, { useState, useRef } from 'react';
import {
  UserPlus,
  FileSpreadsheet,
  Trash2,
  Coins,
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Upload,
  Ticket,
  X,
  Hash,
  Download,
} from 'lucide-react';
import { Participant, RaffleSettings, ComputedRaffle, Winner } from '../types';
import {
  parseRawTextList,
  parseExcelBuffer,
  generateUid,
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
  onBulkAdd: (list: { name: string; coins: number }[], replace: boolean) => void;
  onSetParticipants?: (list: Participant[]) => void;
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
}) => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [coinsInput, setCoinsInput] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'warn' | 'error' } | null>(null);

  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [replaceOnImport, setReplaceOnImport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [filterQuery, setFilterQuery] = useState('');
  const [ticketSearchQuery, setTicketSearchQuery] = useState('');
  const [filterOnlyTicketMatch, setFilterOnlyTicketMatch] = useState(true);
  const [sortBy, setSortBy] = useState<'coins-desc' | 'name-asc' | 'tickets-desc' | 'recent'>('tickets-desc');

  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const wonIds = new Set(winners.map((w) => w.participantId));

  const showFeedback = (text: string, type: 'success' | 'warn' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nameInput.trim();
    const parsedCoins = parseInt(coinsInput, 10);

    if (!cleanName) {
      showFeedback('Por favor, informe o nome do participante.', 'warn');
      return;
    }
    if (isNaN(parsedCoins) || parsedCoins < 0) {
      showFeedback('Informe uma quantidade válida de moedas.', 'warn');
      return;
    }

    onAddParticipant(cleanName, parsedCoins);
    playCoinChime();
    showFeedback(`${cleanName} adicionado(a) com ${parsedCoins} moedas.`);
    setNameInput('');
    setCoinsInput('');
  };

  const handleBulkSubmit = () => {
    if (!bulkText.trim()) {
      showFeedback('Cole os dados no campo de texto.', 'warn');
      return;
    }

    const parsed = parseRawTextList(bulkText);
    if (parsed.length === 0) {
      showFeedback('Nenhum formato válido encontrado. Use: Nome 200 (uma linha por pessoa).', 'error');
      return;
    }

    onBulkAdd(parsed, false);
    playCoinChime();
    showFeedback(`${parsed.length} participantes processados com sucesso!`);
    setBulkText('');
    setIsBulkOpen(false);
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
      }
    } catch {
      showFeedback('Erro ao ler arquivo. Verifique o formato.', 'error');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExportCsv = () => {
    if (participants.length === 0) {
      showFeedback('Nenhum participante para exportar.', 'warn');
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
    // If ticket is searched in highlight mode (not strictly filtered), place matching ticket holder at top for fast audit
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
    <div className="space-y-6">
      {/* Add Participant Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4 animate-card-enter neon-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-sky-400" />
            <h2 className="font-display font-bold text-base sm:text-lg text-white">Adicionar Participante</h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsBulkOpen(!isBulkOpen)}
              className="text-xs font-semibold min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {isBulkOpen ? 'Fechar Lista' : 'Colar Lista'}
            </button>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="text-xs font-bold min-h-[36px] px-3 py-1.5 rounded-xl bg-blue-600/30 border border-blue-500/50 text-sky-200 hover:text-white hover:bg-blue-600/50 transition flex items-center gap-1.5 shadow-sm active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">Importar (.xlsx, .csv, .txt)</span>
              <span className="sm:hidden">Importar</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={participants.length === 0}
              title="Exportar lista atual de participantes e saldo de moedas em CSV"
              className="text-xs font-bold min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 hover:text-emerald-100 border border-emerald-700/60 transition flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Exportar CSV</span>
              <span className="sm:hidden">Exportar</span>
            </button>
          </div>
        </div>

        {/* Single participant form */}
        <form onSubmit={handleSingleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-7">
              <label htmlFor="participant-name-input" className="block text-xs text-slate-400 mb-1 font-medium">Nome da pessoa</label>
              <input
                id="participant-name-input"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Ex.: Mariana Silva"
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400 focus-visible:ring-2 focus-visible:ring-sky-400"
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="participant-coins-input" className="block text-xs text-slate-400 mb-1 font-medium">Moedas acumuladas</label>
              <div className="relative">
                <input
                  id="participant-coins-input"
                  type="number"
                  min="0"
                  step="1"
                  value={coinsInput}
                  onChange={(e) => setCoinsInput(e.target.value)}
                  placeholder="Ex.: 300"
                  className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl pl-3.5 pr-8 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400 focus-visible:ring-2 focus-visible:ring-sky-400 tabular-nums"
                />
                <Coins className="w-4 h-4 text-sky-400 absolute right-2.5 top-3.5 pointer-events-none" />
              </div>
            </div>
            <div className="sm:col-span-2 flex items-end">
              <button
                type="submit"
                className="w-full min-h-[44px] py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition active:scale-95 shadow-md shadow-blue-600/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                Adicionar
              </button>
            </div>
          </div>
        </form>

        {/* Bulk Paste Accordion */}
        {isBulkOpen && (
          <div className="pt-3 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-200">Colar Lista de Participantes</span>
              <span>Formato: Nome 200 (um por linha)</span>
            </div>
            <textarea
              rows={4}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="Ana 250&#10;Bruno, 100&#10;Carla; 340&#10;Diego 500"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs sm:text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400 font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkText('')}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={handleBulkSubmit}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 font-bold text-xs rounded-lg transition"
              >
                Processar e Adicionar
              </button>
            </div>
          </div>
        )}

        {/* File Import Accordion */}
        {isImportOpen && (
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="text-xs text-slate-300 font-semibold">
              Importar de Planilha (.xlsx, .xls) ou Texto (.csv, .txt, .tsv)
            </div>
            <div className="p-4 bg-slate-950 border border-dashed border-slate-700 rounded-xl text-center space-y-2">
              <Upload className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-xs text-slate-400">
                Selecione o arquivo da lista. A primeira coluna deve conter os nomes e a segunda as moedas.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={replaceOnImport}
                onChange={(e) => setReplaceOnImport(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-blue-600 bg-slate-800 border-slate-700"
              />
              <span>Substituir a lista existente por esta (apagar os atuais)</span>
            </label>
          </div>
        )}

        {/* Feedback Alert Bar */}
        {feedbackMsg && (
          <div
            className={`text-xs p-2.5 rounded-lg border flex items-center justify-between ${
              feedbackMsg.type === 'error'
                ? 'bg-red-950/40 border-red-800 text-red-300'
                : feedbackMsg.type === 'warn'
                ? 'bg-blue-950/60 border-blue-800 text-sky-300'
                : 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
            }`}
          >
            <span>{feedbackMsg.text}</span>
          </div>
        )}
      </div>

      {/* Capacity & Distribution Warning */}
      {isCapacityExceeded && (
        <div className="bg-blue-950/40 border border-blue-800/60 rounded-xl p-3.5 flex items-start gap-3 text-sky-200 text-xs">
          <AlertTriangle className="w-5 h-5 shrink-0 text-sky-400 mt-0.5" />
          <div>
            <p className="font-bold text-white">Capacidade de bilhetes esgotada!</p>
            <p className="text-sky-200/80 mt-0.5">
              Os participantes acumularam moedas para mais bilhetes do que o total disponível ({settings.total}). Os
              últimos participantes da lista ficaram sem alguns números. Aumente a "Quantidade de números" em
              Configurações para contemplar todos.
            </p>
          </div>
        </div>
      )}

      {/* Participants Table & List View */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4 animate-card-enter neon-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-lg text-white">Participantes</h2>
              <span className="text-xs font-bold bg-blue-950 border border-blue-800 text-sky-300 px-2.5 py-0.5 rounded-full tabular-nums">
                {participants.length}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              <b className="text-slate-200">{computed.usedCount}</b> de <b className="text-slate-200">{settings.total}</b> bilhetes entregues (a cada {settings.rate} moedas = 1 bilhete)
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {/* Filter by Name */}
            <div className="relative flex-1 sm:w-40">
              <input
                type="text"
                placeholder="Filtrar nome..."
                aria-label="Filtrar participante por nome"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-7 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-400 focus-visible:ring-2 focus-visible:ring-sky-400 w-full min-h-[38px]"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-3 pointer-events-none" />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  className="absolute right-2 top-2.5 text-slate-500 hover:text-white"
                  title="Limpar filtro de nome"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter / Search by Ticket Number */}
            <div className="relative flex-1 sm:w-36">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Nº Bilhete..."
                aria-label="Buscar por número de bilhete"
                value={ticketSearchQuery}
                onChange={(e) => setTicketSearchQuery(e.target.value)}
                className={`bg-slate-950 border rounded-lg pl-8 pr-7 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 w-full min-h-[38px] tabular-nums font-mono ${
                  isValidTicketSearch
                    ? 'border-amber-500 text-amber-300 ring-1 ring-amber-500/40 bg-amber-950/20'
                    : 'border-slate-700 focus:border-blue-400 focus-visible:ring-sky-400'
                }`}
              />
              <Ticket
                className={`w-3.5 h-3.5 absolute left-2.5 top-3 pointer-events-none ${
                  isValidTicketSearch ? 'text-amber-400' : 'text-slate-500'
                }`}
              />
              {ticketSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTicketSearchQuery('')}
                  className="absolute right-2 top-2.5 text-slate-500 hover:text-white"
                  title="Limpar busca de bilhete"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 min-h-[38px]">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                aria-label="Ordenar participantes por"
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer py-1"
              >
                <option value="tickets-desc">Mais bilhetes</option>
                <option value="coins-desc">Mais moedas</option>
                <option value="name-asc">Nome (A-Z)</option>
                <option value="recent">Adicionados recente</option>
              </select>
            </div>

            {/* Quick Export CSV Button */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={participants.length === 0}
              title="Baixar lista atual de participantes e saldo de moedas em formato CSV"
              className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-900 border border-emerald-600/40 hover:border-emerald-500 text-emerald-300 hover:text-white rounded-lg px-3 py-2 text-xs font-bold min-h-[38px] transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Exportar CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
          </div>
        </div>

        {/* Ticket Search Active Status Bar */}
        {isValidTicketSearch && (
          <div
            className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs transition animate-fade-in ${
              ticketHolder
                ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                : 'bg-slate-950 border-slate-800 text-slate-400'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Ticket className={`w-4 h-4 shrink-0 ${ticketHolder ? 'text-amber-400' : 'text-slate-500'}`} />
              {ticketHolder ? (
                <div className="truncate">
                  <span>Bilhete </span>
                  <span className="font-mono font-black text-amber-300 bg-amber-900/60 border border-amber-500/40 px-1.5 py-0.5 rounded mr-1">
                    #{parsedTicketNum}
                  </span>
                  <span>encontrado! Pertence a: </span>
                  <b className="text-white font-bold">{ticketHolder.participant.name}</b>
                  <span className="text-amber-300/80 ml-1">
                    ({ticketHolder.assignedTickets} {ticketHolder.assignedTickets === 1 ? 'bilhete' : 'bilhetes'})
                  </span>
                </div>
              ) : (
                <div>
                  <span>Bilhete </span>
                  <span className="font-mono font-bold text-slate-300 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded mr-1">
                    #{parsedTicketNum}
                  </span>
                  <span>não pertence a nenhum participante cadastrado</span>
                  {parsedTicketNum < settings.start || parsedTicketNum >= settings.start + settings.total ? (
                    <span className="text-rose-400 ml-1 font-semibold">
                      (fora da série #{settings.start} a #{settings.start + settings.total - 1})
                    </span>
                  ) : (
                    <span className="text-slate-500 ml-1">(ainda não distribuído na série)</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setFilterOnlyTicketMatch(!filterOnlyTicketMatch)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 border ${
                  filterOnlyTicketMatch
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:text-white'
                }`}
                title="Alternar entre filtrar apenas o portador ou manter todos e destacar"
              >
                <span>{filterOnlyTicketMatch ? 'Modo: Filtrando Portador' : 'Modo: Destacando na Lista'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTicketSearchQuery('')}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition"
                title="Limpar busca de bilhete"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Participant List */}
        {participants.length === 0 ? (
          <div className="py-12 text-center space-y-2 border border-dashed border-slate-800 rounded-xl">
            <p className="text-sm font-semibold text-slate-400">Nenhum participante cadastrado ainda.</p>
            <p className="text-xs text-slate-500">Adicione pessoas individualmente ou importe uma planilha acima.</p>
          </div>
        ) : filteredAllocations.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 space-y-2">
            <p>
              {isValidTicketSearch
                ? `Nenhum participante possui o bilhete #${parsedTicketNum}.`
                : `Nenhum participante encontrado com o termo "${filterQuery}".`}
            </p>
            {isValidTicketSearch && (
              <button
                type="button"
                onClick={() => setTicketSearchQuery('')}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg text-xs font-semibold"
              >
                Limpar busca de bilhete
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
            {filteredAllocations.map((alloc) => {
              const p = alloc.participant;
              const hasWon = wonIds.has(p.id);
              const neededNext = settings.rate - alloc.remainderCoins;
              const isHoldingSearchedTicket = isValidTicketSearch && alloc.tickets.includes(parsedTicketNum);

              // Prepare tickets to display: ensure the searched ticket is always visible in the badge list
              let ticketsToDisplay = alloc.tickets.slice(0, 10);
              if (isHoldingSearchedTicket && !ticketsToDisplay.includes(parsedTicketNum)) {
                ticketsToDisplay = [parsedTicketNum, ...ticketsToDisplay.slice(0, 9)];
              }

              return (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-xl border transition-all duration-200 ${
                    isHoldingSearchedTicket
                      ? 'bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/20 border-amber-400 ring-2 ring-amber-400/50 shadow-lg shadow-amber-500/10'
                      : hasWon
                      ? 'bg-blue-950/20 border-blue-700/50'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="font-bold text-sm text-white truncate">{p.name}</span>
                      {isHoldingSearchedTicket && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 px-2 py-0.5 rounded flex items-center gap-1 shadow-sm shrink-0">
                          <Ticket className="w-3 h-3 fill-slate-950" />
                          <span>Portador do Bilhete #{parsedTicketNum}</span>
                        </span>
                      )}
                      {hasWon && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-600/30 text-sky-300 px-2 py-0.5 rounded border border-blue-500/40 shrink-0">
                          Já Ganhou
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 min-h-[36px]">
                        <span className="text-xs text-slate-400 font-medium">Moedas:</span>
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
                          className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-xs text-right text-sky-400 font-bold focus:outline-none focus:border-blue-400 tabular-nums"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveParticipant(p.id)}
                        title={`Remover ${p.name}`}
                        aria-label={`Remover participante ${p.name}`}
                        className="min-w-[36px] min-h-[36px] p-2 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-slate-900 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">
                        {alloc.assignedTickets === 0 ? (
                          <span className="text-slate-500">
                            Sem bilhete ainda · Faltam <b>{neededNext}</b> moedas
                          </span>
                        ) : (
                          <span>
                            <b className="text-white">{alloc.assignedTickets}</b> {alloc.assignedTickets === 1 ? 'bilhete' : 'bilhetes'}:
                          </span>
                        )}
                      </span>

                      {alloc.tickets.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1">
                          {ticketsToDisplay.map((num) => {
                            const isTargetTicket = isValidTicketSearch && num === parsedTicketNum;
                            return (
                              <span
                                key={num}
                                className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] tabular-nums transition ${
                                  isTargetTicket
                                    ? 'bg-gradient-to-r from-amber-400 to-yellow-400 text-slate-950 font-black shadow-md ring-2 ring-amber-300 scale-105'
                                    : 'bg-blue-600 text-white'
                                }`}
                              >
                                #{num} {isTargetTicket && '★'}
                              </span>
                            );
                          })}
                          {alloc.tickets.length > ticketsToDisplay.length && (
                            <span className="text-slate-400 text-[11px] font-medium">
                              +{alloc.tickets.length - ticketsToDisplay.length} mais
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-slate-400 text-[11px] flex items-center gap-2 ml-auto">
                      {alloc.assignedTickets > 0 && (
                        <span className="text-sky-400 font-semibold tabular-nums">
                          {alloc.winProbability}% de chance
                        </span>
                      )}
                      {alloc.assignedTickets < alloc.wantedTickets && (
                        <span className="text-red-400 font-medium">
                          (Faltaram {alloc.wantedTickets - alloc.assignedTickets} por limite de vagas)
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
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Total de moedas acumuladas: <b className="text-sky-300 font-bold">{participants.reduce((acc, p) => acc + p.coins, 0)}</b>
            </span>

            {isConfirmingClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-400 font-semibold">Tem certeza?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setIsConfirmingClear(false);
                    showFeedback('Todos os participantes foram removidos.');
                  }}
                  className="px-2.5 py-1 text-xs font-bold bg-red-600 hover:bg-red-500 text-white rounded transition"
                >
                  Sim, Apagar Tudo
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingClear(false)}
                  className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingClear(true)}
                className="text-xs text-slate-500 hover:text-red-400 transition"
              >
                Limpar todos os participantes
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
