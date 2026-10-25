import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Hash,
  User,
  Radio,
  Clock,
  Trash2,
  ExternalLink,
  Sparkles,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { PublicRaffle } from '../types';
import {
  fetchPublicRaffle,
  searchPublicRaffles,
  getSavedRafflesHistory,
  removeRaffleFromHistory,
} from '../utils/publicRaffle';

interface RaffleFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRaffle: (raffle: PublicRaffle) => void;
  currentCode?: string;
  onResetToLocal?: () => void;
  isViewingExternal?: boolean;
}

export const RaffleFinderModal: React.FC<RaffleFinderModalProps> = ({
  isOpen,
  onClose,
  onSelectRaffle,
  currentCode,
  onResetToLocal,
  isViewingExternal,
}) => {
  const [activeTab, setActiveTab] = useState<'code' | 'search' | 'history'>('code');
  const [inputCode, setInputCode] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<PublicRaffle[]>([]);
  const [history, setHistory] = useState<PublicRaffle[]>([]);

  useEffect(() => {
    if (isOpen) {
      setHistory(getSavedRafflesHistory());
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnectByCode = async (codeToUse?: string) => {
    const rawCode = (codeToUse || inputCode).trim();
    if (!rawCode) {
      setErrorMsg('Digite um código de sorteio válido (ex: GIO-7492).');
      return;
    }

    // Extract code if user pasted full URL
    let cleanCode = rawCode;
    if (rawCode.includes('sorteio=')) {
      const match = rawCode.match(/sorteio=([^&]+)/);
      if (match) cleanCode = match[1];
    } else if (rawCode.includes('code=')) {
      const match = rawCode.match(/code=([^&]+)/);
      if (match) cleanCode = match[1];
    }

    cleanCode = cleanCode.toUpperCase().replace('#', '').trim();

    setLoading(true);
    setErrorMsg(null);
    try {
      const raffle = await fetchPublicRaffle(cleanCode);
      if (raffle) {
        setSuccessMsg(`Sorteio de ${raffle.organizerName} carregado com sucesso!`);
        setTimeout(() => {
          onSelectRaffle(raffle);
          onClose();
        }, 600);
      } else {
        setErrorMsg(
          `Nenhum sorteio encontrado com o código "${cleanCode}". Peça para o seu sorteador verificar se o código está correto ou se foi sincronizado.`
        );
      }
    } catch {
      setErrorMsg('Não foi possível buscar o sorteio agora. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchByName = async () => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const results = await searchPublicRaffles(searchTerm);
      setSearchResults(results);
      if (results.length === 0) {
        setErrorMsg(`Nenhum sorteador ou sorteio encontrado com o termo "${searchTerm}".`);
      }
    } catch {
      setErrorMsg('Erro ao buscar sorteios públicos.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveHistory = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeRaffleFromHistory(code);
    setHistory((prev) => prev.filter((r) => r.code !== code));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-sky-400">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-black text-lg text-white">Encontrar Sorteio do Sorteador</h3>
              <p className="text-xs text-slate-400">
                Conecte-se para ver seus bilhetes no sorteio do seu streamer ou organizador
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="p-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('code');
              setErrorMsg(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'code'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            <span>Por Código</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('search');
              setErrorMsg(null);
              if (searchResults.length === 0) handleSearchByName();
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'search'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Nome do Sorteador</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              setErrorMsg(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'history'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Salvos ({history.length})</span>
          </button>
        </div>

        {/* Feedback messages */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 bg-rose-950/60 border border-rose-500/50 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Código do Sorteio ou Link Direto
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    placeholder="Ex: GIO-7492 ou cole o link enviado"
                    className="w-full bg-slate-950 border-2 border-slate-700 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 font-mono uppercase focus:outline-none transition"
                    onKeyDown={(e) => e.key === 'Enter' && handleConnectByCode()}
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  O organizador do sorteio encontra o código no topo do app ou no botão de compartilhar.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleConnectByCode()}
                disabled={loading || !inputCode.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition active:scale-98"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Conectando ao Sorteio...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Conectar e Ver Meus Bilhetes</span>
                  </>
                )}
              </button>

              {/* Quick tip */}
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 text-xs text-slate-400 space-y-1.5">
                <span className="font-bold text-sky-300 block">Dica para Participantes:</span>
                <p>
                  Quando seu sorteador envia um link com <code className="text-white">?sorteio=GIO-XXXX</code>, o app abre automaticamente no sorteio dele sem você precisar digitar nada!
                </p>
              </div>
            </div>
          )}

          {activeTab === 'search' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Nome do canal, streamer ou título..."
                    className="w-full bg-slate-950 border-2 border-slate-700 focus:border-blue-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none transition"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchByName()}
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                </div>
                <button
                  type="button"
                  onClick={handleSearchByName}
                  disabled={loading}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition shrink-0"
                >
                  Buscar
                </button>
              </div>

              {/* Results list */}
              <div className="space-y-2">
                {searchResults.length > 0 ? (
                  searchResults.map((r) => (
                    <div
                      key={r.code}
                      onClick={() => handleConnectByCode(r.code)}
                      className={`p-3.5 bg-slate-950 hover:bg-blue-950/40 border ${
                        currentCode === r.code ? 'border-blue-500/80 ring-1 ring-blue-500' : 'border-slate-800'
                      } rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition group`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white group-hover:text-sky-300 transition">
                            {r.organizerName}
                          </span>
                          <span className="text-[10px] font-mono font-bold bg-blue-900/60 border border-blue-700/60 text-sky-300 px-2 py-0.5 rounded-full">
                            #{r.code}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{r.title}</p>
                        <span className="text-[10px] text-slate-500">
                          {r.participants.length} participantes · Taxa: {r.settings.rate} moedas
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition" />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-xs text-slate-500">
                    Digite o nome de quem está realizando o sorteio para pesquisar.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3">
              {history.length > 0 ? (
                history.map((r) => (
                  <div
                    key={r.code}
                    onClick={() => handleConnectByCode(r.code)}
                    className={`p-3.5 bg-slate-950 hover:bg-blue-950/40 border ${
                      currentCode === r.code ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-800'
                    } rounded-2xl flex items-center justify-between gap-3 cursor-pointer transition group`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white group-hover:text-sky-300 transition">
                          {r.organizerName}
                        </span>
                        <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                          #{r.code}
                        </span>
                        {currentCode === r.code && (
                          <span className="text-[10px] bg-emerald-950 border border-emerald-500/50 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{r.title}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handleRemoveHistory(r.code, e)}
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition"
                        title="Remover do histórico"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition" />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-slate-500 space-y-2">
                  <Clock className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>Você ainda não acessou nenhum sorteio externo.</p>
                  <p className="text-[11px] text-slate-600">
                    Os sorteios que você consultar ficarão salvos aqui para você voltar em 1 clique.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Reset to Local */}
        {isViewingExternal && onResetToLocal && (
          <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
            <span className="text-xs text-slate-400">Quer voltar ao seu próprio sorteio?</span>
            <button
              type="button"
              onClick={() => {
                onResetToLocal();
                onClose();
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition"
            >
              Voltar ao Meu Sorteio
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
