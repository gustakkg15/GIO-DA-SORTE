import React, { useState } from 'react';
import {
  Sparkles,
  Tv,
  Printer,
  Video,
  Swords,
  Search,
  BarChart3,
  HelpCircle,
  Settings,
  Heart,
  Cloud,
  ShieldCheck,
  Cpu,
  Layers,
  ArrowUp,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Hash,
  Download,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import { AutoSaveStatus } from '../utils/idleStorage';
import { User as FirebaseUser } from 'firebase/auth';

interface FooterProps {
  onSelectTab: (tab: 'draw' | 'tiktok' | 'search' | 'stats' | 'settings' | 'help' | 'support') => void;
  onOpenPresentation: () => void;
  onOpenBattleRoyale: () => void;
  onOpenObsOverlay: () => void;
  onOpenPrintSheet: () => void;
  onOpenMonteCarlo: () => void;
  onOpenAuditReport: () => void;
  onOpenAccount: () => void;
  currentUser: FirebaseUser | null;
  rosterHash: string;
  autoSaveStatus: AutoSaveStatus;
  lastSavedAt: number | null;
  onFlushSave?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onSelectTab,
  onOpenPresentation,
  onOpenBattleRoyale,
  onOpenObsOverlay,
  onOpenPrintSheet,
  onOpenMonteCarlo,
  onOpenAuditReport,
  onOpenAccount,
  currentUser,
  rosterHash,
  autoSaveStatus,
  lastSavedAt,
  onFlushSave,
}) => {
  const [copiedHash, setCopiedHash] = useState(false);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  const handleCopyHash = () => {
    if (!rosterHash) return;
    navigator.clipboard.writeText(rosterHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <footer className="border-t border-blue-950/70 bg-gradient-to-b from-slate-950 via-[#070b16] to-[#040711] text-slate-400 relative overflow-hidden">
      {/* Subtle background ambient glow */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Main Footer Container */}
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8">
          
          {/* Brand & Mission Column (Col 1 to 5) */}
          <div className="lg:col-span-5 flex flex-col justify-between pr-0 lg:pr-6">
            <div className="space-y-4">
              {/* Brand Wordmark & PRO badge */}
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/30 ring-1 ring-blue-400/40">
                  <Sparkles className="w-5 h-5 fill-white" />
                </div>
                <div className="flex items-center gap-1.5 font-display font-black text-xl sm:text-2xl tracking-tight">
                  <span className="text-white">GIO DA SORTE</span>
                  <span className="bg-gradient-to-r from-sky-400 to-cyan-300 bg-clip-text text-transparent px-1 font-black">
                    PRO
                  </span>
                </div>
              </div>

              {/* Mission Statement */}
              <p className="text-sm leading-relaxed text-slate-300 max-w-xl">
                Plataforma web avançada para distribuição proporcional por moedas, gestão de bilhetes e sorteios
                auditáveis. Criada para transmissões ao vivo no YouTube, Twitch, TikTok, rifas beneficentes e gincanas
                com total transparência matemática.
              </p>

              {/* Trust Badges matching screenshot */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {/* Web Crypto CSPRNG */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 text-xs font-semibold shadow-sm shadow-emerald-950/50">
                  <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Web Crypto CSPRNG</span>
                </div>

                {/* SHA-256 Anti-Fraude */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-950/50 border border-blue-500/40 text-sky-300 text-xs font-semibold shadow-sm shadow-blue-950/50">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>SHA-256 Anti-Fraude</span>
                </div>

                {/* Offline / Local */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/60 text-slate-300 text-xs font-semibold shadow-sm">
                  <Cloud className="w-3.5 h-3.5 text-slate-400" />
                  <span>Offline / Local</span>
                </div>

                {/* Auto-Save requestIdleCallback badge */}
                <div
                  title="Auto-salvamento resiliente via requestIdleCallback sem travamento durante os sorteios"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                    autoSaveStatus === 'saved'
                      ? 'bg-sky-950/40 border-sky-500/40 text-sky-300'
                      : autoSaveStatus === 'saving'
                      ? 'bg-amber-950/40 border-amber-500/40 text-amber-300 animate-pulse'
                      : autoSaveStatus === 'error'
                      ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-sky-400" />
                  <span>Auto-Salvo Ocioso</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block animate-ping" />
                </div>
              </div>
            </div>

            {/* Quick Hash Verification in Brand Column */}
            {rosterHash && (
              <div className="mt-6 pt-4 border-t border-slate-900/80 flex items-center justify-between gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-blue-950/40">
                <div className="flex items-center gap-2 min-w-0">
                  <Hash className="w-4 h-4 text-sky-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Hash de Verificação da Lista
                    </div>
                    <code className="text-[11px] text-sky-200/90 font-mono truncate block max-w-xs">
                      {rosterHash}
                    </code>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  className="px-2 py-1 text-xs rounded-lg bg-blue-950/60 hover:bg-blue-900/80 text-sky-300 border border-blue-800/50 flex items-center gap-1 shrink-0 transition"
                >
                  {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedHash ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Links Column 1: MÓDULOS DE SORTEIO (Col 6 to 7) */}
          <div className="lg:col-span-2 sm:col-span-1 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-display flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Módulos de Sorteio
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('draw')}
                  className="hover:text-sky-300 text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <span>Mesa de Sorteio (Tambor / Roleta)</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenPresentation}
                  className="hover:text-sky-300 text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <Tv className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Modo Telão Fullscreen</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenBattleRoyale}
                  className="hover:text-sky-300 text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <Swords className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Torneio Battle Royale</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenObsOverlay}
                  className="hover:text-sky-300 text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <Video className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Overlay Transparente OBS</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('tiktok')}
                  className="hover:text-[#00F2FE] text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <Video className="w-4 h-4 text-[#FE2C55] shrink-0" />
                  <span>Sorteio TikTok Live</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full font-bold bg-[#FE2C55]/20 text-[#FE2C55] border border-[#FE2C55]/40">
                    Novo
                  </span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('stats')}
                  className="hover:text-sky-300 text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <BarChart3 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Chances & Estatísticas</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Links Column 2: AUDITORIA & BILHETES (Col 8 to 9) */}
          <div className="lg:col-span-3 sm:col-span-1 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-display flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
              Auditoria & Bilhetes
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('search')}
                  className="hover:text-sky-300 text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <Search className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Consultar Bilhete / Rifa</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenMonteCarlo}
                  className="hover:text-sky-300 text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Simulador Monte Carlo (Auditoria)</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenAuditReport}
                  className="hover:text-sky-300 text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Relatório Oficial em PDF (Auditado)</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenPrintSheet}
                  className="hover:text-sky-300 text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <Printer className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Imprimir Folha de Bilhetes</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('help')}
                  className="hover:text-sky-300 text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Calculadora & Como Funciona</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Links Column 3: CONTA & APOIO (Col 10 to 12) */}
          <div className="lg:col-span-2 sm:col-span-1 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider font-display flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Conta & Apoio
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  type="button"
                  onClick={onOpenAccount}
                  className="hover:text-sky-300 text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <Cloud className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>{currentUser ? 'Gerenciar Conta Conectada' : 'Conectar Conta Google'}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('settings')}
                  className="hover:text-sky-300 text-slate-300 transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <Settings className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Backup & Configurações</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onSelectTab('support')}
                  className="text-rose-400 hover:text-rose-300 font-semibold transition-colors text-left flex items-center gap-2 py-0.5"
                >
                  <Heart className="w-4 h-4 text-rose-500 fill-rose-500 shrink-0" />
                  <span>Apoiar o Projeto (PIX)</span>
                </button>
              </li>
              {/* Real-time Storage Monitor */}
              <li className="pt-2">
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1 font-medium">
                      <Zap className="w-3.5 h-3.5 text-sky-400" />
                      Auto-salvo
                    </span>
                    <span
                      className={`font-semibold ${
                        autoSaveStatus === 'saved'
                          ? 'text-emerald-400'
                          : autoSaveStatus === 'saving'
                          ? 'text-amber-400'
                          : autoSaveStatus === 'error'
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {autoSaveStatus === 'saved'
                        ? 'Protegido'
                        : autoSaveStatus === 'saving'
                        ? 'Gravando...'
                        : autoSaveStatus === 'pending'
                        ? 'Aguardando ocioso'
                        : 'Atenção'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {lastSavedAt
                      ? `Último salvamento: ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                      : 'Pronto para persistência'}
                  </div>
                  {onFlushSave && (
                    <button
                      type="button"
                      onClick={onFlushSave}
                      className="w-full mt-1 py-1 px-2 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition text-center font-medium"
                    >
                      Forçar Salvamento Imediato
                    </button>
                  )}
                </div>
              </li>
            </ul>
          </div>
        </div>

        {/* Separator Line */}
        <div className="my-8 border-t border-slate-900/90" />

        {/* Bottom Bar: Copyright & Back to Top */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-center sm:text-left">
            <span>© 2026 GIO DA SORTE PRO. Todos os direitos reservados.</span>
            <span className="hidden sm:inline">·</span>
            <span>Processamento no navegador com proteção criptográfica.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={scrollToTop}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-850 hover:text-white text-slate-300 border border-slate-800 transition active:scale-95 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 font-medium"
            >
              <span>Voltar ao topo</span>
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
