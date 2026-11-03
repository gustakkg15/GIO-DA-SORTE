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
      <div className="flex flex-col h-full select-none bg-[#171D1C] text-[#EAE7DE]">
        {/* Identidade e Logo Original */}
        <div
          className={`h-16 flex items-center border-b border-[#313D39] shrink-0 transition-all ${
            isCompact ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <button
            type="button"
            onClick={() => handleItemClick('dashboard')}
            className="flex items-center gap-3 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6EAA90] rounded-lg"
            title="GIO DA SORTE PRO — Ir para o Painel"
          >
            <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg bg-[#222B28] border border-[#313D39]">
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
                  <span className="font-semibold text-sm tracking-tight text-[#EAE7DE] group-hover:text-[#6EAA90] transition-colors truncate">
                    GIO DA SORTE
                  </span>
                  <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#C6A56A]/15 text-[#C6A56A] border border-[#C6A56A]/35">
                    PRO
                  </span>
                </div>
                <p className="text-[11px] text-[#9BA8A3] truncate">
                  Sorteios & TikTok LIVE
                </p>
              </div>
            )}
          </button>

          {isDrawer && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-lg text-[#9BA8A3] hover:text-[#EAE7DE] hover:bg-[#222B28] transition-colors"
              aria-label="Fechar menu lateral"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Lista Principal Simplificada (7 Áreas) */}
        <nav
          aria-label="Navegação principal"
          className="flex-1 overflow-y-auto px-2.5 py-4 space-y-1 no-scrollbar"
        >
          {PRIMARY_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = normalizedActiveTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item.id)}
                title={isCompact ? item.label : undefined}
                className={`w-full min-h-[42px] flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all group relative ${
                  isActive
                    ? 'bg-[#222B28] text-[#EAE7DE] font-semibold border border-[#6EAA90]/45'
                    : 'text-[#9BA8A3] hover:text-[#EAE7DE] hover:bg-[#222B28]/60 border border-transparent'
                } ${isCompact ? 'justify-center px-0' : 'justify-start'}`}
              >
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-[#6EAA90]" />
                )}

                <Icon
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isActive
                      ? 'text-[#6EAA90]'
                      : 'text-[#9BA8A3] group-hover:text-[#EAE7DE]'
                  }`}
                />

                {!isCompact && (
                  <span className="truncate flex-1 text-left">{item.label}</span>
                )}

                {!isCompact && item.isProBadge && (
                  <span className="text-[10px] font-semibold tracking-wider px-1.5 py-0.5 rounded bg-[#C6A56A]/15 text-[#C6A56A] border border-[#C6A56A]/30">
                    PRO
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Rodapé da Sidebar: Conta do Usuário + Botão Recolher */}
        <div className="p-2.5 border-t border-[#313D39] shrink-0 bg-[#171D1C] space-y-1.5">
          <button
            type="button"
            onClick={onOpenAccount}
            title={
              currentUser?.displayName || currentUser?.email || 'Minha Conta'
            }
            className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors hover:bg-[#222B28] text-[#9BA8A3] hover:text-[#EAE7DE] ${
              isCompact ? 'justify-center' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-full bg-[#222B28] border border-[#313D39] flex items-center justify-center shrink-0 text-[#EAE7DE] font-semibold text-xs">
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

            {!isCompact && (
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-[#EAE7DE] truncate">
                  {currentUser?.displayName ||
                    (currentUser?.email
                      ? currentUser.email.split('@')[0]
                      : 'Minha Conta')}
                </div>
                <div className="text-[11px] text-[#9BA8A3] truncate">
                  {currentUser ? 'Conta sincronizada' : 'Entrar ou cadastrar'}
                </div>
              </div>
            )}
          </button>

          {!isDrawer && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className="hidden lg:flex w-full items-center justify-center gap-2 py-1.5 px-2 rounded-lg text-[11px] text-[#9BA8A3] hover:text-[#EAE7DE] hover:bg-[#222B28] transition-colors"
              title={
                collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'
              }
              aria-label={
                collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'
              }
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4" />
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
      {/* Sidebar Fixa no Desktop (240px expandida / 72px recolhida) */}
      <aside
        className={`hidden lg:flex flex-col fixed top-0 bottom-0 left-0 z-30 bg-[#171D1C] border-r border-[#313D39] transition-all duration-200 ${
          collapsed ? 'w-[72px]' : 'w-[240px]'
        }`}
      >
        {renderNavContent(false)}
      </aside>

      {/* Gaveta Responsiva Mobile/Tablet (sempre com rótulos completos) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          <aside className="relative w-[272px] max-w-[85vw] h-full bg-[#171D1C] border-r border-[#313D39] shadow-2xl flex flex-col z-10 animate-fade-in">
            {renderNavContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
