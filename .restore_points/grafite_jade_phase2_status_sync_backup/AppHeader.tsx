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
}) => {
  const breadcrumb = BREADCRUMB_MAP[activeTab] || {
    section: 'Plataforma',
    title: 'GIO DA SORTE PRO',
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-[#171D1C]/95 backdrop-blur-md border-b border-[#313D39] flex items-center justify-between px-3 sm:px-5 lg:px-6 select-none transition-colors">
      {/* Esquerda: Botão Menu Mobile + Título Contextual */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-[#EAE7DE] hover:bg-[#222B28] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6EAA90]"
          aria-label="Abrir menu de navegação lateral"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 text-xs text-[#9BA8A3] font-medium truncate">
          <span className="hidden sm:inline">{breadcrumb.section}</span>
          <ChevronRight className="w-3.5 h-3.5 text-[#313D39] hidden sm:inline shrink-0" />
          <h1 className="text-sm sm:text-base font-semibold text-[#EAE7DE] truncate">
            {breadcrumb.title}
          </h1>
        </div>
      </div>

      {/* Direita: Indicadores de Status + Ferramentas Rápidas */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Status de Conexão TikTok LIVE */}
        <button
          type="button"
          onClick={() => onSelectTab('tiktok')}
          title={
            liveConnected
              ? 'TikTok LIVE conectada — Clique para acompanhar'
              : 'TikTok LIVE desconectada — Clique para conectar'
          }
          className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            liveConnected
              ? 'bg-[#6EAA90]/15 text-[#6EAA90] border-[#6EAA90]/40 hover:bg-[#6EAA90]/20'
              : 'bg-[#222B28] text-[#9BA8A3] border-[#313D39] hover:text-[#EAE7DE]'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              liveConnected ? 'bg-[#6EAA90] animate-pulse' : 'bg-[#9BA8A3]/60'
            }`}
          />
          <span>{liveConnected ? 'LIVE Conectada' : 'LIVE Desconectada'}</span>
        </button>

        {/* Status de Sincronização */}
        <div
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-[#9BA8A3] bg-[#222B28] border border-[#313D39]"
          title="Status de salvamento dos dados"
        >
          {syncStatus === 'saving' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-[#C6A56A] animate-spin" />
              <span>Salvando...</span>
            </>
          ) : syncStatus === 'error' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#D96B6B]" />
              <span>Erro ao salvar</span>
            </>
          ) : syncStatus === 'offline' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#9BA8A3]" />
              <span>Salvo no dispositivo</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 text-[#6EAA90]" />
              <span>Salvo</span>
            </>
          )}
        </div>

        <div className="h-5 w-px bg-[#313D39] mx-1 hidden sm:block" />

        {/* Controle de Áudio */}
        <button
          type="button"
          onClick={onToggleSound}
          className="p-2 rounded-lg text-[#9BA8A3] hover:text-[#EAE7DE] hover:bg-[#222B28] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6EAA90]"
          title={soundEnabled ? 'Silenciar áudio' : 'Ativar efeitos sonoros'}
          aria-label={soundEnabled ? 'Silenciar áudio' : 'Ativar efeitos sonoros'}
        >
          {soundEnabled ? (
            <Volume2 className="w-4 h-4 text-[#6EAA90]" />
          ) : (
            <VolumeX className="w-4 h-4 text-[#9BA8A3]" />
          )}
        </button>

        {/* Modo Apresentação (Telão) */}
        <button
          type="button"
          onClick={onOpenPresentation}
          className="p-2 rounded-lg text-[#9BA8A3] hover:text-[#EAE7DE] hover:bg-[#222B28] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6EAA90]"
          title="Modo Apresentação (Tela Cheia)"
          aria-label="Modo Apresentação (Tela Cheia)"
        >
          <Tv className="w-4 h-4" />
        </button>

        {/* Impressão de Bilhetes */}
        <button
          type="button"
          onClick={onOpenPrintSheet}
          className="hidden sm:inline-flex p-2 rounded-lg text-[#9BA8A3] hover:text-[#EAE7DE] hover:bg-[#222B28] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6EAA90]"
          title="Imprimir Folha de Bilhetes"
          aria-label="Imprimir Folha de Bilhetes"
        >
          <Printer className="w-4 h-4" />
        </button>

        {/* OBS Studio Overlay */}
        <button
          type="button"
          onClick={onOpenObsOverlay}
          className="p-2 rounded-lg text-[#9BA8A3] hover:text-[#EAE7DE] hover:bg-[#222B28] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6EAA90]"
          title="OBS Studio Overlay Transparente"
          aria-label="OBS Studio Overlay Transparente"
        >
          <Video className="w-4 h-4 text-[#C6A56A]" />
        </button>

        {/* Botão de Ação Primária Contextual */}
        {onStartNewRaffle && (
          <button
            type="button"
            onClick={onStartNewRaffle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6EAA90] hover:bg-[#5C967D] text-[#171D1C] text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#6EAA90]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="hidden sm:inline">Novo Sorteio</span>
          </button>
        )}

        {/* Botão de Conta / Perfil */}
        <button
          type="button"
          onClick={onOpenAccount}
          className="p-1 rounded-full text-[#EAE7DE] hover:ring-2 hover:ring-[#6EAA90] transition-all ml-0.5"
          title={currentUser?.email || 'Minha Conta'}
          aria-label="Abrir perfil da conta"
        >
          <div className="w-8 h-8 rounded-full bg-[#222B28] flex items-center justify-center text-xs font-semibold text-[#EAE7DE] border border-[#313D39]">
            {currentUser?.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Avatar"
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <User className="w-4 h-4 text-[#6EAA90]" />
            )}
          </div>
        </button>
      </div>
    </header>
  );
};
