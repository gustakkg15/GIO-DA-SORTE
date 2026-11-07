import React from 'react';
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
    label: 'Configurações',
    description: 'Regras, backup e suporte',
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
        className={`w-full flex items-center gap-3 rounded-xl transition-all duration-150 group relative ${
          isCompact ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
        } ${
          isActive
            ? 'bg-[#101F3D] text-white border border-white/10 shadow-xs'
            : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
        }`}
      >
        {isActive && (
          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-[#0866F5]" />
        )}

        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
            isActive
              ? isProItem
                ? 'bg-[#8B7CFF]/20 text-[#C4B5FD]'
                : 'bg-[#0866F5]/20 text-[#00A9FF]'
              : isProItem
              ? 'bg-[#101F3D] text-[#C4B5FD] group-hover:text-[#8B7CFF]'
              : 'bg-[#101F3D]/80 text-slate-400 group-hover:text-white'
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
                    isActive ? 'font-semibold text-white' : 'font-medium'
                  }`}
                >
                  {item.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate leading-tight mt-0.5">
                {item.description}
              </p>
            </div>

            {item.isProBadge && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-[#8B7CFF]/15 text-[#C4B5FD] border border-[#8B7CFF]/40 shrink-0">
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
      <div className="flex flex-col h-full select-none bg-[#0B1730] text-[#F8FAFC]">
        {/* Brand Header (Height 70px aligned with AppHeader) */}
        <div
          className={`h-[70px] flex items-center border-b border-white/[0.08] bg-[#050D20]/60 shrink-0 transition-all ${
            isCompact ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <button
            type="button"
            onClick={() => handleItemClick('dashboard')}
            className="flex items-center gap-3 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF] rounded-xl min-w-0"
            title="GIO DA SORTE — Ir para o Painel"
          >
            {/* Clean Official Emblem */}
            <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-gradient-to-br from-[#0866F5] to-[#0B1730] p-0.5 border border-[#00A9FF]/40 shadow-xs">
              <div className="w-full h-full rounded-[10px] bg-[#0B1730] flex items-center justify-center relative">
                <Ticket className="w-4 h-4 text-[#00A9FF] transform -rotate-12 group-hover:rotate-0 transition-transform" />
                <Sparkles className="w-2.5 h-2.5 text-[#20C997] absolute top-1 right-1" />
              </div>
            </div>

            {!isCompact && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm tracking-tight text-white group-hover:text-[#00A9FF] transition-colors truncate">
                    GIO DA SORTE
                  </span>
                  <span
                    className={`text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md ${
                      isProPlan
                        ? 'bg-[#8B7CFF]/15 text-[#C4B5FD] border border-[#8B7CFF]/40'
                        : 'bg-[#0866F5]/15 text-[#35B9F5] border border-[#00A9FF]/30'
                    }`}
                  >
                    {isProPlan ? 'PRO' : 'FREE'}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-slate-400 truncate">
                  Plataforma Oficial de Sorteios
                </p>
              </div>
            )}
          </button>

          {isDrawer && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-[#101F3D] border border-transparent hover:border-white/10 transition-colors"
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
              <div className="px-2.5 pb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Operação Principal
              </div>
            )}
            {OPERATION_NAV_ITEMS.map((item) => renderNavButton(item, isCompact))}
          </div>

          <div className="space-y-1 pt-3 border-t border-white/[0.08]">
            {!isCompact && (
              <div className="px-2.5 pb-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Análise & Conta
              </div>
            )}
            {MANAGEMENT_NAV_ITEMS.map((item) => renderNavButton(item, isCompact))}
          </div>
        </nav>

        {/* Sidebar Footer: Plan Status + Account + Collapse Button */}
        <div className="p-3 border-t border-white/[0.08] shrink-0 bg-[#050D20]/50 space-y-2">
          {!isCompact && (
            <button
              type="button"
              onClick={() => handleItemClick('subscription')}
              className={`w-full p-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all text-left ${
                isProPlan
                  ? 'bg-[#101F3D] border-[#8B7CFF]/40 hover:border-[#8B7CFF]'
                  : 'bg-[#101F3D] border-white/10 hover:border-[#00A9FF]/40'
              }`}
              title="Verificar situação da assinatura"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isProPlan ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#20C997]" />
                ) : (
                  <Crown className="w-4 h-4 shrink-0 text-[#8B7CFF]" />
                )}
                <div className="min-w-0">
                  <span className="block text-xs font-bold text-white truncate">
                    {isProPlan ? 'Assinatura PRO Ativa' : 'Plano Gratuito (FREE)'}
                  </span>
                  <span className="block text-[10px] text-slate-400 truncate">
                    {isProPlan ? 'Recursos exclusivos liberados' : 'Ver vantagens do PRO'}
                  </span>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                  isProPlan
                    ? 'bg-[#8B7CFF]/20 text-[#C4B5FD] border border-[#8B7CFF]/40'
                    : 'bg-[#0866F5]/20 text-[#35B9F5] border border-[#00A9FF]/30'
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
            className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all bg-[#101F3D]/80 hover:bg-[#101F3D] border border-white/10 text-slate-400 hover:text-white ${
              isCompact ? 'justify-center' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-[#0B1730] border border-white/10 flex items-center justify-center shrink-0 text-white font-semibold text-xs">
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="Avatar"
                  className="w-full h-full rounded-lg object-cover"
                />
              ) : (
                <User className="w-4 h-4 text-[#00A9FF]" />
              )}
            </div>

            {!isCompact && (
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">
                  {currentUser?.displayName ||
                    (currentUser?.email ? currentUser.email.split('@')[0] : 'Minha Conta')}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {currentUser ? 'Nuvem sincronizada' : 'Entrar ou cadastrar'}
                </div>
              </div>
            )}
          </button>

          {!isDrawer && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="hidden lg:flex w-full items-center justify-center gap-2 py-1.5 px-2.5 rounded-xl text-[11px] font-medium text-slate-400 hover:text-white hover:bg-[#101F3D] transition-colors"
              title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
              aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4 text-[#00A9FF]" />
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4 text-[#00A9FF]" />
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
        className={`hidden lg:flex flex-col fixed top-0 bottom-0 left-0 z-30 bg-[#0B1730] border-r border-white/[0.08] shadow-xl transition-all duration-200 ${
          collapsed ? 'w-[76px]' : 'w-[260px]'
        }`}
      >
        {renderNavContent(false)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#050D20]/80 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          <aside className="relative w-[280px] max-w-[85vw] h-full bg-[#0B1730] border-r border-white/[0.08] shadow-2xl flex flex-col z-10 animate-fade-in">
            {renderNavContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
