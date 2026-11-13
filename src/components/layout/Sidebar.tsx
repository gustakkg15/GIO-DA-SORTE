import React, { useEffect, useRef } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  LayoutDashboard,
  Ticket,
  Radio,
  Users,
  BarChart3,
  Crown,
  Settings,
  ChevronLeft,
  ChevronRight,
  User,
  X,
  Sparkles,
  Lock,
  CheckCircle2,
} from 'lucide-react';
import { AppNavigationTab } from '../Header';

export interface SidebarProps {
  activeTab: AppNavigationTab;
  onSelectTab: (tab: AppNavigationTab) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isProPlan?: boolean;
  currentUser: FirebaseUser | null;
  onOpenAccount: () => void;
  onStartNewRaffle?: () => void;
}

interface NavItem {
  id: AppNavigationTab;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  isProBadge?: boolean;
}

const OPERATION_NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Painel',
    description: 'Visão geral e indicadores',
    icon: LayoutDashboard,
  },
  {
    id: 'draw',
    label: 'Sorteios',
    description: 'Mesa oficial e modalidades',
    icon: Ticket,
  },
  {
    id: 'tiktok',
    label: 'TikTok LIVE',
    description: 'Presentes, moedas e comentários',
    icon: Radio,
    isProBadge: true,
  },
  {
    id: 'search',
    label: 'Participantes',
    description: 'Lista, cotas e consulta',
    icon: Users,
  },
];

