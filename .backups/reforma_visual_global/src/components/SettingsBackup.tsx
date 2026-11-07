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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Settings Card */}
      <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-6 shadow-xl space-y-5 animate-card-enter neon-card">
        <div className="flex items-center gap-2 pb-3 border-b border-[#182943]">
          <Settings className="w-5 h-5 text-[#00A9FF]" />
          <h2 className="font-display font-bold text-lg text-[#F8FAFC]">Regras e Configurações · GIO DA SORTE</h2>
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
              className="w-full bg-[#050D20] border border-[#182943] rounded-xl px-3.5 py-2.5 text-sm text-[#F8FAFC] font-mono focus:outline-none focus:border-[#00A9FF] tabular-nums"
            />
            <p className="text-[11px] text-[#64748B] mt-1">
              Exemplo: 100 moedas = 1 bilhete. Uma pessoa com 250 moedas receberá 2 bilhetes (sobrando 50).
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
              Quantidade de números no sorteio
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
              className="w-full bg-[#050D20] border border-[#182943] rounded-xl px-3.5 py-2.5 text-sm text-[#F8FAFC] font-mono focus:outline-none focus:border-[#00A9FF] tabular-nums"
            />
            <p className="text-[11px] text-[#64748B] mt-1">
              Capacidade máxima de bilhetes gerados para toda a série (máx. 10.000).
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
              className="w-full bg-[#050D20] border border-[#182943] rounded-xl px-3.5 py-2.5 text-sm text-[#F8FAFC] font-mono focus:outline-none focus:border-[#00A9FF] tabular-nums"
            />
            <p className="text-[11px] text-[#64748B] mt-1">
              Com início em 1 e 100 números, a série vai de 1 a 100.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
              Ordem de entrega dos bilhetes
            </label>
            <select
              value={settings.order}
              onChange={(e) => onUpdateSettings({ order: e.target.value as TicketOrder })}
              className="w-full bg-[#050D20] border border-[#182943] rounded-xl px-3.5 py-2.5 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#00A9FF] cursor-pointer"
            >
              <option value="asc">Crescente (1, 2, 3...)</option>
              <option value="desc">Decrescente (100, 99, 98...)</option>
              <option value="random">Aleatória (embaralhada)</option>
            </select>
            <p className="text-[11px] text-[#64748B] mt-1">
              {settings.order === 'random'
                ? 'Os números foram embaralhados de forma justa e determinística.'
                : 'Distribui sequencialmente na ordem da lista de participantes.'}
            </p>
          </div>
        </div>

        {/* Countdown Setting */}
        <div className="pt-3 border-t border-[#182943] space-y-2">
          <label className="block text-xs font-semibold text-[#94A3B8]">
            ⏱️ Contagem Regressiva para Iniciar o Sorteio
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { val: 10, label: '10 segundos', desc: 'Padrão emocionante' },
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
                      ? 'bg-[#0866F5]/20 border-[#00A9FF] text-[#F8FAFC] ring-1 ring-[#00A9FF]/50'
                      : 'bg-[#050D20] border-[#182943] text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#0866F5]/50'
                  }`}
                >
                  <span className={`text-xs font-bold ${active ? 'text-[#00A9FF]' : 'text-[#F8FAFC]'}`}>
                    {item.label}
                  </span>
                  <span className="text-[10px] text-[#64748B] mt-1">{item.desc}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-[#64748B]">
            Exibe uma contagem em tela cheia com efeitos de tensão sonora e visual antes de rodar o sorteio.
          </p>
        </div>

        {/* Color Scheme / Visual Theme */}
        <div className="pt-4 border-t border-[#182943] space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-[#94A3B8]">
              🎨 Esquema de Cores & Estilo Visual
            </label>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                settings.themeMode === 'neon'
                  ? 'bg-[#0866F5]/20 border-[#00A9FF]/50 text-[#00A9FF]'
                  : 'bg-[#050D20] border-[#182943] text-[#94A3B8]'
              }`}
            >
              {settings.themeMode === 'neon' ? 'Neon Night Ativo ✨' : 'Dark Tech Navy (Padrão)'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                onUpdateSettings({ themeMode: 'default' });
                notify('Tema Padrão ativado!');
              }}
              className={`p-3.5 rounded-xl border text-left transition flex items-start justify-between ${
                settings.themeMode !== 'neon'
                  ? 'bg-[#0866F5]/20 border-[#00A9FF] ring-1 ring-[#00A9FF]/30'
                  : 'bg-[#050D20] border-[#182943] hover:border-[#0866F5]/50 text-[#94A3B8]'
              }`}
            >
              <div>
                <span className="font-bold text-xs text-[#F8FAFC] block">Padrão (Dark Tech Navy)</span>
                <span className="text-[11px] text-[#94A3B8]">Azul marinho tecnológico e visual limpo</span>
              </div>
              {settings.themeMode !== 'neon' && (
                <CheckCircle2 className="w-4 h-4 text-[#00A9FF] shrink-0 mt-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                onUpdateSettings({ themeMode: 'neon' });
                notify('Modo Neon Night ativado! ✨');
              }}
              className={`p-3.5 rounded-xl border text-left transition flex items-start justify-between ${
                settings.themeMode === 'neon'
                  ? 'bg-gradient-to-br from-[#0866F5]/30 via-[#0B1730] to-[#00A9FF]/20 border-[#00A9FF] ring-2 ring-[#00A9FF]/40 shadow-lg shadow-[#00A9FF]/10'
                  : 'bg-[#050D20] border-[#182943] hover:border-[#0866F5]/50 text-[#94A3B8]'
              }`}
            >
              <div>
                <span className="font-bold text-xs text-[#F8FAFC] block flex items-center gap-1.5">
                  Neon Night <Sparkles className="w-3.5 h-3.5 text-[#00A9FF] inline" />
                </span>
                <span className="text-[11px] text-[#94A3B8]">
                  Iluminação elétrica e destaque elevado nos cards
                </span>
              </div>
              {settings.themeMode === 'neon' && (
                <CheckCircle2 className="w-4 h-4 text-[#00A9FF] shrink-0 mt-0.5" />
              )}
            </button>
          </div>
          <p className="text-[11px] text-[#64748B]">
            Aplica iluminação neon pulsante nos cards de sorteio, na roleta e nos tickets vencedores.
          </p>
        </div>

        {settings.order === 'random' && (
          <div className="pt-2 flex justify-start">
            <button
              type="button"
              onClick={() => {
                onUpdateSettings({ seed: Math.floor(Math.random() * 4294967295) + 1 });
                notify('Números reembaralhados com nova semente!');
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-[#00A9FF] bg-[#050D20] hover:bg-[#0B1730] border border-[#182943] rounded-xl transition"
            >
              <Shuffle className="w-3.5 h-3.5" />
              <span>Embaralhar Novamente</span>
            </button>
          </div>
        )}
      </div>

      {/* Host Public Identification for Participants */}
      <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-6 shadow-xl space-y-4 animate-card-enter neon-card">
        <div className="flex items-center gap-2 pb-3 border-b border-[#182943]">
          <User className="w-5 h-5 text-[#00A9FF]" />
          <h2 className="font-display font-bold text-lg text-[#F8FAFC]">Identificação para os Participantes</h2>
        </div>

        <p className="text-xs text-[#94A3B8] leading-relaxed">
          Essas informações aparecem na aba <b className="text-[#F8FAFC]">Consulta</b> para que seus participantes tenham certeza de que estão no
          sorteio certo.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
              Nome do Sorteador ou Canal
            </label>
            <input
              type="text"
              value={settings.organizerName || ''}
              onChange={(e) => onUpdateSettings({ organizerName: e.target.value })}
              placeholder="Ex: Canal do Pedro, Gusta Games, Rifa Solidária"
              className="w-full bg-[#050D20] border border-[#182943] rounded-xl px-3.5 py-2.5 text-sm text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#00A9FF]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
              Título do Sorteio
            </label>
            <input
              type="text"
              value={settings.raffleTitle || ''}
              onChange={(e) => onUpdateSettings({ raffleTitle: e.target.value })}
              placeholder="Ex: Sorteio Especial de 1000 Moedas"
              className="w-full bg-[#050D20] border border-[#182943] rounded-xl px-3.5 py-2.5 text-sm text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#00A9FF]"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
              Código Único de Consulta (para participantes digitarem)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.raffleCode || 'GIO-7492'}
                onChange={(e) => onUpdateSettings({ raffleCode: e.target.value.toUpperCase().trim() })}
                placeholder="Ex: GIO-7492"
                className="flex-1 bg-[#050D20] border border-[#182943] rounded-xl px-3.5 py-2.5 text-sm text-[#00A9FF] font-mono font-bold uppercase focus:outline-none focus:border-[#00A9FF]"
              />
              <button
                type="button"
                onClick={() => {
                  const newCode = generateRaffleCode();
                  onUpdateSettings({ raffleCode: newCode });
                  notify(`Novo código gerado: #${newCode}`);
                }}
                className="px-3.5 py-2.5 bg-[#050D20] hover:bg-[#0B1730] border border-[#182943] text-[#00A9FF] rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Gerar Novo</span>
              </button>
            </div>
            <p className="text-[11px] text-[#64748B] mt-1">
              Os participantes podem digitar esse código na aba Consulta para carregar automaticamente seus bilhetes.
            </p>
          </div>
        </div>
      </div>

      {/* Backup and Export Card */}
      <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-6 shadow-xl space-y-4 animate-card-enter neon-card">
        <div className="flex items-center gap-2 pb-3 border-b border-[#182943]">
          <Download className="w-5 h-5 text-[#00A9FF]" />
          <h2 className="font-display font-bold text-lg text-[#F8FAFC]">Backup e Exportação</h2>
        </div>

        <p className="text-xs text-[#94A3B8] leading-relaxed">
          Seus dados são salvos automaticamente no navegador deste dispositivo. Baixe um arquivo de backup antes do
          sorteio para não correr risco de perder informações se trocar de navegador ou computador.
        </p>

        {/* Robust Idle Auto-Save notice */}
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#050D20] border border-[#00A9FF]/30 text-xs text-[#F8FAFC]">
          <div className="p-1.5 rounded-lg bg-[#00A9FF]/20 text-[#00A9FF] shrink-0">
            <Zap className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-[#00A9FF] block">Auto-Salvamento Ocioso Ativo (requestIdleCallback)</span>
            <span className="text-[11px] text-[#94A3B8]">
              O estado da lista é persistido nos períodos ociosos da CPU, garantindo 60fps sem travamentos durante a animação e salvamento instantâneo contra perda de dados.
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] hover:from-[#00A9FF] hover:to-[#35B9F5] text-[#F8FAFC] font-bold text-xs transition shadow-md shadow-[#0866F5]/20 active:scale-95"
          >
            <FileText className="w-4 h-4 text-[#F8FAFC]" />
            <span>Exportar Laudo PDF (Hash & Ganhadores)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadBackup}
            className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-[#050D20] hover:bg-[#0B1730] border border-[#182943] text-[#F8FAFC] font-bold text-xs transition active:scale-95"
          >
            <Download className="w-4 h-4 text-[#00A9FF]" />
            <span>Baixar Backup Completo (.json)</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            className="flex items-center justify-center gap-2 p-3.5 rounded-xl bg-[#050D20] hover:bg-[#0B1730] border border-[#182943] text-[#F8FAFC] font-bold text-xs transition active:scale-95"
          >
            <FileText className="w-4 h-4 text-[#00A9FF]" />
            <span>Exportar Planilha (.csv)</span>
          </button>
        </div>

        {/* Restore options */}
        <div className="pt-4 border-t border-[#182943] space-y-3">
          <div className="text-xs font-semibold text-[#94A3B8]">Restaurar de um Backup</div>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            <input
              ref={restoreFileRef}
              type="file"
              accept=".json"
              onChange={handleFileRestore}
              className="text-xs text-[#94A3B8] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#0866F5] file:text-[#F8FAFC] hover:file:bg-[#00A9FF] cursor-pointer w-full"
            />

            <button
              type="button"
              onClick={() => setIsJsonDrawerOpen(!isJsonDrawerOpen)}
              className="px-3 py-1.5 text-xs text-[#94A3B8] hover:text-[#F8FAFC] whitespace-nowrap"
            >
              {isJsonDrawerOpen ? 'Fechar texto' : 'Colar texto JSON'}
            </button>
          </div>

          {isJsonDrawerOpen && (
            <div className="pt-2 space-y-2">
              <textarea
                rows={3}
                value={backupJsonText}
                onChange={(e) => setBackupJsonText(e.target.value)}
                placeholder="Cole o conteúdo do backup .json aqui..."
                className="w-full bg-[#050D20] border border-[#182943] rounded-xl p-2.5 text-xs text-[#F8FAFC] font-mono focus:outline-none focus:border-[#00A9FF]"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleRestoreJson(backupJsonText)}
                  className="px-3 py-1 text-xs font-bold bg-[#0866F5] hover:bg-[#00A9FF] text-[#F8FAFC] rounded-lg transition"
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
      <div className="bg-[#101F3D] border border-[#182943] rounded-2xl p-6 shadow-xl space-y-3">
        <div className="text-xs font-semibold text-[#94A3B8]">Ações Rápidas de Manutenção</div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onResetCoinsOnly}
            className="px-3 py-2 text-xs font-semibold bg-[#050D20] hover:bg-[#0B1730] border border-[#182943] text-[#94A3B8] hover:text-[#F8FAFC] rounded-xl transition"
          >
            Zerar moedas de todos (iniciar nova rodada)
          </button>
          <button
            type="button"
            onClick={onResetToSample}
            className="px-3 py-2 text-xs font-semibold bg-[#050D20] hover:bg-[#0B1730] border border-[#182943] text-[#00A9FF] rounded-xl transition flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Carregar Participantes de Exemplo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
