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
  icon: React.FC<{ className?: string }>;
  isProBadge?: boolean;
}

const PRIMARY_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
  { id: 'draw', label: 'Sorteios', icon: Ticket },
  { id: 'tiktok', label: 'TikTok LIVE', icon: Radio, isProBadge: true },
  { id: 'search', label: 'Participantes', icon: Users },
  { id: 'stats', label: 'Relatórios', icon: BarChart3 },
  { id: 'subscription', label: 'Assinatura', icon: Crown },
  { id: 'settings', label: 'Configurações', icon: Settings },
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

  const renderNavContent = (isDrawer: boolean) => {
    const isCompact = isDrawer ? false : collapsed;

    return (
      <div className="flex flex-col h-full select-none bg-gradient-to-b from-[#0B1730] to-[#050D20] text-[#F8FAFC]">
        {/* Identidade e Logo Oficial (Altura 72px alinhada à Topbar) */}
        <div
          className={`h-[72px] flex items-center border-b border-[var(--gio-border-subtle)] shrink-0 transition-all ${
            isCompact ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <button
            type="button"
            onClick={() => handleItemClick('dashboard')}
            className="flex items-center gap-3 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF] rounded-xl min-w-0"
            title="GIO DA SORTE PRO — Ir para o Painel"
          >
            <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-[#101F3D] border border-[var(--gio-border-subtle)] group-hover:border-[#00A9FF]/50 shadow-[0_4px_14px_rgba(2,8,23,0.45)] transition-colors">
              <img
                src="/logo.png"
                alt="Logo GIO DA SORTE PRO"
                referrerPolicy="no-referrer"
                className="w-7 h-7 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>

            {!isCompact && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm tracking-tight text-[#F8FAFC] group-hover:text-[#00A9FF] transition-colors truncate">
                    GIO DA SORTE
                  </span>
                  <span className="text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-[#F5B942]/15 text-[#F5B942] border border-[#F5B942]/35">
                    PRO
                  </span>
                </div>
                <p className="text-[11px] font-medium text-[#94A3B8] truncate">
                  Sorteios & TikTok LIVE
                </p>
              </div>
            )}
          </button>

          {isDrawer && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden p-2 rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#101F3D] border border-transparent hover:border-[var(--gio-border-subtle)] transition-colors"
              aria-label="Fechar menu lateral"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Lista Principal de Módulos (7 Áreas) */}
        <nav
          aria-label="Navegação principal"
          className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 no-scrollbar"
        >
          {!isCompact && (
            <div className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-[#64748B]">
              Módulos da Plataforma
            </div>
          )}

          {PRIMARY_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = normalizedActiveTab === item.id;
            const isLiveItem = item.id === 'tiktok';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item.id)}
                title={isCompact ? item.label : undefined}
                className={`w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group relative ${
                  isActive
                    ? 'bg-gradient-to-r from-[#0866F5]/25 via-[#00A9FF]/12 to-[#101F3D]/90 text-[#F8FAFC] font-semibold border border-[#00A9FF]/45 shadow-[0_6px_20px_rgba(8,102,245,0.2)]'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#101F3D]/80 border border-transparent'
                } ${isCompact ? 'justify-center px-0' : 'justify-start'}`}
              >
                {isActive && (
                  <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-gradient-to-b from-[#00A9FF] to-[#0866F5] shadow-[0_0_10px_rgba(0,169,255,0.75)]" />
                )}

                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive
                      ? 'text-[#00A9FF]'
                      : isLiveItem
                      ? 'text-[#35B9F5] group-hover:text-[#00A9FF]'
                      : 'text-[#94A3B8] group-hover:text-[#F8FAFC]'
                  }`}
                />

                {!isCompact && (
                  <span className="truncate flex-1 text-left text-[13px] leading-snug">
                    {item.label}
                  </span>
                )}

                {!isCompact && item.isProBadge && (
                  <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-[#F5B942]/15 text-[#F5B942] border border-[#F5B942]/35">
                    PRO
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Rodapé da Sidebar: Status do Plano + Conta do Usuário + Botão Recolher */}
        <div className="p-3 border-t border-[var(--gio-border-subtle)] shrink-0 bg-[#0B1730]/90 space-y-2">
          {!isCompact && (
            <button
              type="button"
              onClick={() => handleItemClick('subscription')}
              className="w-full px-3 py-2 rounded-xl bg-[#101F3D] hover:bg-[#182943] border border-[var(--gio-border-subtle)] hover:border-[var(--gio-border-active)] flex items-center justify-between gap-2 transition-all text-left"
              title="Verificar situação da assinatura"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Crown
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isProPlan ? 'text-[#F5B942]' : 'text-[#35B9F5]'
                  }`}
                />
                <span className="text-[11px] font-semibold text-[#F8FAFC] truncate">
                  {isProPlan ? 'Licença GIO PRO' : 'Plano Gratuito'}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                  isProPlan
                    ? 'bg-[#F5B942]/15 text-[#F5B942] border border-[#F5B942]/35'
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
            title={
              currentUser?.displayName || currentUser?.email || 'Minha Conta'
            }
            className={`w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-all bg-[#101F3D]/60 hover:bg-[#182943] border border-transparent hover:border-[var(--gio-border-subtle)] text-[#94A3B8] hover:text-[#F8FAFC] ${
              isCompact ? 'justify-center' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-[#182943] border border-[var(--gio-border-subtle)] flex items-center justify-center shrink-0 text-[#F8FAFC] font-semibold text-xs">
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

            {!isCompact && (
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-[#F8FAFC] truncate">
                  {currentUser?.displayName ||
                    (currentUser?.email
                      ? currentUser.email.split('@')[0]
                      : 'Minha Conta')}
                </div>
                <div className="text-[11px] text-[#94A3B8] truncate">
                  {currentUser ? 'Conta sincronizada' : 'Entrar ou cadastrar'}
                </div>
              </div>
            )}
          </button>

          {!isDrawer && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="hidden lg:flex w-full items-center justify-center gap-2 py-1.5 px-2.5 rounded-xl text-[11px] font-medium text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#101F3D] transition-colors"
              title={
                collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'
              }
              aria-label={
                collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'
              }
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
      {/* Sidebar Fixa no Desktop (260px expandida / 76px recolhida) */}
      <aside
        className={`hidden lg:flex flex-col fixed top-0 bottom-0 left-0 z-30 bg-[#0B1730] border-r border-[var(--gio-border-subtle)] shadow-[4px_0_24px_rgba(2,8,23,0.4)] transition-all duration-200 ${
          collapsed ? 'w-[76px]' : 'w-[260px]'
        }`}
      >
        {renderNavContent(false)}
      </aside>

      {/* Gaveta Responsiva Mobile/Tablet (sempre com rótulos completos) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#050D20]/80 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          <aside className="relative w-[280px] max-w-[85vw] h-full bg-[#0B1730] border-r border-[var(--gio-border-subtle)] shadow-2xl flex flex-col z-10 animate-fade-in">
            {renderNavContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
