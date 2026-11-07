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
    <div className="space-y-5 min-w-0 overflow-x-hidden">
      {/* Add Participant & Conversion Rule Card */}
      <div className="rounded-xl bg-[#101F3D] border border-[#182943] p-5 sm:p-6 space-y-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#182943] border border-[#00A9FF]/30 flex items-center justify-center text-[#00A9FF]">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-base sm:text-lg text-[#F8FAFC]">
                Adicionar Participantes
              </h2>
              <p className="text-xs text-[#94A3B8] font-mono tabular-nums">
                Conversão persistida: <strong className="text-[#F8FAFC]">{settings.rate} moedas = 1 bilhete</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsBulkOpen(!isBulkOpen)}
              className="text-xs font-medium min-h-[36px] px-3 py-1.5 rounded-lg bg-[#0B1730] hover:bg-[#182943] text-[#F8FAFC] border border-[#182943] transition"
            >
              {isBulkOpen ? 'Fechar Colagem' : 'Colar Lista'}
            </button>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="text-xs font-medium min-h-[36px] px-3 py-1.5 rounded-lg bg-[#0B1730] hover:bg-[#182943] border border-[#182943] text-[#F8FAFC] transition flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#00A9FF]" />
              <span className="hidden sm:inline">Importar Planilha/Lista</span>
              <span className="sm:hidden">Importar</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={participants.length === 0}
              title="Exportar lista atual de participantes e saldo de moedas em CSV"
              className="text-xs font-medium min-h-[36px] px-3 py-1.5 rounded-lg bg-[#0B1730] hover:bg-[#182943] text-[#F8FAFC] border border-[#182943] transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5 text-[#F5B942]" />
              <span className="hidden sm:inline">Exportar CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
          </div>
        </div>

        {/* Real Persisted Conversion Rate Bar (when onUpdateSettings is provided) */}
        {onUpdateSettings && (
          <div className="p-3 rounded-lg bg-[#0B1730] border border-[#182943] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[#94A3B8]">
              <Sliders className="w-3.5 h-3.5 text-[#F5B942] shrink-0" />
              <span>Regra de conversão deste sorteio (moedas por bilhete):</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-[#101F3D] border border-[#182943] rounded-lg px-2.5 py-1">
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
              <div className="flex items-center gap-1.5 bg-[#101F3D] border border-[#182943] rounded-lg px-2.5 py-1">
                <span className="text-[11px] text-[#94A3B8]">Limite:</span>
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
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-6">
              <label htmlFor="participant-name-input" className="block text-xs text-[#94A3B8] mb-1 font-medium">
                Nome ou @usuário
              </label>
              <input
                id="participant-name-input"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Ex.: Mariana Silva"
                className="w-full min-h-[42px] bg-[#0B1730] border border-[#182943] rounded-lg px-3.5 py-2 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00A9FF]"
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="participant-coins-input" className="block text-xs text-[#94A3B8] mb-1 font-medium">
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
                  className="w-full min-h-[42px] bg-[#0B1730] border border-[#182943] rounded-lg pl-3.5 pr-8 py-2 text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00A9FF] font-mono tabular-nums"
                />
                <Coins className="w-4 h-4 text-[#F5B942] absolute right-2.5 top-3 pointer-events-none" />
              </div>
            </div>
            <div className="sm:col-span-3 flex items-end">
              <button
                type="submit"
                className="w-full min-h-[42px] py-2 px-4 bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-semibold text-sm rounded-lg transition active:scale-[0.99] shadow-sm"
              >
                + Adicionar
              </button>
            </div>
          </div>
        </form>

        {/* Bulk Paste Accordion */}
        {isBulkOpen && (
          <div className="pt-3 border-t border-[#182943] space-y-2.5">
            <div className="flex items-center justify-between text-xs text-[#94A3B8]">
              <span className="font-semibold text-[#F8FAFC]">Colar Lista de Participantes</span>
              <span>Formato: Nome {settings.rate} (um por linha)</span>
            </div>
            <textarea
              rows={4}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`Ana ${settings.rate * 2}\nBruno, ${settings.rate}\nCarla; ${settings.rate * 3}`}
              className="w-full bg-[#0B1730] border border-[#182943] rounded-lg p-3 text-xs sm:text-sm text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00A9FF] font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkText('')}
                className="px-3 py-1.5 text-xs text-[#94A3B8] hover:text-[#F8FAFC]"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={handleBulkSubmit}
                className="px-4 py-1.5 bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] font-semibold text-xs rounded-lg transition"
              >
                Processar e Adicionar
              </button>
            </div>
          </div>
        )}

        {/* File Import Accordion */}
        {isImportOpen && (
          <div className="pt-3 border-t border-[#182943] space-y-3">
            <div className="text-xs text-[#F8FAFC] font-semibold">
              Importar de Planilha (.xlsx, .xls) ou Texto (.csv, .txt, .tsv)
            </div>
            <div className="p-4 bg-[#0B1730] border border-dashed border-[#182943] rounded-lg text-center space-y-2">
              <Upload className="w-6 h-6 text-[#94A3B8] mx-auto" />
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
                className="w-3.5 h-3.5 rounded text-[#0866F5] bg-[#0B1730] border-[#182943]"
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
                ? 'bg-[#F05262]/10 border-[#F05262]/40 text-[#F05262]'
                : feedbackMsg.type === 'warn'
                ? 'bg-[#F5B942]/10 border-[#F5B942]/40 text-[#F5B942]'
                : 'bg-[#20C997]/10 border-[#20C997]/40 text-[#20C997]'
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
      <div className="rounded-xl bg-[#101F3D] border border-[#182943] p-5 sm:p-6 space-y-4 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#182943]">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-semibold text-base sm:text-lg text-[#F8FAFC]">
                Participantes do Sorteio
              </h2>
              <span className="text-xs font-mono font-bold bg-[#182943] border border-[#00A9FF]/30 text-[#00A9FF] px-2 py-0.5 rounded tabular-nums">
                {participants.length}
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] mt-0.5 font-mono tabular-nums">
              <strong className="text-[#F8FAFC]">{computed.usedCount}</strong> de{' '}
              <strong className="text-[#F8FAFC]">{settings.total}</strong> bilhetes emitidos ({settings.rate} moedas = 1 bilhete)
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {/* Filter by Name */}
            <div className="relative flex-1 sm:w-40 min-w-[130px]">
              <input
                type="text"
                placeholder="Filtrar nome..."
                aria-label="Filtrar participante por nome"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="bg-[#0B1730] border border-[#182943] rounded-lg pl-8 pr-7 py-2 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none focus:border-[#00A9FF] w-full min-h-[36px]"
              />
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-2.5 pointer-events-none" />
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
            <div className="relative flex-1 sm:w-32 min-w-[110px]">
              <input
                type="text"
                inputMode="numeric"
                placeholder="Nº Bilhete..."
                aria-label="Buscar por número de bilhete"
                value={ticketSearchQuery}
                onChange={(e) => setTicketSearchQuery(e.target.value)}
                className={`bg-[#0B1730] border rounded-lg pl-8 pr-7 py-2 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8]/50 focus:outline-none w-full min-h-[36px] tabular-nums font-mono ${
                  isValidTicketSearch
                    ? 'border-[#F5B942] text-[#F5B942] bg-[#F5B942]/10'
                    : 'border-[#182943] focus:border-[#00A9FF]'
                }`}
              />
              <Ticket
                className={`w-3.5 h-3.5 absolute left-2.5 top-2.5 pointer-events-none ${
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
            <div className="flex items-center gap-1 bg-[#0B1730] border border-[#182943] rounded-lg px-2.5 py-1.5 text-xs text-[#F8FAFC] min-h-[36px]">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#94A3B8]" />
              <select
                value={sortBy}
                aria-label="Ordenar participantes por"
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-[#0B1730] text-xs text-[#F8FAFC] focus:outline-none cursor-pointer py-0.5"
              >
                <option value="tickets-desc">Mais bilhetes</option>
                <option value="coins-desc">Mais moedas</option>
                <option value="name-asc">Nome (A-Z)</option>
                <option value="recent">Mais recentes</option>
              </select>
            </div>
          </div>
        </div>

        {/* Ticket Search Active Status Bar */}
        {isValidTicketSearch && (
          <div
            className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs transition ${
              ticketHolder
                ? 'bg-[#F5B942]/10 border-[#F5B942]/50 text-[#F8FAFC]'
                : 'bg-[#0B1730] border-[#182943] text-[#94A3B8]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Ticket className={`w-4 h-4 shrink-0 ${ticketHolder ? 'text-[#F5B942]' : 'text-[#94A3B8]'}`} />
              {ticketHolder ? (
                <div className="truncate">
                  <span>Bilhete </span>
                  <span className="font-mono font-bold text-[#F5B942] bg-[#101F3D] border border-[#F5B942]/40 px-1.5 py-0.5 rounded mr-1 tabular-nums">
                    #{parsedTicketNum}
                  </span>
                  <span>pertence a </span>
                  <strong className="text-[#F8FAFC]">{ticketHolder.participant.name}</strong>
                  <span className="text-[#94A3B8] ml-1 font-mono tabular-nums">
                    ({ticketHolder.assignedTickets} {ticketHolder.assignedTickets === 1 ? 'bilhete' : 'bilhetes'})
                  </span>
                </div>
              ) : (
                <div>
                  <span>Bilhete </span>
                  <span className="font-mono font-bold text-[#F8FAFC] bg-[#101F3D] border border-[#182943] px-1.5 py-0.5 rounded mr-1 tabular-nums">
                    #{parsedTicketNum}
                  </span>
                  <span>não atribuído a nenhum participante</span>
                  {parsedTicketNum < settings.start || parsedTicketNum >= settings.start + settings.total ? (
                    <span className="text-[#F05262] ml-1 font-medium">
                      (fora da série #{settings.start} a #{settings.start + settings.total - 1})
                    </span>
                  ) : (
                    <span className="text-[#94A3B8] ml-1">(disponível na série)</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setFilterOnlyTicketMatch(!filterOnlyTicketMatch)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition border ${
                  filterOnlyTicketMatch
                    ? 'bg-[#F5B942] text-[#050D20] border-[#F5B942]'
                    : 'bg-[#101F3D] text-[#F8FAFC] border-[#182943]'
                }`}
              >
                <span>{filterOnlyTicketMatch ? 'Filtrando Portador' : 'Destacando na Lista'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTicketSearchQuery('')}
                className="p-1 hover:bg-[#182943] rounded text-[#94A3B8] hover:text-[#F8FAFC] transition"
                title="Limpar busca de bilhete"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Participant List */}
        {participants.length === 0 ? (
          <div className="py-10 text-center space-y-2 border border-dashed border-[#182943] rounded-xl bg-[#0B1730]/80">
            <p className="text-sm font-semibold text-[#F8FAFC]">Nenhum participante cadastrado ainda</p>
            <p className="text-xs text-[#94A3B8]">
              Adicione participantes individualmente ou importe uma lista no formulário acima.
            </p>
          </div>
        ) : filteredAllocations.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#94A3B8] space-y-2">
            <p>
              {isValidTicketSearch
                ? `Nenhum participante possui o bilhete #${parsedTicketNum}.`
                : `Nenhum participante encontrado com o termo "${filterQuery}".`}
            </p>
            {isValidTicketSearch && (
              <button
                type="button"
                onClick={() => setTicketSearchQuery('')}
                className="px-3 py-1 bg-[#182943] hover:bg-[#0866F5]/20 text-[#00A9FF] rounded-lg text-xs font-semibold"
              >
                Limpar busca de bilhete
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
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
                  className={`p-3.5 rounded-xl border transition-all duration-200 ${
                    isHoldingSearchedTicket
                      ? 'bg-[#182943] border-[#F5B942] ring-1 ring-[#F5B942]/60'
                      : hasWon
                      ? 'bg-[#0B1730]/90 border-[#20C997]/40'
                      : 'bg-[#0B1730] border-[#182943] hover:border-[#00A9FF]/40'
                  }`}
                >
                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="font-semibold text-sm text-[#F8FAFC] truncate max-w-[200px] sm:max-w-none">
                        {p.name}
                      </span>
                      {isHoldingSearchedTicket && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-[#F5B942] text-[#050D20] px-2 py-0.5 rounded flex items-center gap-1 shrink-0 font-mono tabular-nums">
                          <Ticket className="w-3 h-3" />
                          <span>Portador #{parsedTicketNum}</span>
                        </span>
                      )}
                      {hasWon && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#20C997]/20 text-[#20C997] px-2 py-0.5 rounded border border-[#20C997]/40 shrink-0">
                          Premiado
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-auto">
                      <div className="flex items-center gap-1.5 bg-[#101F3D] border border-[#182943] rounded-lg px-2 py-1 min-h-[34px]">
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
                          className="w-16 bg-[#0B1730] border border-[#182943] rounded px-1.5 py-0.5 text-xs text-right text-[#F8FAFC] font-mono font-bold focus:outline-none focus:border-[#00A9FF] tabular-nums"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveParticipant(p.id)}
                        title={`Remover ${p.name}`}
                        aria-label={`Remover participante ${p.name}`}
                        className="min-w-[34px] min-h-[34px] p-1.5 flex items-center justify-center text-[#94A3B8] hover:text-[#F05262] hover:bg-[#101F3D] rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-[#182943]/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-[#94A3B8] tabular-nums">
                        {alloc.assignedTickets === 0 ? (
                          <span className="text-[#94A3B8]">
                            Sem bilhete · Faltam <strong className="text-[#F8FAFC] font-mono">{neededNext}</strong> moedas
                          </span>
                        ) : (
                          <span>
                            <strong className="text-[#F8FAFC] font-mono">{alloc.assignedTickets}</strong>{' '}
                            {alloc.assignedTickets === 1 ? 'bilhete' : 'bilhetes'}:
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
                                className={`font-mono font-semibold px-1.5 py-0.5 rounded text-[11px] tabular-nums transition ${
                                  isTargetTicket
                                    ? 'bg-[#F5B942] text-[#050D20] font-bold ring-1 ring-[#F5B942]'
                                    : 'bg-[#182943] text-[#F8FAFC] border border-[#00A9FF]/20'
                                }`}
                              >
                                #{num} {isTargetTicket && '★'}
                              </span>
                            );
                          })}
                          {alloc.tickets.length > ticketsToDisplay.length && (
                            <span className="text-[#94A3B8] text-[11px] font-mono tabular-nums">
                              +{alloc.tickets.length - ticketsToDisplay.length}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-[#94A3B8] text-[11px] flex items-center gap-2 ml-auto font-mono tabular-nums">
                      {alloc.assignedTickets > 0 && (
                        <span className="text-[#20C997] font-semibold">
                          {alloc.winProbability}% de chance
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
          <div className="pt-3 border-t border-[#182943] flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[#94A3B8] tabular-nums">
              Total de moedas acumuladas:{' '}
              <strong className="text-[#F5B942] font-mono">
                {participants.reduce((acc, p) => acc + p.coins, 0)}
              </strong>
            </span>

            {isConfirmingClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#F05262] font-semibold">Apagar todos?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setIsConfirmingClear(false);
                    showFeedback('Todos os participantes foram removidos.');
                  }}
                  className="px-2.5 py-1 text-xs font-semibold bg-[#F05262] text-[#F8FAFC] rounded transition"
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
                className="text-xs text-[#94A3B8] hover:text-[#F05262] transition"
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
