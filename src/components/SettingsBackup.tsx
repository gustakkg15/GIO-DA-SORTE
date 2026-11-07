import React, { useState, useRef } from 'react';
import {
  Settings,
  Shuffle,
  Download,
  Upload,
  FileText,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Hash,
  User,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { RaffleSettings, Participant, Winner, ComputedRaffle, TicketOrder } from '../types';
import { exportToCsv, generateRaffleCode } from '../utils/raffle';
import { generateRafflePdfReport } from '../utils/pdfReport';
import { generateRosterHash } from '../utils/hash';

interface SettingsBackupProps {
  settings: RaffleSettings;
  participants: Participant[];
  winners: Winner[];
  computed: ComputedRaffle;
  onUpdateSettings: (patch: Partial<RaffleSettings>) => void;
  onRestoreState: (state: { settings: RaffleSettings; participants: Participant[]; winners: Winner[] }) => void;
  onResetToSample: () => void;
  onResetCoinsOnly: () => void;
  onOpenAuditReport?: () => void;
  rosterHash?: string;
}

export const SettingsBackup: React.FC<SettingsBackupProps> = ({
  settings,
  participants,
  winners,
  computed,
  onUpdateSettings,
  onRestoreState,
  onResetToSample,
  onResetCoinsOnly,
  onOpenAuditReport,
  rosterHash,
}) => {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [backupJsonText, setBackupJsonText] = useState('');
  const [isJsonDrawerOpen, setIsJsonDrawerOpen] = useState(false);
  const restoreFileRef = useRef<HTMLInputElement>(null);

  const notify = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleDownloadBackup = () => {
    const backupData = {
      app: 'GIO DA SORTE',
      version: 2,
      savedAt: new Date().toISOString(),
      settings,
      participants,
      winners,
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gio-da-sorte-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Backup do GIO DA SORTE baixado com sucesso!');
  };

  const handleDownloadCsv = () => {
    const csvContent = exportToCsv(computed.allocations, settings);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gio-da-sorte-participantes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify('Planilha CSV gerada e baixada com sucesso!');
  };

  const handleDownloadPdf = async () => {
    if (onOpenAuditReport) {
      onOpenAuditReport();
      return;
    }
    try {
      const hash = rosterHash || (await generateRosterHash(participants, settings));
      const doc = await generateRafflePdfReport({
        title: settings.raffleTitle || settings.prizeName || settings.currentPrize,
        organizerName: settings.organizerName,
        prizeName: settings.prizeName || settings.currentPrize,
        rosterHash: hash,
        winners,
        settings,
        computed,
        participantsCount: participants.length,
        totalTicketsCount: computed.usedCount,
      });
      doc.save(`laudo_sorteio_gio_da_sorte_${new Date().toISOString().slice(0, 10)}.pdf`);
      notify('Laudo PDF oficial gerado e baixado com sucesso!');
    } catch (err) {
      console.error(err);
      notify('Erro ao gerar relatório PDF.');
    }
  };

  const handleRestoreJson = (text: string) => {
    try {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.participants)) {
        notify('Formato de arquivo inválido. Não encontramos os participantes.');
        return;
      }

      onRestoreState({
        settings: {
          ...settings,
          ...(data.settings || {}),
        },
        participants: data.participants,
        winners: Array.isArray(data.winners) ? data.winners : [],
      });
      notify(`Backup restaurado: ${data.participants.length} participantes carregados no GIO DA SORTE.`);
      setIsJsonDrawerOpen(false);
      setBackupJsonText('');
    } catch {
      notify('Erro ao analisar o JSON do backup.');
    }
  };

  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      handleRestoreJson(String(reader.result));
      if (restoreFileRef.current) restoreFileRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Regras de Conversão, Série, Contagem e Estilo Visual */}
        <div className="lg:col-span-7 gio-card p-6 space-y-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#182943]">
            <div className="w-9 h-9 rounded-xl bg-[#0866F5]/20 border border-[#00A9FF]/35 flex items-center justify-center text-[#00A9FF]">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-[#F8FAFC]">
                Regras Matemáticas e Parâmetros da Série
              </h2>
              <p className="text-xs text-[#94A3B8]">
                Defina a conversão de moedas em bilhetes, numeração e ordem de distribuição
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                Moedas por bilhete (Taxa de conversão)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={settings.rate}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (val > 0) onUpdateSettings({ rate: val });
                }}
                className="gio-input font-mono tabular-nums"
              />
              <p className="text-[11px] text-[#94A3B8]/80 mt-1">
                Ex.: 100 moedas = 1 bilhete. Com 250 moedas, recebe 2 bilhetes (sobram 50).
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                Capacidade máxima de bilhetes
              </label>
              <input
                type="number"
                min="1"
                max="10000"
                step="1"
                value={settings.total}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (val > 0) onUpdateSettings({ total: Math.min(10000, val) });
                }}
                className="gio-input font-mono tabular-nums"
              />
              <p className="text-[11px] text-[#94A3B8]/80 mt-1">
                Limite total de números gerados para toda a série (máx. 10.000).
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                Primeiro número da série
              </label>
              <input
                type="number"
                step="1"
                value={settings.start}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) onUpdateSettings({ start: val });
                }}
                className="gio-input font-mono tabular-nums"
              />
              <p className="text-[11px] text-[#94A3B8]/80 mt-1">
                Com início em 1 e 100 números, a série vai de #1 a #100.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                Ordem de entrega dos bilhetes
              </label>
              <select
                value={settings.order}
                onChange={(e) => onUpdateSettings({ order: e.target.value as TicketOrder })}
                className="gio-input cursor-pointer"
              >
                <option value="asc">Crescente (1, 2, 3...)</option>
                <option value="desc">Decrescente (100, 99, 98...)</option>
                <option value="random">Aleatória (embaralhada)</option>
              </select>
              <p className="text-[11px] text-[#94A3B8]/80 mt-1">
                {settings.order === 'random'
                  ? 'Números embaralhados de forma determinística auditável.'
                  : 'Distribui sequencialmente na ordem da lista de participantes.'}
              </p>
            </div>
          </div>

          {/* Countdown Setting */}
          <div className="pt-4 border-t border-[#182943] space-y-2.5">
            <label className="block text-xs font-semibold text-[#94A3B8]">
              Contagem Regressiva antes da Revelação
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { val: 10, label: '10 segundos', desc: 'Suspense completo' },
                { val: 5, label: '5 segundos', desc: 'Rápido e dinâmico' },
                { val: 3, label: '3 segundos', desc: 'Contagem curta' },
                { val: 0, label: 'Desativada', desc: 'Sorteio imediato' },
              ].map((item) => {
                const active = (settings.countdownSeconds ?? 10) === item.val;
                return (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => onUpdateSettings({ countdownSeconds: item.val })}
                    className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                      active
                        ? 'bg-[#0866F5]/20 border-[#00A9FF] text-[#F8FAFC]'
                        : 'bg-[#0B1730] border-[#182943] text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#0866F5]/50'
                    }`}
                  >
                    <span className={`text-xs font-bold ${active ? 'text-[#00A9FF]' : 'text-[#F8FAFC]'}`}>
                      {item.label}
                    </span>
                    <span className="text-[10px] text-[#94A3B8] mt-1">{item.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Scheme / Visual Theme */}
          <div className="pt-4 border-t border-[#182943] space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-[#94A3B8]">
                Estilo Visual da Plataforma
              </label>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md border bg-[#0B1730] border-[#182943] text-[#00A9FF]">
                {settings.themeMode === 'neon' ? 'Destaque Elevado' : 'Dark Tech Navy (Oficial)'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  onUpdateSettings({ themeMode: 'default' });
                  notify('Tema Oficial Dark Tech Navy ativado!');
                }}
                className={`p-3.5 rounded-xl border text-left transition flex items-start justify-between ${
                  settings.themeMode !== 'neon'
                    ? 'bg-[#0866F5]/20 border-[#00A9FF]'
                    : 'bg-[#0B1730] border-[#182943] hover:border-[#0866F5]/50 text-[#94A3B8]'
                }`}
              >
                <div>
                  <span className="font-bold text-xs text-[#F8FAFC] block">
                    Oficial (Dark Tech Navy)
                  </span>
                  <span className="text-[11px] text-[#94A3B8]">
                    Contraste executivo e leitura limpa
                  </span>
                </div>
                {settings.themeMode !== 'neon' && (
                  <CheckCircle2 className="w-4 h-4 text-[#00A9FF] shrink-0 mt-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  onUpdateSettings({ themeMode: 'neon' });
                  notify('Modo Destaque Elevado ativado!');
                }}
                className={`p-3.5 rounded-xl border text-left transition flex items-start justify-between ${
                  settings.themeMode === 'neon'
                    ? 'bg-[#0866F5]/20 border-[#00A9FF]'
                    : 'bg-[#0B1730] border-[#182943] hover:border-[#0866F5]/50 text-[#94A3B8]'
                }`}
              >
                <div>
                  <span className="font-bold text-xs text-[#F8FAFC] flex items-center gap-1.5">
                    Destaque de Transmissão <Sparkles className="w-3.5 h-3.5 text-[#00A9FF] inline" />
                  </span>
                  <span className="text-[11px] text-[#94A3B8]">
                    Contraste acentuado para lives e telões
                  </span>
                </div>
                {settings.themeMode === 'neon' && (
                  <CheckCircle2 className="w-4 h-4 text-[#00A9FF] shrink-0 mt-0.5" />
                )}
              </button>
            </div>
          </div>

          {settings.order === 'random' && (
            <div className="pt-2 flex justify-start">
              <button
                type="button"
                onClick={() => {
                  onUpdateSettings({ seed: Math.floor(Math.random() * 4294967295) + 1 });
                  notify('Números reembaralhados com nova semente!');
                }}
                className="gio-btn-secondary px-3.5 py-2 text-xs"
              >
                <Shuffle className="w-3.5 h-3.5 text-[#00A9FF]" />
                <span>Gerar Nova Semente de Embaralhamento</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Column (5 cols): Identificação Pública + Backup & Manutenção */}
        <div className="lg:col-span-5 space-y-6">
          {/* Host Public Identification */}
          <div className="gio-card p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#182943]">
              <div className="w-9 h-9 rounded-xl bg-[#00A9FF]/15 border border-[#00A9FF]/35 flex items-center justify-center text-[#00A9FF]">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-base text-[#F8FAFC]">
                  Identificação Pública do Sorteio
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Exibida nos certificados PDF e na consulta de bilhetes
                </p>
              </div>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                  Nome do Organizador ou Canal
                </label>
                <input
                  type="text"
                  value={settings.organizerName || ''}
                  onChange={(e) => onUpdateSettings({ organizerName: e.target.value })}
                  placeholder="Ex: Canal Oficial, Rifa Solidária"
                  className="gio-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                  Título Oficial do Sorteio
                </label>
                <input
                  type="text"
                  value={settings.raffleTitle || ''}
                  onChange={(e) => onUpdateSettings({ raffleTitle: e.target.value })}
                  placeholder="Ex: Sorteio Especial de 1000 Moedas"
                  className="gio-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                  Código Único de Consulta Pública
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={settings.raffleCode || 'GIO-7492'}
                    onChange={(e) =>
                      onUpdateSettings({ raffleCode: e.target.value.toUpperCase().trim() })
                    }
                    placeholder="Ex: GIO-7492"
                    className="gio-input font-mono font-bold text-[#00A9FF] uppercase tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newCode = generateRaffleCode();
                      onUpdateSettings({ raffleCode: newCode });
                      notify(`Novo código gerado: #${newCode}`);
                    }}
                    className="gio-btn-secondary px-3.5 py-2 text-xs shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-[#00A9FF]" />
                    <span>Novo</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Backup and Export Card */}
          <div className="gio-card p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#182943]">
              <div className="w-9 h-9 rounded-xl bg-[#20C997]/15 border border-[#20C997]/35 flex items-center justify-center text-[#20C997]">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-base text-[#F8FAFC]">Backup, Exportação e Restauro</h2>
                <p className="text-xs text-[#94A3B8]">
                  Salve cópias de segurança locais ou emita o laudo PDF
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#0B1730] border border-[#182943] text-xs text-[#F8FAFC]">
              <Zap className="w-4 h-4 text-[#20C997] shrink-0" />
              <span className="text-[11px] text-[#94A3B8]">
                <strong className="text-[#F8FAFC]">Persistência Automática Ativa:</strong> todas as alterações são salvas instantaneamente neste navegador.
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="gio-btn-primary py-3 px-4 text-xs"
              >
                <FileText className="w-4 h-4" />
                <span>Exportar Laudo Oficial PDF (Hash SHA-256)</span>
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="gio-btn-secondary py-2.5 px-3 text-xs"
                >
                  <Download className="w-3.5 h-3.5 text-[#00A9FF]" />
                  <span>Backup (.json)</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="gio-btn-secondary py-2.5 px-3 text-xs"
                >
                  <FileText className="w-3.5 h-3.5 text-[#20C997]" />
                  <span>Planilha (.csv)</span>
                </button>
              </div>
            </div>

            {/* Restore options */}
            <div className="pt-3 border-t border-[#182943] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#94A3B8]">Restaurar de Backup</span>
                <button
                  type="button"
                  onClick={() => setIsJsonDrawerOpen(!isJsonDrawerOpen)}
                  className="text-xs text-[#00A9FF] hover:underline font-medium"
                >
                  {isJsonDrawerOpen ? 'Fechar texto JSON' : 'Colar JSON manualmente'}
                </button>
              </div>

              <input
                ref={restoreFileRef}
                type="file"
                accept=".json"
                onChange={handleFileRestore}
                className="text-xs text-[#94A3B8] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#0866F5] file:text-[#F8FAFC] hover:file:bg-[#00A9FF] cursor-pointer w-full"
              />

              {isJsonDrawerOpen && (
                <div className="pt-2 space-y-2">
                  <textarea
                    rows={3}
                    value={backupJsonText}
                    onChange={(e) => setBackupJsonText(e.target.value)}
                    placeholder="Cole o conteúdo do backup .json aqui..."
                    className="gio-input font-mono text-xs"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRestoreJson(backupJsonText)}
                      className="gio-btn-primary px-3 py-1.5 text-xs"
                    >
                      Restaurar do Texto
                    </button>
                  </div>
                </div>
              )}
            </div>

            {feedback && (
              <div className="p-2.5 bg-[#20C997]/15 border border-[#20C997]/40 rounded-xl text-xs text-[#20C997] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#20C997] shrink-0" />
                <span>{feedback}</span>
              </div>
            )}
          </div>

          {/* Utility Maintenance Card */}
          <div className="gio-card p-5 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[#94A3B8]">
              Manutenção Rápida da Lista
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={onResetCoinsOnly}
                className="gio-btn-secondary px-3 py-2 text-xs"
              >
                Zerar moedas de todos
              </button>
              <button
                type="button"
                onClick={onResetToSample}
                className="gio-btn-secondary px-3 py-2 text-xs text-[#00A9FF]"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#00A9FF]" />
                <span>Carregar Lista de Exemplo</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
