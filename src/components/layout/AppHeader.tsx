import React from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  Menu,
  Volume2,
  VolumeX,
  Tv,
  Printer,
  Video,
  User,
  Plus,
  Check,
  Loader2,
  ChevronRight,
  Radio,
} from 'lucide-react';
import { AppNavigationTab } from '../Header';
import { mapTikTokConnectionState } from '../../utils/tiktokStatusMapper';

export interface AppHeaderProps {
  activeTab: AppNavigationTab;
  onSelectTab: (tab: AppNavigationTab) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenMobileMenu: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenPresentation: () => void;
  onOpenPrintSheet: () => void;
  onOpenObsOverlay: () => void;
  currentUser: FirebaseUser | null;
  onOpenAccount: () => void;
  onStartNewRaffle?: () => void;
  syncStatus?: 'synced' | 'saving' | 'error' | 'offline' | 'idle';
  totalParticipants?: number;
  liveConnected?: boolean;
  liveConnectionState?:
    | 'DISCONNECTED'
    | 'CONNECTING'
    | 'CONNECTED'
    | 'RECONNECTING'
    | 'ERROR'
    | string;
  liveConnectedUsername?: string;
}

const BREADCRUMB_MAP: Record<AppNavigationTab, { section: string; title: string; subtitle: string }> = {
  dashboard: {
    section: 'Visão Geral',
    title: 'Painel de Controle',
    subtitle: 'Indicadores operacionais e atalhos rápidos',
  },
  draw: {
    section: 'Operação',
    title: 'Central de Sorteios',
    subtitle: 'Mesa oficial de sorteio, roleta e auditoria',
  },
  tiktok: {
    section: 'Transmissão PRO',
    title: 'TikTok LIVE & Comentários',
    subtitle: 'Captura ao vivo de presentes, moedas e comentários',
  },
  search: {
    section: 'Operação',
    title: 'Participantes e Cotas',
    subtitle: 'Gestão de inscritos, moedas e consulta pública',
  },
  stats: {
    section: 'Análise',
    title: 'Relatórios e Probabilidades',
    subtitle: 'Estatísticas matemáticas, ocupação da série e laudos PDF',
  },
  subscription: {
    section: 'Conta',
    title: 'Planos e Assinatura',
    subtitle: 'Gerenciamento do plano FREE e recursos exclusivos PRO',
  },
  settings: {
    section: 'Sistema',
    title: 'Configurações',
    subtitle: 'Parâmetros de conversão, backup, guia e suporte',
  },
  legal: {
    section: 'Configurações',
    title: 'Central Legal e Privacidade (LGPD)',
    subtitle: 'Termos de uso, conformidade e governança de dados',
  },
  help: {
    section: 'Configurações',
    title: 'Central de Ajuda',
    subtitle: 'Guia passo a passo de uso da plataforma',
  },
  support: {
    section: 'Configurações',
    title: 'Suporte ao Cliente',
    subtitle: 'Atendimento e diagnóstico operacional',
  },
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenMobileMenu,
  soundEnabled,
  onToggleSound,
  onOpenPresentation,
  onOpenPrintSheet,
  onOpenObsOverlay,
  currentUser,
  onOpenAccount,
  onStartNewRaffle,
  syncStatus = 'synced',
  liveConnected = false,
  liveConnectionState,
  liveConnectedUsername,
}) => {
  const breadcrumb = BREADCRUMB_MAP[activeTab] || {
    section: 'Plataforma',
    title: 'GIO DA SORTE',
    subtitle: 'Sorteios auditáveis e transmissões ao vivo',
  };

  const connMeta = mapTikTokConnectionState(
    liveConnectionState,
    liveConnected,
    liveConnectedUsername
  );

  return (
    <header className="sticky top-0 z-20 h-[70px] bg-[#050D20]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between px-4 sm:px-6 lg:px-8 select-none">
      {/* Left: Mobile Menu Button + Module Title & Breadcrumb */}
      <div className="flex items-center gap-3.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl bg-[#0B1730] border border-white/10 text-[#F8FAFC] hover:bg-[#101F3D] hover:border-white/20 transition-all"
          aria-label="Abrir menu de navegação lateral"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium truncate">
            <span className="hidden sm:inline-block font-mono text-[11px] font-bold uppercase tracking-wider text-[#00A9FF]">
              {breadcrumb.section}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-500 hidden sm:inline shrink-0" />
            <h1 className="text-sm sm:text-base lg:text-lg font-bold tracking-tight text-[#F8FAFC] truncate">
              {breadcrumb.title}
            </h1>
          </div>
          <p className="hidden md:block text-xs text-slate-400 truncate mt-0.5">
            {breadcrumb.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Connection & Save Indicators + Grouped Utility Controls + Primary CTA */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* TikTok LIVE Connection Status Pill */}
        <button
          type="button"
          onClick={() => onSelectTab('tiktok')}
          title={`${connMeta.titleHint} — Clique para abrir TikTok LIVE`}
          className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            connMeta.state === 'DISCONNECTED'
              ? 'bg-[#0B1730] hover:bg-[#101F3D] text-slate-300 hover:text-white border-white/10'
              : connMeta.badgeClass
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${connMeta.dotClass}`} />
          <Radio className="w-3.5 h-3.5" />
          <span>{connMeta.label}</span>
          {connMeta.state === 'CONNECTED' && liveConnectedUsername && (
            <span className="font-mono text-white">
              · @{liveConnectedUsername.replace(/^@+/, '')}
            </span>
          )}
        </button>

        {/* Save / Sync Status Indicator */}
        <div
          className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 bg-[#0B1730] border border-white/10"
          title="Status de salvamento dos dados"
        >
          {syncStatus === 'saving' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-[#00A9FF] animate-spin" />
              <span>Salvando...</span>
            </>
          ) : syncStatus === 'error' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#F05262]" />
              <span className="text-[#F05262]">Erro ao salvar</span>
            </>
          ) : syncStatus === 'offline' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>Salvo local</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 text-[#20C997]" />
              <span className="text-[#F8FAFC]">Salvo</span>
            </>
          )}
        </div>

        {/* Grouped Utility Controls */}
        <div className="flex items-center bg-[#0B1730]/90 border border-white/10 rounded-xl p-0.5 shadow-xs">
          <button
            type="button"
            onClick={onToggleSound}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#101F3D] transition-colors"
            title={soundEnabled ? 'Silenciar áudio' : 'Ativar efeitos sonoros'}
            aria-label={soundEnabled ? 'Silenciar áudio' : 'Ativar efeitos sonoros'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-[#00A9FF]" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-500" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenPresentation}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#101F3D] transition-colors"
            title="Modo Apresentação (Telão)"
            aria-label="Modo Apresentação (Telão)"
          >
            <Tv className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenPrintSheet}
            className="hidden sm:inline-flex p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#101F3D] transition-colors"
            title="Imprimir Folha de Bilhetes"
            aria-label="Imprimir Folha de Bilhetes"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenObsOverlay}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#101F3D] transition-colors"
            title="OBS Studio Overlay Transparente"
            aria-label="OBS Studio Overlay Transparente"
          >
            <Video className="w-4 h-4 text-[#35B9F5]" />
          </button>
        </div>

        {/* Primary Contextual Action: Novo Sorteio */}
        {onStartNewRaffle && (
          <button
            type="button"
            onClick={onStartNewRaffle}
            className="gio-btn-primary px-3.5 py-2 text-xs font-semibold"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Novo Sorteio</span>
          </button>
        )}

        {/* User Account Trigger */}
        <button
          type="button"
          onClick={onOpenAccount}
          className="p-0.5 rounded-xl text-[#F8FAFC] hover:ring-2 hover:ring-[#00A9FF]/50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF]"
          title={currentUser?.email || 'Minha Conta'}
          aria-label="Abrir perfil da conta"
        >
          <div className="w-8 h-8 rounded-xl bg-[#101F3D] flex items-center justify-center text-xs font-semibold text-[#F8FAFC] border border-white/10 shadow-xs">
            {currentUser?.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Avatar"
                className="w-full h-full rounded-xl object-cover"
              />
            ) : (
              <User className="w-4 h-4 text-[#00A9FF]" />
            )}
          </div>
        </button>
      </div>
    </header>
  );
};
