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
} from 'lucide-react';
import { Participant, RaffleSettings, ComputedRaffle, Winner } from '../types';
import {
  parseRawTextList,
  parseExcelBuffer,
  generateUid,
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

  const filteredAllocations = computed.allocations.filter((a) =>
    a.participant.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  filteredAllocations.sort((a, b) => {
    if (sortBy === 'coins-desc') return b.participant.coins - a.participant.coins;
    if (sortBy === 'tickets-desc') return b.assignedTickets - a.assignedTickets;
    if (sortBy === 'name-asc') return a.participant.name.localeCompare(b.participant.name);
    return b.participant.addedAt - a.participant.addedAt;
  });

  const isCapacityExceeded = computed.usedCount >= settings.total;

  return (
    <div className="space-y-6">
      {/* Add Participant Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-sky-400" />
            <h2 className="font-display font-bold text-lg text-white">Adicionar Participante</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsBulkOpen(!isBulkOpen)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
            >
              {isBulkOpen ? 'Fechar Lista' : 'Colar Lista'}
            </button>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-blue-600/30 border border-blue-500/50 text-sky-200 hover:text-white hover:bg-blue-600/50 transition flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
              <span>Importar Arquivo (.xlsx, .csv, .txt, .json)</span>
            </button>
          </div>
        </div>

        {/* Single participant form */}
        <form onSubmit={handleSingleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-7">
              <label className="block text-xs text-slate-400 mb-1 font-medium">Nome da pessoa</label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Ex.: Mariana Silva"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs text-slate-400 mb-1 font-medium">Moedas acumuladas</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={coinsInput}
                  onChange={(e) => setCoinsInput(e.target.value)}
                  placeholder="Ex.: 300"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3.5 pr-8 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-400 tabular-nums"
                />
                <Coins className="w-4 h-4 text-sky-400 absolute right-2.5 top-3 pointer-events-none" />
              </div>
            </div>
            <div className="sm:col-span-2 flex items-end">
              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition active:scale-95 shadow-md shadow-blue-600/30"
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
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

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <input
                type="text"
                placeholder="Filtrar nome..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-400 w-36 sm:w-44"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
            </div>

            <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-300">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer"
              >
                <option value="tickets-desc">Mais bilhetes</option>
                <option value="coins-desc">Mais moedas</option>
                <option value="name-asc">Nome (A-Z)</option>
                <option value="recent">Adicionados recente</option>
              </select>
            </div>
          </div>
        </div>

        {/* Participant List */}
        {participants.length === 0 ? (
          <div className="py-12 text-center space-y-2 border border-dashed border-slate-800 rounded-xl">
            <p className="text-sm font-semibold text-slate-400">Nenhum participante cadastrado ainda.</p>
            <p className="text-xs text-slate-500">Adicione pessoas individualmente ou importe uma planilha acima.</p>
          </div>
        ) : filteredAllocations.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Nenhum participante encontrado com o termo "{filterQuery}".
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
            {filteredAllocations.map((alloc) => {
              const p = alloc.participant;
              const hasWon = wonIds.has(p.id);
              const neededNext = settings.rate - alloc.remainderCoins;

              return (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-xl border transition-colors ${
                    hasWon
                      ? 'bg-blue-950/20 border-blue-700/50'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-sm text-white truncate">{p.name}</span>
                      {hasWon && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-600/30 text-sky-300 px-2 py-0.5 rounded border border-blue-500/40">
                          Já Ganhou
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1 bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1">
                        <span className="text-xs text-slate-400 font-medium">Moedas:</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
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
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-900 rounded-lg transition"
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
                          {alloc.tickets.slice(0, 10).map((num) => (
                            <span
                              key={num}
                              className="bg-blue-600 text-white font-mono font-bold px-1.5 py-0.2 rounded text-[11px] tabular-nums"
                            >
                              #{num}
                            </span>
                          ))}
                          {alloc.tickets.length > 10 && (
                            <span className="text-slate-400 text-[11px] font-medium">
                              +{alloc.tickets.length - 10} mais
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