const MANAGEMENT_NAV_ITEMS: NavItem[] = [
  {
    id: 'stats',
    label: 'Relatórios',
    description: 'Probabilidades e auditoria',
    icon: BarChart3,
  },
  {
    id: 'subscription',
    label: 'Assinatura',
    description: 'Plano FREE e recursos PRO',
    icon: Crown,
    isProBadge: true,
  },
  {
    id: 'settings',
    label: 'Perfil e Ajustes',
    description: 'Meu perfil, segurança e dados',
    icon: Settings,
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  isProPlan = false,
  currentUser,
  onOpenAccount,
}) => {
  const drawerRef = useRef<HTMLElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!mobileOpen) return;

    if (document.activeElement instanceof HTMLElement) {
      previouslyFocusedElementRef.current = document.activeElement;
    }

    const frameId = requestAnimationFrame(() => {
      if (drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length > 0) {
          focusables[0].focus();
        }
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseMobile();
        return;
      }

      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === 'function') {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [mobileOpen, onCloseMobile]);

  const normalizedActiveTab: AppNavigationTab =
    activeTab === 'legal' || activeTab === 'help' || activeTab === 'support'
      ? 'settings'
      : activeTab;

  const handleItemClick = (id: AppNavigationTab) => {
    onSelectTab(id);
    onCloseMobile();
  };

  const renderNavButton = (item: NavItem, isCompact: boolean) => {
    const Icon = item.icon;
    const isActive = normalizedActiveTab === item.id;
    const isProItem = Boolean(item.isProBadge);

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleItemClick(item.id)}
        title={isCompact ? `${item.label} — ${item.description}` : undefined}
        className={`w-full flex items-center gap-3 rounded-xl transition-all duration-150 group relative btn-tactile focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957] ${
          isCompact ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
        } ${
          isActive
            ? 'bg-[#0131CD]/20 text-[#FFFFFF] border border-[#0131CD]/55 shadow-[0_2px_12px_rgba(1,49,205,0.25)]'
            : 'text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-white/[0.04] border border-transparent'
        }`}
      >
        {/* Active Indicator */}
        {isActive && (
          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#A6C957]" />
        )}

        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
            isActive
              ? isProItem
                ? 'bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/30'
                : 'bg-[#0131CD] text-[#FFFFFF] shadow-xs'
              : isProItem
              ? 'bg-[#111B30] text-[#A5B1C5] group-hover:text-[#A6C957]'
              : 'bg-[#111B30] text-[#A5B1C5] group-hover:text-[#FFFFFF]'
          }`}
        >
          <Icon className="w-4 h-4" />
        </div>

        {!isCompact && (
          <div className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-sm truncate ${
                    isActive ? 'font-semibold text-[#FFFFFF]' : 'font-medium'
                  }`}
                >
                  {item.label}
                </span>
              </div>
              <p className="text-[11px] text-[#A5B1C5] truncate leading-tight mt-0.5">
                {item.description}
              </p>
            </div>

            {item.isProBadge && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded-md bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35 shrink-0">
                {!isProPlan && item.id === 'tiktok' && <Lock className="w-2.5 h-2.5" />}
                PRO
              </span>
            )}
          </div>
        )}
      </button>
    );
  };

  const renderNavContent = (isDrawer: boolean) => {
    const isCompact = isDrawer ? false : collapsed;

    return (
      <div className="flex flex-col h-full select-none bg-[#080D18] text-[#FFFFFF]">
        {/* Brand Header (Height 70px aligned with AppHeader) */}
        <div
          className={`h-[70px] flex items-center border-b border-[#A5B1C5]/15 bg-[#080D18]/90 shrink-0 transition-all ${
            isCompact ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <button
            type="button"
            onClick={() => handleItemClick('dashboard')}
            className="flex items-center gap-3 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957] rounded-xl min-w-0 btn-tactile"
            title="GIO DA SORTE — Ir para o Painel"
          >
            {/* Clean Official Emblem with Royal Blue */}
            <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-[#0131CD] p-0.5 border border-[#0131CD]/50 shadow-xs">
              <div className="w-full h-full rounded-[10px] bg-[#111B30] flex items-center justify-center relative">
                <Ticket className="w-4 h-4 text-[#FFFFFF] transform -rotate-12 group-hover:rotate-0 transition-transform" />
                <Sparkles className="w-2.5 h-2.5 text-[#A6C957] absolute top-1 right-1" />
              </div>
            </div>

            {!isCompact && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm tracking-tight text-[#FFFFFF] group-hover:text-[#A6C957] transition-colors truncate">
                    GIO DA SORTE
                  </span>
                  <span
                    className={`text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded-md ${
                      isProPlan
                        ? 'bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35'
                        : 'bg-[#0131CD]/20 text-[#FFFFFF] border border-[#0131CD]/40'
                    }`}
                  >
                    {isProPlan ? 'PRO' : 'FREE'}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-[#A5B1C5] truncate">
                  Plataforma Oficial de Sorteios
                </p>
              </div>
            )}
          </button>

          {isDrawer && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden min-w-[44px] min-h-[44px] p-2.5 rounded-xl text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#111B30] border border-transparent hover:border-[#A5B1C5]/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957] inline-flex items-center justify-center"
              aria-label="Fechar menu lateral"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Modules Grouped by Function */}
        <nav
          aria-label="Navegação principal"
          className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5 custom-scrollbar"
        >
          <div className="space-y-1">
            {!isCompact && (
              <div className="px-2.5 pb-1 text-[11px] font-semibold text-[#A5B1C5]">
                Operação Principal
              </div>
            )}
            {OPERATION_NAV_ITEMS.map((item) => renderNavButton(item, isCompact))}
          </div>

          <div className="space-y-1 pt-3 border-t border-[#A5B1C5]/15">
            {!isCompact && (
              <div className="px-2.5 pb-1 text-[11px] font-semibold text-[#A5B1C5]">
                Análise & Conta
              </div>
            )}
            {MANAGEMENT_NAV_ITEMS.map((item) => renderNavButton(item, isCompact))}
          </div>
        </nav>

        {/* Sidebar Footer: Plan Status + Account + Collapse Button */}
        <div className="p-3 border-t border-[#A5B1C5]/15 shrink-0 bg-[#080D18]/80 space-y-2">
          {!isCompact && (
            <button
              type="button"
              onClick={() => handleItemClick('subscription')}
              className={`w-full p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all text-left ${
                isProPlan
                  ? 'bg-[#111B30] border-[#A6C957]/35 hover:border-[#A6C957]'
                  : 'bg-[#111B30] border-[#A5B1C5]/15 hover:border-[#0131CD]/60'
              }`}
              title="Verificar situação da assinatura"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isProPlan ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#A6C957]" />
                ) : (
                  <Crown className="w-4 h-4 shrink-0 text-[#A6C957]" />
                )}
                <div className="min-w-0">
                  <span className="block text-xs font-bold text-[#FFFFFF] truncate">
                    {isProPlan ? 'Assinatura PRO Ativa' : 'Plano Gratuito (FREE)'}
                  </span>
                  <span className="block text-[11px] text-[#A5B1C5] truncate">
                    {isProPlan ? 'Recursos exclusivos liberados' : 'Ver vantagens do PRO'}
                  </span>
                </div>
              </div>
              <span
                className={`text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                  isProPlan
                    ? 'bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35'
                    : 'bg-[#0131CD]/20 text-[#FFFFFF] border border-[#0131CD]/45'
                }`}
              >
                {isProPlan ? 'PRO' : 'FREE'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenAccount}
            title={currentUser?.displayName || currentUser?.email || 'Minha Conta'}
            className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all bg-[#111B30] hover:border-[#0131CD] border border-[#A5B1C5]/15 text-[#A5B1C5] hover:text-[#FFFFFF] ${
              isCompact ? 'justify-center' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-[#080D18] border border-[#A5B1C5]/20 flex items-center justify-center shrink-0 text-[#FFFFFF] font-semibold text-xs">
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="Avatar"
                  className="w-full h-full rounded-lg object-cover"
                />
              ) : (
                <User className="w-4 h-4 text-[#FFFFFF]" />
              )}
            </div>

            {!isCompact && (
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-[#FFFFFF] truncate">
                  {currentUser?.displayName ||
                    (currentUser?.email ? currentUser.email.split('@')[0] : 'Minha Conta')}
                </div>
                <div className="text-[11px] text-[#A5B1C5] truncate">
                  {currentUser ? 'Nuvem sincronizada' : 'Entrar ou cadastrar'}
                </div>
              </div>
            )}
          </button>

          {!isDrawer && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="hidden lg:flex w-full items-center justify-center gap-2 py-1.5 px-2.5 rounded-xl text-[11px] font-medium text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#111B30] transition-colors"
              title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
              aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4 text-[#A5B1C5]" />
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4 text-[#A5B1C5]" />
                  <span>Recolher menu</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <aside
        className={`hidden lg:flex flex-col fixed top-0 bottom-0 left-0 z-30 bg-[#080D18] border-r border-[#A5B1C5]/15 shadow-xl transition-all duration-200 ${
          collapsed ? 'w-[76px]' : 'w-[260px]'
        }`}
      >
        {renderNavContent(false)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#080D18]/80 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          <aside
            ref={drawerRef}
            id="mobile-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação lateral móvel"
            tabIndex={-1}
            className="relative w-[280px] max-w-[85vw] h-full bg-[#080D18] border-r border-[#A5B1C5]/15 shadow-2xl flex flex-col z-10 animate-fade-in focus:outline-none"
          >
            {renderNavContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
