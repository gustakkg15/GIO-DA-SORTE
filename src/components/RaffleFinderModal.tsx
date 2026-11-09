import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Hash,
  User,
  Clock,
  Trash2,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#080A0F]/85 backdrop-blur-md animate-fade-in">
      <div className="bg-[#10141E] border border-[#161C2C] w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">
        {/* Header */}
        <div className="p-5 border-b border-[#161C2C] flex items-center justify-between bg-[#10141E]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#0131CD]/20 border border-[#0131CD]/40 flex items-center justify-center text-[#FFFFFF]">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-[#FFFFFF]">Encontrar Sorteio do Sorteador</h3>
              <p className="text-xs text-[#94A3B8]">
                Conecte-se para ver seus bilhetes no sorteio do seu streamer ou organizador
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#94A3B8] hover:text-[#FFFFFF] p-2 rounded-xl hover:bg-[#161C2C] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="p-3 bg-[#10141E]/80 border-b border-[#161C2C] flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('code');
              setErrorMsg(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'code'
                ? 'bg-[#0131CD] text-[#FFFFFF] shadow-sm'
                : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#161C2C]'
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
                ? 'bg-[#0131CD] text-[#FFFFFF] shadow-sm'
                : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#161C2C]'
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
                ? 'bg-[#0131CD] text-[#FFFFFF] shadow-sm'
                : 'text-[#94A3B8] hover:text-[#FFFFFF] hover:bg-[#161C2C]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Salvos ({history.length})</span>
          </button>
        </div>

        {/* Feedback messages */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 bg-[#F05262]/15 border border-[#F05262]/40 rounded-xl text-[#F05262] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-[#20C997]/15 border border-[#20C997]/40 rounded-xl text-[#20C997] text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'code' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#FFFFFF] block">
                  Código do Sorteio ou Link Direto
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    placeholder="Ex: GIO-7492 ou cole o link enviado"
                    className="w-full bg-[#10141E] border border-[#161C2C] focus:border-[#B9FC01] rounded-xl px-4 py-3 text-sm text-[#FFFFFF] placeholder:text-[#94A3B8]/50 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#B9FC01]/40 rounded transition"
                    onKeyDown={(e) => e.key === 'Enter' && handleConnectByCode()}
                  />
                </div>
                <p className="text-[11px] text-[#94A3B8]">
                  O organizador do sorteio encontra o código no topo do app ou no botão de compartilhar.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleConnectByCode()}
                disabled={loading || !inputCode.trim()}
                className="w-full py-3 bg-[#0131CD] hover:brightness-110 disabled:opacity-50 text-[#FFFFFF] font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-98"
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
              <div className="p-4 bg-[#10141E] rounded-xl border border-[#161C2C] text-xs text-[#94A3B8] space-y-1.5">
                <span className="font-bold text-[#B9FC01] block">Dica para Participantes:</span>
                <p>
                  Quando seu sorteador envia um link com <code className="text-[#FFFFFF] font-mono">?sorteio=GIO-XXXX</code>, o app abre automaticamente no sorteio dele sem você precisar digitar nada!
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
                    className="w-full bg-[#10141E] border border-[#161C2C] focus:border-[#B9FC01] rounded-xl pl-9 pr-3 py-2.5 text-xs text-[#FFFFFF] placeholder:text-[#94A3B8]/50 focus:outline-none focus:ring-2 focus:ring-[#B9FC01]/40 rounded transition"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchByName()}
                  />
                  <Search className="w-4 h-4 text-[#94A3B8] absolute left-3 top-3" />
                </div>
                <button
                  type="button"
                  onClick={handleSearchByName}
                  disabled={loading}
                  className="px-4 py-2.5 bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs rounded-xl transition shrink-0"
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
                      className={`p-3.5 bg-[#10141E] hover:bg-[#161C2C] border ${
                        currentCode === r.code ? 'border-[#0131CD] ring-1 ring-[#0131CD]' : 'border-[#161C2C]'
                      } rounded-xl flex items-center justify-between gap-3 cursor-pointer transition group`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[#FFFFFF] group-hover:text-[#B9FC01] transition">
                            {r.organizerName}
                          </span>
                          <span className="text-[10px] font-mono font-bold bg-[#0131CD]/20 border border-[#0131CD]/40 text-[#FFFFFF] px-2 py-0.5 rounded-full">
                            #{r.code}
                          </span>
                        </div>
                        <p className="text-xs text-[#94A3B8] mt-0.5">{r.title}</p>
                        <span className="text-[10px] text-[#94A3B8] font-mono tabular-nums">
                          {r.participants.length} participantes · Taxa: {r.settings.rate} moedas
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#FFFFFF] transition" />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-xs text-[#94A3B8]">
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
                    className={`p-3.5 bg-[#10141E] hover:bg-[#161C2C] border ${
                      currentCode === r.code ? 'border-[#0131CD] ring-1 ring-[#0131CD]' : 'border-[#161C2C]'
                    } rounded-xl flex items-center justify-between gap-3 cursor-pointer transition group`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#FFFFFF] group-hover:text-[#B9FC01] transition">
                          {r.organizerName}
                        </span>
                        <span className="text-[10px] font-mono font-bold bg-[#161C2C] text-[#FFFFFF] px-2 py-0.5 rounded-full">
                          #{r.code}
                        </span>
                        {currentCode === r.code && (
                          <span className="text-[10px] bg-[#20C997]/15 border border-[#20C997]/40 text-[#20C997] px-2 py-0.5 rounded-full font-bold">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#94A3B8] mt-0.5">{r.title}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handleRemoveHistory(r.code, e)}
                        className="text-[#94A3B8] hover:text-[#F05262] p-1.5 rounded-lg hover:bg-[#10141E] transition"
                        title="Remover do histórico"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:text-[#FFFFFF] transition" />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-[#94A3B8] space-y-2">
                  <Clock className="w-8 h-8 text-[#94A3B8] mx-auto" />
                  <p>Você ainda não acessou nenhum sorteio externo.</p>
                  <p className="text-[11px] text-[#94A3B8]">
                    Os sorteios que você consultar ficarão salvos aqui para você voltar em 1 clique.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Reset to Local */}
        {isViewingExternal && onResetToLocal && (
          <div className="p-4 border-t border-[#161C2C] bg-[#10141E] flex items-center justify-between">
            <span className="text-xs text-[#94A3B8]">Quer voltar ao seu próprio sorteio?</span>
            <button
              type="button"
              onClick={() => {
                onResetToLocal();
                onClose();
              }}
              className="px-3 py-1.5 bg-[#161C2C] hover:bg-[#0131CD] text-[#FFFFFF] text-xs font-bold rounded-xl transition"
            >
              Voltar ao Meu Sorteio
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
