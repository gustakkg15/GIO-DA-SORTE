import React, { useState, useRef, useEffect } from 'react';
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
  Radio,
  SlidersHorizontal,
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
  const [isUtilitiesMenuOpen, setIsUtilitiesMenuOpen] = useState(false);
  const utilitiesMenuRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isUtilitiesMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsUtilitiesMenuOpen(false);
        triggerButtonRef.current?.focus();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (utilitiesMenuRef.current && !utilitiesMenuRef.current.contains(e.target as Node)) {
        setIsUtilitiesMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUtilitiesMenuOpen]);

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
    <header className="sticky top-0 z-20 h-[70px] bg-[#080D18]/95 backdrop-blur-md border-b border-[#A5B1C5]/15 flex items-center justify-between gap-2 px-3.5 sm:px-6 lg:px-8 select-none">
      {/* Left: Mobile Menu Button + Module Title & Breadcrumb */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center p-2.5 rounded-xl bg-[#111B30] border border-[#A5B1C5]/20 text-[#FFFFFF] hover:border-[#0131CD] transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
          aria-label="Abrir menu de navegação lateral"
          aria-controls="mobile-navigation-drawer"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className="lg:hidden w-9 h-9 rounded-xl bg-[#080D18] border border-[#0131CD]/45 shadow-sm overflow-hidden shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
          title="GIO DA SORTE — Ir para o Painel"
          aria-label="GIO DA SORTE — Ir para o Painel"
        >
          <img
            src="/logo.png"
            alt="Logotipo Oficial GIO DA SORTE"
            className="w-full h-full object-cover"
          />
        </button>

        <div className="min-w-0 flex-1">
          <span className="hidden sm:block text-[11px] font-semibold text-[#A5B1C5] leading-none mb-1 truncate">
            {breadcrumb.section}
          </span>
          <h1
            title={breadcrumb.title}
            className="text-xs sm:text-base lg:text-lg font-bold tracking-tight text-[#FFFFFF] line-clamp-2 sm:line-clamp-none sm:truncate leading-tight"
          >
            {breadcrumb.title}
          </h1>
          <p className="hidden xl:block text-xs text-[#A5B1C5] truncate mt-0.5 leading-none">
            {breadcrumb.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Connection & Save Indicators + Grouped Utility Controls + Primary CTA */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* TikTok LIVE Connection Status Pill */}
        <button
          type="button"
          onClick={() => onSelectTab('tiktok')}
          title={`${connMeta.titleHint} — Clique para abrir TikTok LIVE`}
          className={`hidden lg:flex min-h-[36px] items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
            connMeta.state === 'DISCONNECTED'
              ? 'bg-[#111B30] hover:border-[#0131CD] text-[#A5B1C5] hover:text-[#FFFFFF] border-[#A5B1C5]/20'
              : connMeta.badgeClass
          }`}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${connMeta.dotClass}`} />
          <Radio className="w-3.5 h-3.5 shrink-0" />
          <span>{connMeta.label}</span>
          {connMeta.state === 'CONNECTED' && liveConnectedUsername && (
            <span className="hidden xl:inline text-[#FFFFFF] font-medium">
              · @{liveConnectedUsername.replace(/^@+/, '')}
            </span>
          )}
        </button>

        {/* Save / Sync Status Indicator */}
        <div
          className="hidden xl:flex min-h-[36px] items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#A5B1C5] bg-[#111B30] border border-[#A5B1C5]/20"
          title="Status de salvamento dos dados"
        >
          {syncStatus === 'saving' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-[#A6C957] animate-spin" />
              <span>Salvando...</span>
            </>
          ) : syncStatus === 'error' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#F05262]" />
              <span className="text-[#F05262]">Erro ao salvar</span>
            </>
          ) : syncStatus === 'offline' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-[#A5B1C5]" />
              <span>Salvo local</span>
            </>
          ) : (
            <>
              <Check className="w-3.5 h-3.5 text-[#A6C957]" />
              <span className="text-[#FFFFFF]">Salvo</span>
            </>
          )}
        </div>

        {/* Grouped Utility Controls */}
        <div
          ref={utilitiesMenuRef}
          className="relative flex items-center bg-[#111B30] border border-[#A5B1C5]/20 rounded-xl p-0.5 shadow-xs"
        >
          <button
            type="button"
            onClick={onToggleSound}
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center p-2 rounded-lg text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
            title={soundEnabled ? 'Silenciar áudio' : 'Ativar efeitos sonoros'}
            aria-label={soundEnabled ? 'Silenciar áudio' : 'Ativar efeitos sonoros'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-[#FFFFFF]" />
            ) : (
              <VolumeX className="w-4 h-4 text-[#A5B1C5]" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenPresentation}
            className="hidden lg:inline-flex min-w-[44px] min-h-[44px] items-center justify-center p-2 rounded-lg text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
            title="Modo Apresentação (Telão)"
            aria-label="Modo Apresentação (Telão)"
          >
            <Tv className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenPrintSheet}
            className="hidden lg:inline-flex min-w-[44px] min-h-[44px] items-center justify-center p-2 rounded-lg text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
            title="Imprimir Folha de Bilhetes"
            aria-label="Imprimir Folha de Bilhetes"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenObsOverlay}
            className="hidden lg:inline-flex min-w-[44px] min-h-[44px] items-center justify-center p-2 rounded-lg text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
            title="OBS Studio Overlay Transparente"
            aria-label="OBS Studio Overlay Transparente"
          >
            <Video className="w-4 h-4 text-[#FFFFFF]" />
          </button>

          {/* Compact Utilities Trigger for < 1024px preserving 100% access to Telão, Imprimir, OBS and TikTok LIVE */}
          <button
            ref={triggerButtonRef}
            type="button"
            onClick={() => setIsUtilitiesMenuOpen((prev) => !prev)}
            className="lg:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center p-2 rounded-lg text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
            title="Utilitários de transmissão e impressão"
            aria-label="Utilitários de transmissão e impressão"
            aria-expanded={isUtilitiesMenuOpen}
            aria-haspopup="menu"
          >
            <SlidersHorizontal className="w-4 h-4 text-[#FFFFFF]" />
          </button>

          {isUtilitiesMenuOpen && (
            <div
              role="menu"
              aria-label="Menu de utilitários rápidos"
              className="lg:hidden absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-24px)] rounded-xl bg-[#111B30] border border-[#A5B1C5]/20 shadow-2xl p-1.5 z-50 space-y-1 animate-fade-in"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsUtilitiesMenuOpen(false);
                  onOpenPresentation();
                  triggerButtonRef.current?.focus();
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium text-[#FFFFFF] hover:bg-[#080D18] flex items-center gap-2.5 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
              >
                <Tv className="w-4 h-4 text-[#A5B1C5] shrink-0" />
                <span>Modo Apresentação (Telão)</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsUtilitiesMenuOpen(false);
                  onOpenPrintSheet();
                  triggerButtonRef.current?.focus();
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium text-[#FFFFFF] hover:bg-[#080D18] flex items-center gap-2.5 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
              >
                <Printer className="w-4 h-4 text-[#A5B1C5] shrink-0" />
                <span>Imprimir Folha de Bilhetes</span>
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsUtilitiesMenuOpen(false);
                  onOpenObsOverlay();
                  triggerButtonRef.current?.focus();
                }}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium text-[#FFFFFF] hover:bg-[#080D18] flex items-center gap-2.5 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
              >
                <Video className="w-4 h-4 text-[#FFFFFF] shrink-0" />
                <span>OBS Studio Overlay Transparente</span>
              </button>

              <div className="border-t border-[#A5B1C5]/15 my-1 pt-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsUtilitiesMenuOpen(false);
                    onSelectTab('tiktok');
                    triggerButtonRef.current?.focus();
                  }}
                  className="w-full min-h-[44px] px-3 py-2 rounded-lg text-xs font-medium text-[#FFFFFF] hover:bg-[#080D18] flex items-center justify-between gap-2 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Radio className="w-4 h-4 text-[#A6C957] shrink-0" />
                    <span className="truncate">TikTok LIVE</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-[#A5B1C5] shrink-0">
                    <span className={`w-2 h-2 rounded-full ${connMeta.dotClass}`} />
                    <span>{connMeta.label}</span>
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Primary Contextual Action: Novo Sorteio */}
        {onStartNewRaffle && (
          <button
            type="button"
            onClick={onStartNewRaffle}
            title="Novo Sorteio"
            aria-label="Novo Sorteio"
            className="gio-btn-primary min-w-[44px] min-h-[44px] px-2.5 md:px-3.5 py-2 text-xs font-semibold inline-flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
          >
            <Plus className="w-4 h-4 stroke-[2.5] shrink-0" />
            <span className="hidden md:inline">Novo Sorteio</span>
          </button>
        )}

        {/* User Account Trigger */}
        <button
          type="button"
          onClick={onOpenAccount}
          className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center p-0.5 rounded-xl text-[#FFFFFF] hover:ring-2 hover:ring-[#0131CD] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
          title={currentUser?.email || 'Minha Conta'}
          aria-label="Abrir perfil da conta"
        >
          <div className="w-8 h-8 rounded-xl bg-[#111B30] flex items-center justify-center text-xs font-semibold text-[#FFFFFF] border border-[#A5B1C5]/20 shadow-xs">
            {currentUser?.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Avatar"
                className="w-full h-full rounded-xl object-cover"
              />
            ) : (
              <User className="w-4 h-4 text-[#FFFFFF]" />
            )}
          </div>
        </button>
      </div>
    </header>
  );
};
