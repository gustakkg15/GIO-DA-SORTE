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
  liveConnectionState?: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR' | string;
  liveConnectedUsername?: string;
}

const BREADCRUMB_MAP: Record<AppNavigationTab, { section: string; title: string }> = {
  dashboard: { section: 'Início', title: 'Painel' },
  draw: { section: 'Operação', title: 'Sorteios' },
  tiktok: { section: 'Transmissão', title: 'TikTok LIVE' },
  search: { section: 'Operação', title: 'Participantes' },
  stats: { section: 'Análise', title: 'Relatórios' },
  subscription: { section: 'Conta', title: 'Assinatura e Planos' },
  settings: { section: 'Conta', title: 'Configurações' },
  legal: { section: 'Configurações', title: 'Central Legal e Privacidade (LGPD)' },
  help: { section: 'Configurações', title: 'Central de Ajuda' },
  support: { section: 'Configurações', title: 'Suporte' },
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
  };

  const connMeta = mapTikTokConnectionState(
    liveConnectionState,
    liveConnected,
    liveConnectedUsername
  );

  return (
    <header className="sticky top-0 z-20 h-[72px] bg-[#0B1730]/92 backdrop-blur-xl border-b border-[var(--gio-border-subtle)] shadow-[0_4px_24px_rgba(2,8,23,0.32)] flex items-center justify-between px-3 sm:px-5 lg:px-7 select-none transition-colors">
      {/* Esquerda: Botão Menu Mobile + Título Contextual */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl bg-[#101F3D] border border-[var(--gio-border-subtle)] text-[#F8FAFC] hover:bg-[#182943] hover:border-[var(--gio-border-active)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF]"
          aria-label="Abrir menu de navegação lateral"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs text-[#94A3B8] font-medium truncate">
          <span className="hidden sm:inline px-2 py-0.5 rounded-md bg-[#101F3D] border border-[var(--gio-border-subtle)] text-[11px] font-semibold text-[#94A3B8]">
            {breadcrumb.section}
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-[#64748B] hidden sm:inline shrink-0" />
          <h1 className="text-sm sm:text-base lg:text-lg font-bold tracking-tight text-[#F8FAFC] truncate">
            {breadcrumb.title}
          </h1>
        </div>
      </div>

      {/* Direita: Indicadores de Status + Ferramentas Rápidas */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Status de Conexão TikTok LIVE (Fonte Oficial: TikTokConnectionState) */}
        <button
          type="button"
          onClick={() => onSelectTab('tiktok')}
          title={`${connMeta.titleHint} — Clique para acompanhar`}
          className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            connMeta.state === 'DISCONNECTED'
              ? 'bg-[#101F3D] hover:bg-[#182943] text-[#94A3B8] hover:text-[#F8FAFC] border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)]'
              : connMeta.badgeClass
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${connMeta.dotClass}`} />
          <span>{connMeta.label}</span>
          {connMeta.state === 'CONNECTED' && liveConnectedUsername && (
            <span className="font-mono text-[#F8FAFC]">
              · @{liveConnectedUsername.replace(/^@+/, '')}
            </span>
          )}
        </button>

        {/* Status de Sincronização */}
        <div
          className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#94A3B8] bg-[#101F3D] border border-[var(--gio-border-subtle)]"
          title="Status de salvamento dos dados"
        >
          {syncStatus === 'saving' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-[#F5B942] animate-spin" />
              <span>Salvando...</span>
            </>
          ) : syncStatus === 'error' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#F05262]" />
              <span className="text-[#F05262]">Erro ao salvar</span>
            </>
          ) : syncStatus === 'offline' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#94A3B8]" />
              <span>Salvo no dispositivo</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 text-[#20C997]" />
              <span className="text-[#F8FAFC]">Salvo</span>
            </>
          )}
        </div>

        <div className="h-5 w-px bg-[var(--gio-border-subtle)] mx-1 hidden sm:block" />

        {/* Controle de Áudio */}
        <button
          type="button"
          onClick={onToggleSound}
          className="p-2 rounded-xl bg-[#101F3D]/70 hover:bg-[#182943] border border-[var(--gio-border-subtle)] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF]"
          title={soundEnabled ? 'Silenciar áudio' : 'Ativar efeitos sonoros'}
          aria-label={soundEnabled ? 'Silenciar áudio' : 'Ativar efeitos sonoros'}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-[#00A9FF]" />
          ) : (
            <VolumeX className="w-4 h-4 text-[#64748B]" />
          )}
        </button>

        {/* Modo Apresentação (Telão) */}
        <button
          type="button"
          onClick={onOpenPresentation}
          className="p-2 rounded-xl bg-[#101F3D]/70 hover:bg-[#182943] border border-[var(--gio-border-subtle)] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF]"
          title="Modo Apresentação (Tela Cheia)"
          aria-label="Modo Apresentação (Tela Cheia)"
        >
          <Tv className="w-4 h-4" />
        </button>

        {/* Impressão de Bilhetes */}
        <button
          type="button"
          onClick={onOpenPrintSheet}
          className="hidden sm:inline-flex p-2 rounded-xl bg-[#101F3D]/70 hover:bg-[#182943] border border-[var(--gio-border-subtle)] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF]"
          title="Imprimir Folha de Bilhetes"
          aria-label="Imprimir Folha de Bilhetes"
        >
          <Printer className="w-4 h-4" />
        </button>

        {/* OBS Studio Overlay */}
        <button
          type="button"
          onClick={onOpenObsOverlay}
          className="p-2 rounded-xl bg-[#101F3D]/70 hover:bg-[#182943] border border-[var(--gio-border-subtle)] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF]"
          title="OBS Studio Overlay Transparente"
          aria-label="OBS Studio Overlay Transparente"
        >
          <Video className="w-4 h-4 text-[#35B9F5]" />
        </button>

        {/* Botão de Ação Primária Contextual */}
        {onStartNewRaffle && (
          <button
            type="button"
            onClick={onStartNewRaffle}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#0866F5] to-[#00A9FF] hover:brightness-110 text-white text-xs font-semibold shadow-[0_6px_18px_rgba(8,102,245,0.32)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#00A9FF]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="hidden sm:inline">Novo Sorteio</span>
          </button>
        )}

        {/* Botão de Conta / Perfil */}
        <button
          type="button"
          onClick={onOpenAccount}
          className="p-0.5 rounded-full text-[#F8FAFC] hover:ring-2 hover:ring-[#00A9FF] transition-all ml-0.5"
          title={currentUser?.email || 'Minha Conta'}
          aria-label="Abrir perfil da conta"
        >
          <div className="w-8 h-8 rounded-full bg-[#101F3D] flex items-center justify-center text-xs font-semibold text-[#F8FAFC] border border-[var(--gio-border-subtle)]">
            {currentUser?.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Avatar"
                className="w-full h-full rounded-full object-cover"
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
