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
  Radio,
  Cloud,
  CloudCheck,
  Check,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { AppNavigationTab } from '../Header';

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
}

const BREADCRUMB_MAP: Record<AppNavigationTab, { group: string; label: string }> = {
  dashboard: { group: 'Principal', label: 'Painel Geral' },
  draw: { group: 'Operação', label: 'Sorteios & Premiações' },
  tiktok: { group: 'Operação', label: 'TikTok LIVE PRO' },
  search: { group: 'Operação', label: 'Participantes & Bilhetes' },
  stats: { group: 'Análise', label: 'Relatórios & Auditoria' },
  subscription: { group: 'Conta', label: 'Assinatura & Planos' },
  legal: { group: 'Conta', label: 'Central Legal & LGPD' },
  settings: { group: 'Conta', label: 'Configurações & Backup' },
  help: { group: 'Conta', label: 'Central de Ajuda' },
  support: { group: 'Conta', label: 'Suporte Técnico' },
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapsed,
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
  totalParticipants = 0,
  liveConnected = false,
}) => {
  const breadcrumb = BREADCRUMB_MAP[activeTab] || {
    group: 'Aplicação',
    label: 'GIO DA SORTE PRO',
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-[#FAF8F3] border-b border-[#E2DDD2] flex items-center justify-between px-3 sm:px-5 lg:px-6 select-none transition-colors">
      {/* Left Area: Mobile Menu Trigger + Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Mobile Hamburger Toggle */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-[#203A32] hover:bg-[#EAE4D7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#486D56]"
          aria-label="Abrir menu de navegação lateral"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Dynamic Contextual Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-[#5E6F68] font-medium truncate">
          <span className="text-[#87968F] hidden sm:inline">{breadcrumb.group}</span>
          <ChevronRight className="w-3.5 h-3.5 text-[#B8C2BC] hidden sm:inline shrink-0" />
          <h1 className="text-xs sm:text-sm font-semibold text-[#203A32] truncate">
            {breadcrumb.label}
          </h1>
        </div>
      </div>

      {/* Right Area: Status Indicators, Quick Utilities & Primary Action */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* TikTok LIVE Connection Badge */}
        <div
          title={liveConnected ? 'TikTok LIVE Conectada' : 'TikTok LIVE em Espera'}
          className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
            liveConnected
              ? 'bg-[#E7F3EC] text-[#1B7A54] border-[#B2DFC6]'
              : 'bg-[#F2EFE8] text-[#5E6F68] border-[#E2DDD2]'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              liveConnected ? 'bg-[#1B7A54] animate-pulse' : 'bg-[#9BA9A1]'
            }`}
          />
          <span>{liveConnected ? 'LIVE Conectada' : 'LIVE Pronta'}</span>
        </div>

        {/* Cloud Sync Status */}
        <div
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] text-[#5E6F68] bg-[#F2EFE8] border border-[#E2DDD2]"
          title="Status de sincronização com o banco de dados seguro"
        >
          {syncStatus === 'saving' ? (
            <>
              <Loader2 className="w-3 h-3 text-[#B48A51] animate-spin" />
              <span>Salvando...</span>
            </>
          ) : syncStatus === 'error' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#B83232]" />
              <span>Falha de Sync</span>
            </>
          ) : syncStatus === 'offline' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#87968F]" />
              <span>Modo Local</span>
            </>
          ) : (
            <>
              <Check className="w-3 h-3 text-[#486D56]" />
              <span>Salvo</span>
            </>
          )}
        </div>

        <div className="h-5 w-px bg-[#E2DDD2] mx-1 hidden sm:block" />

        {/* Quick Utility Tools */}
        {/* Audio Toggle */}
        <button
          type="button"
          onClick={onToggleSound}
          className="p-2 rounded-lg text-[#5E6F68] hover:text-[#203A32] hover:bg-[#EAE4D7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#486D56]"
          title={soundEnabled ? 'Silenciar Áudio' : 'Ativar Efeitos Sonoros'}
          aria-label={soundEnabled ? 'Silenciar Áudio' : 'Ativar Efeitos Sonoros'}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-[#486D56]" />
          ) : (
            <VolumeX className="w-4 h-4 text-[#87968F]" />
          )}
        </button>

        {/* Presentation Screen */}
        <button
          type="button"
          onClick={onOpenPresentation}
          className="p-2 rounded-lg text-[#5E6F68] hover:text-[#203A32] hover:bg-[#EAE4D7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#486D56]"
          title="Modo Apresentação (Tela Cheia)"
          aria-label="Modo Apresentação (Tela Cheia)"
        >
          <Tv className="w-4 h-4" />
        </button>

        {/* Print Tickets Sheet */}
        <button
          type="button"
          onClick={onOpenPrintSheet}
          className="hidden sm:inline-flex p-2 rounded-lg text-[#5E6F68] hover:text-[#203A32] hover:bg-[#EAE4D7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#486D56]"
          title="Imprimir Folha de Bilhetes e Rifas"
          aria-label="Imprimir Folha de Bilhetes e Rifas"
        >
          <Printer className="w-4 h-4" />
        </button>

        {/* OBS Studio Live Overlay */}
        <button
          type="button"
          onClick={onOpenObsOverlay}
          className="p-2 rounded-lg text-[#5E6F68] hover:text-[#203A32] hover:bg-[#EAE4D7] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#486D56]"
          title="OBS Studio Overlay Transparente para Transmissão"
          aria-label="OBS Studio Overlay Transparente para Transmissão"
        >
          <Video className="w-4 h-4 text-[#B8664B]" />
        </button>

        {/* Primary CTA: "Novo Sorteio" */}
        {onStartNewRaffle && (
          <button
            type="button"
            onClick={onStartNewRaffle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#486D56] hover:bg-[#3D5F4A] text-white text-xs font-semibold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#486D56]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Novo Sorteio</span>
          </button>
        )}

        {/* User Account / Profile trigger */}
        <button
          type="button"
          onClick={onOpenAccount}
          className="p-1 rounded-full text-[#203A32] hover:ring-2 hover:ring-[#486D56] transition-all ml-0.5"
          title={currentUser?.email || 'Minha Conta'}
          aria-label="Abrir perfil da conta"
        >
          <div className="w-8 h-8 rounded-full bg-[#E2DDD2] flex items-center justify-center text-xs font-bold text-[#203A32] border border-[#C5BCAB]">
            {currentUser?.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Avatar"
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <User className="w-4 h-4 text-[#5E6F68]" />
            )}
          </div>
        </button>
      </div>
    </header>
  );
};
