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
      <div className="rounded-xl bg-[#222B28] border border-[#313D39] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2B3632] border border-[#313D39] flex items-center justify-center text-[#6EAA90]">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-base sm:text-lg text-[#EAE7DE]">
                Adicionar Participantes
              </h2>
              <p className="text-xs text-[#9BA8A3] tabular-nums">
                Conversão persistida: <strong className="text-[#EAE7DE]">{settings.rate} moedas = 1 bilhete</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsBulkOpen(!isBulkOpen)}
              className="text-xs font-medium min-h-[36px] px-3 py-1.5 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] transition"
            >
              {isBulkOpen ? 'Fechar Colagem' : 'Colar Lista'}
            </button>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="text-xs font-medium min-h-[36px] px-3 py-1.5 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] border border-[#313D39] text-[#EAE7DE] transition flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#6EAA90]" />
              <span className="hidden sm:inline">Importar Planilha/Lista</span>
              <span className="sm:hidden">Importar</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={participants.length === 0}
              title="Exportar lista atual de participantes e saldo de moedas em CSV"
              className="text-xs font-medium min-h-[36px] px-3 py-1.5 rounded-lg bg-[#171D1C] hover:bg-[#2B3632] text-[#EAE7DE] border border-[#313D39] transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5 text-[#C6A56A]" />
              <span className="hidden sm:inline">Exportar CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
          </div>
        </div>

        {/* Real Persisted Conversion Rate Bar (when onUpdateSettings is provided) */}
        {onUpdateSettings && (
          <div className="p-3 rounded-lg bg-[#171D1C] border border-[#313D39] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-[#9BA8A3]">
              <Sliders className="w-3.5 h-3.5 text-[#C6A56A] shrink-0" />
              <span>Regra de conversão deste sorteio (moedas por bilhete):</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-[#222B28] border border-[#313D39] rounded-lg px-2.5 py-1">
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
                  className="w-16 bg-transparent text-right font-mono font-bold text-xs text-[#C6A56A] focus:outline-none tabular-nums"
                />
                <span className="text-[11px] text-[#9BA8A3]">moedas = 1 bilhete</span>
              </div>
              <div className="flex items-center gap-1.5 bg-[#222B28] border border-[#313D39] rounded-lg px-2.5 py-1">
                <span className="text-[11px] text-[#9BA8A3]">Limite:</span>
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
                  className="w-16 bg-transparent text-right font-mono font-bold text-xs text-[#EAE7DE] focus:outline-none tabular-nums"
                />
                <span className="text-[11px] text-[#9BA8A3]">bilhetes</span>
              </div>
            </div>
          </div>
        )}

        {/* Single participant form */}
        <form onSubmit={handleSingleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-6">
              <label htmlFor="participant-name-input" className="block text-xs text-[#9BA8A3] mb-1 font-medium">
                Nome ou @usuário
              </label>
              <input
                id="participant-name-input"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Ex.: Mariana Silva"
                className="w-full min-h-[42px] bg-[#171D1C] border border-[#313D39] rounded-lg px-3.5 py-2 text-sm text-[#EAE7DE] placeholder:text-[#9BA8A3]/50 focus:outline-none focus:border-[#6EAA90]"
              />
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="participant-coins-input" className="block text-xs text-[#9BA8A3] mb-1 font-medium">
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
                  className="w-full min-h-[42px] bg-[#171D1C] border border-[#313D39] rounded-lg pl-3.5 pr-8 py-2 text-sm text-[#EAE7DE] placeholder:text-[#9BA8A3]/50 focus:outline-none focus:border-[#6EAA90] font-mono tabular-nums"
                />
                <Coins className="w-4 h-4 text-[#C6A56A] absolute right-2.5 top-3 pointer-events-none" />
              </div>
            </div>
            <div className="sm:col-span-3 flex items-end">
              <button
                type="submit"
                className="w-full min-h-[42px] py-2 px-4 bg-[#6EAA90] hover:bg-[#5E9980] text-[#171D1C] font-semibold text-sm rounded-lg transition active:scale-[0.99]"
              >
                + Adicionar
              </button>
            </div>
          </div>
        </form>

        {/* Bulk Paste Accordion */}
        {isBulkOpen && (
          <div className="pt-3 border-t border-[#313D39] space-y-2.5">
            <div className="flex items-center justify-between text-xs text-[#9BA8A3]">
              <span className="font-semibold text-[#EAE7DE]">Colar Lista de Participantes</span>
              <span>Formato: Nome {settings.rate} (um por linha)</span>
            </div>
            <textarea
              rows={4}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={`Ana ${settings.rate * 2}\nBruno, ${settings.rate}\nCarla; ${settings.rate * 3}`}
              className="w-full bg-[#171D1C] border border-[#313D39] rounded-lg p-3 text-xs sm:text-sm text-[#EAE7DE] placeholder:text-[#9BA8A3]/50 focus:outline-none focus:border-[#6EAA90] font-mono"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkText('')}
                className="px-3 py-1.5 text-xs text-[#9BA8A3] hover:text-[#EAE7DE]"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={handleBulkSubmit}
                className="px-4 py-1.5 bg-[#6EAA90] hover:bg-[#5E9980] text-[#171D1C] font-semibold text-xs rounded-lg transition"
              >
                Processar e Adicionar
              </button>
            </div>
          </div>
        )}

        {/* File Import Accordion */}
        {isImportOpen && (
          <div className="pt-3 border-t border-[#313D39] space-y-3">
            <div className="text-xs text-[#EAE7DE] font-semibold">
              Importar de Planilha (.xlsx, .xls) ou Texto (.csv, .txt, .tsv)
            </div>
            <div className="p-4 bg-[#171D1C] border border-dashed border-[#313D39] rounded-lg text-center space-y-2">
              <Upload className="w-6 h-6 text-[#9BA8A3] mx-auto" />
              <p className="text-xs text-[#9BA8A3]">
                Selecione o arquivo da lista. A primeira coluna deve conter os nomes e a segunda as moedas.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="text-xs text-[#9BA8A3] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#6EAA90] file:text-[#171D1C] hover:file:bg-[#5E9980] cursor-pointer"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-[#9BA8A3] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={replaceOnImport}
                onChange={(e) => setReplaceOnImport(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-[#6EAA90] bg-[#171D1C] border-[#313D39]"
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
                ? 'bg-[#D96B6B]/10 border-[#D96B6B]/40 text-[#D96B6B]'
                : feedbackMsg.type === 'warn'
                ? 'bg-[#C6A56A]/10 border-[#C6A56A]/40 text-[#C6A56A]'
                : 'bg-[#6EAA90]/10 border-[#6EAA90]/40 text-[#6EAA90]'
            }`}
          >
            <span>{feedbackMsg.text}</span>
          </div>
        )}
      </div>

      {/* Capacity & Distribution Warning */}
      {isCapacityExceeded && (
        <div className="bg-[#C6A56A]/10 border border-[#C6A56A]/40 rounded-xl p-3.5 flex items-start gap-3 text-[#EAE7DE] text-xs">
          <AlertTriangle className="w-5 h-5 shrink-0 text-[#C6A56A] mt-0.5" />
          <div>
            <p className="font-semibold text-[#EAE7DE]">Capacidade máxima de bilhetes atingida ({settings.total})</p>
            <p className="text-[#9BA8A3] mt-0.5">
              Os participantes acumularam moedas para mais bilhetes do que o limite atual ({settings.total}). Aumente o limite de bilhetes acima ou nas Configurações para contemplar todos.
            </p>
          </div>
        </div>
      )}

      {/* Participants Table & List View */}
      <div className="rounded-xl bg-[#222B28] border border-[#313D39] p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#313D39]">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-semibold text-base sm:text-lg text-[#EAE7DE]">
                Participantes do Sorteio
              </h2>
              <span className="text-xs font-mono font-bold bg-[#2B3632] border border-[#313D39] text-[#6EAA90] px-2 py-0.5 rounded tabular-nums">
                {participants.length}
              </span>
            </div>
            <p className="text-xs text-[#9BA8A3] mt-0.5 tabular-nums">
              <strong className="text-[#EAE7DE]">{computed.usedCount}</strong> de{' '}
              <strong className="text-[#EAE7DE]">{settings.total}</strong> bilhetes emitidos ({settings.rate} moedas = 1 bilhete)
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
                className="bg-[#171D1C] border border-[#313D39] rounded-lg pl-8 pr-7 py-2 text-xs text-[#EAE7DE] placeholder:text-[#9BA8A3]/50 focus:outline-none focus:border-[#6EAA90] w-full min-h-[36px]"
              />
              <Search className="w-3.5 h-3.5 text-[#9BA8A3] absolute left-2.5 top-2.5 pointer-events-none" />
              {filterQuery && (
                <button
                  type="button"
                  onClick={() => setFilterQuery('')}
                  className="absolute right-2 top-2.5 text-[#9BA8A3] hover:text-[#EAE7DE]"
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
                className={`bg-[#171D1C] border rounded-lg pl-8 pr-7 py-2 text-xs text-[#EAE7DE] placeholder:text-[#9BA8A3]/50 focus:outline-none w-full min-h-[36px] tabular-nums font-mono ${
                  isValidTicketSearch
                    ? 'border-[#C6A56A] text-[#C6A56A] bg-[#C6A56A]/10'
                    : 'border-[#313D39] focus:border-[#6EAA90]'
                }`}
              />
              <Ticket
                className={`w-3.5 h-3.5 absolute left-2.5 top-2.5 pointer-events-none ${
                  isValidTicketSearch ? 'text-[#C6A56A]' : 'text-[#9BA8A3]'
                }`}
              />
              {ticketSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTicketSearchQuery('')}
                  className="absolute right-2 top-2.5 text-[#9BA8A3] hover:text-[#EAE7DE]"
                  title="Limpar busca de bilhete"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1 bg-[#171D1C] border border-[#313D39] rounded-lg px-2.5 py-1.5 text-xs text-[#EAE7DE] min-h-[36px]">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#9BA8A3]" />
              <select
                value={sortBy}
                aria-label="Ordenar participantes por"
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-[#171D1C] text-xs text-[#EAE7DE] focus:outline-none cursor-pointer py-0.5"
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
                ? 'bg-[#C6A56A]/10 border-[#C6A56A]/50 text-[#EAE7DE]'
                : 'bg-[#171D1C] border-[#313D39] text-[#9BA8A3]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Ticket className={`w-4 h-4 shrink-0 ${ticketHolder ? 'text-[#C6A56A]' : 'text-[#9BA8A3]'}`} />
              {ticketHolder ? (
                <div className="truncate">
                  <span>Bilhete </span>
                  <span className="font-mono font-bold text-[#C6A56A] bg-[#222B28] border border-[#C6A56A]/40 px-1.5 py-0.5 rounded mr-1 tabular-nums">
                    #{parsedTicketNum}
                  </span>
                  <span>pertence a </span>
                  <strong className="text-[#EAE7DE]">{ticketHolder.participant.name}</strong>
                  <span className="text-[#9BA8A3] ml-1 tabular-nums">
                    ({ticketHolder.assignedTickets} {ticketHolder.assignedTickets === 1 ? 'bilhete' : 'bilhetes'})
                  </span>
                </div>
              ) : (
                <div>
                  <span>Bilhete </span>
                  <span className="font-mono font-bold text-[#EAE7DE] bg-[#222B28] border border-[#313D39] px-1.5 py-0.5 rounded mr-1 tabular-nums">
                    #{parsedTicketNum}
                  </span>
                  <span>não atribuído a nenhum participante</span>
                  {parsedTicketNum < settings.start || parsedTicketNum >= settings.start + settings.total ? (
                    <span className="text-[#D96B6B] ml-1 font-medium">
                      (fora da série #{settings.start} a #{settings.start + settings.total - 1})
                    </span>
                  ) : (
                    <span className="text-[#9BA8A3] ml-1">(disponível na série)</span>
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
                    ? 'bg-[#C6A56A] text-[#171D1C] border-[#C6A56A]'
                    : 'bg-[#222B28] text-[#EAE7DE] border-[#313D39]'
                }`}
              >
                <span>{filterOnlyTicketMatch ? 'Filtrando Portador' : 'Destacando na Lista'}</span>
              </button>

              <button
                type="button"
                onClick={() => setTicketSearchQuery('')}
                className="p-1 hover:bg-[#2B3632] rounded text-[#9BA8A3] hover:text-[#EAE7DE] transition"
                title="Limpar busca de bilhete"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Participant List */}
        {participants.length === 0 ? (
          <div className="py-10 text-center space-y-2 border border-dashed border-[#313D39] rounded-xl bg-[#171D1C]/60">
            <p className="text-sm font-semibold text-[#EAE7DE]">Nenhum participante cadastrado ainda</p>
            <p className="text-xs text-[#9BA8A3]">
              Adicione participantes individualmente ou importe uma lista no formulário acima.
            </p>
          </div>
        ) : filteredAllocations.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#9BA8A3] space-y-2">
            <p>
              {isValidTicketSearch
                ? `Nenhum participante possui o bilhete #${parsedTicketNum}.`
                : `Nenhum participante encontrado com o termo "${filterQuery}".`}
            </p>
            {isValidTicketSearch && (
              <button
                type="button"
                onClick={() => setTicketSearchQuery('')}
                className="px-3 py-1 bg-[#2B3632] hover:bg-[#313D39] text-[#6EAA90] rounded-lg text-xs font-semibold"
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
                      ? 'bg-[#2B3632] border-[#C6A56A] ring-1 ring-[#C6A56A]/60'
                      : hasWon
                      ? 'bg-[#171D1C]/90 border-[#6EAA90]/40'
                      : 'bg-[#171D1C] border-[#313D39] hover:border-[#6EAA90]/40'
                  }`}
                >
                  <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="font-semibold text-sm text-[#EAE7DE] truncate max-w-[200px] sm:max-w-none">
                        {p.name}
                      </span>
                      {isHoldingSearchedTicket && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-[#C6A56A] text-[#171D1C] px-2 py-0.5 rounded flex items-center gap-1 shrink-0 tabular-nums">
                          <Ticket className="w-3 h-3" />
                          <span>Portador #{parsedTicketNum}</span>
                        </span>
                      )}
                      {hasWon && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#6EAA90]/20 text-[#6EAA90] px-2 py-0.5 rounded border border-[#6EAA90]/40 shrink-0">
                          Premiado
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-auto">
                      <div className="flex items-center gap-1.5 bg-[#222B28] border border-[#313D39] rounded-lg px-2 py-1 min-h-[34px]">
                        <span className="text-xs text-[#9BA8A3] font-medium">Moedas:</span>
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
                          className="w-16 bg-[#171D1C] border border-[#313D39] rounded px-1.5 py-0.5 text-xs text-right text-[#EAE7DE] font-mono font-bold focus:outline-none focus:border-[#6EAA90] tabular-nums"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveParticipant(p.id)}
                        title={`Remover ${p.name}`}
                        aria-label={`Remover participante ${p.name}`}
                        className="min-w-[34px] min-h-[34px] p-1.5 flex items-center justify-center text-[#9BA8A3] hover:text-[#D96B6B] hover:bg-[#222B28] rounded-lg transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-[#313D39]/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-[#9BA8A3] tabular-nums">
                        {alloc.assignedTickets === 0 ? (
                          <span className="text-[#9BA8A3]">
                            Sem bilhete · Faltam <strong className="text-[#EAE7DE]">{neededNext}</strong> moedas
                          </span>
                        ) : (
                          <span>
                            <strong className="text-[#EAE7DE]">{alloc.assignedTickets}</strong>{' '}
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
                                    ? 'bg-[#C6A56A] text-[#171D1C] font-bold ring-1 ring-[#C6A56A]'
                                    : 'bg-[#2B3632] text-[#EAE7DE] border border-[#313D39]'
                                }`}
                              >
                                #{num} {isTargetTicket && '★'}
                              </span>
                            );
                          })}
                          {alloc.tickets.length > ticketsToDisplay.length && (
                            <span className="text-[#9BA8A3] text-[11px] font-mono tabular-nums">
                              +{alloc.tickets.length - ticketsToDisplay.length}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-[#9BA8A3] text-[11px] flex items-center gap-2 ml-auto tabular-nums">
                      {alloc.assignedTickets > 0 && (
                        <span className="text-[#6EAA90] font-semibold">
                          {alloc.winProbability}% de chance
                        </span>
                      )}
                      {alloc.assignedTickets < alloc.wantedTickets && (
                        <span className="text-[#D96B6B] font-medium">
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
          <div className="pt-3 border-t border-[#313D39] flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[#9BA8A3] tabular-nums">
              Total de moedas acumuladas:{' '}
              <strong className="text-[#C6A56A] font-mono">
                {participants.reduce((acc, p) => acc + p.coins, 0)}
              </strong>
            </span>

            {isConfirmingClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#D96B6B] font-semibold">Apagar todos?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setIsConfirmingClear(false);
                    showFeedback('Todos os participantes foram removidos.');
                  }}
                  className="px-2.5 py-1 text-xs font-semibold bg-[#D96B6B] text-[#171D1C] rounded transition"
                >
                  Sim, Apagar Tudo
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingClear(false)}
                  className="px-2.5 py-1 text-xs text-[#9BA8A3] hover:text-[#EAE7DE]"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingClear(true)}
                className="text-xs text-[#9BA8A3] hover:text-[#D96B6B] transition"
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
