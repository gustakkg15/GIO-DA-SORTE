import React from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  LayoutDashboard,
  Ticket,
  Radio,
  Users,
  BarChart3,
  Crown,
  Scale,
  Settings,
  ChevronLeft,
  ChevronRight,
  User,
  X,
  Plus,
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

interface NavSection {
  title: string;
  items: {
    id: AppNavigationTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    isProBadge?: boolean;
  }[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'PRINCIPAL',
    items: [
      { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
    ],
  },
  {
    title: 'OPERAÇÃO',
    items: [
      { id: 'draw', label: 'Sorteios', icon: Ticket },
      { id: 'tiktok', label: 'TikTok LIVE PRO', icon: Radio, isProBadge: true },
      { id: 'search', label: 'Participantes', icon: Users },
    ],
  },
  {
    title: 'ANÁLISE',
    items: [
      { id: 'stats', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    title: 'CONTA',
    items: [
      { id: 'subscription', label: 'Assinatura', icon: Crown },
      { id: 'legal', label: 'Central Legal', icon: Scale },
      { id: 'settings', label: 'Configurações', icon: Settings },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  isProPlan = true,
  currentUser,
  onOpenAccount,
  onStartNewRaffle,
}) => {
  const normalizedActiveTab =
    activeTab === 'help' || activeTab === 'support' ? 'legal' : activeTab;

  const handleItemClick = (id: AppNavigationTab) => {
    onSelectTab(id);
    onCloseMobile();
  };

  const renderNavContent = () => (
    <div className="flex flex-col h-full select-none">
      {/* Brand & Logo Header */}
      <div
        className={`h-16 flex items-center border-b border-[#162822] shrink-0 transition-all ${
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        }`}
      >
        <button
          type="button"
          onClick={() => handleItemClick('dashboard')}
          className="flex items-center gap-3 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B48A51] rounded-lg"
          title="GIO DA SORTE PRO — Ir para o Painel"
        >
          <div className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg bg-[#162822] border border-[#2D4A3E]">
            <img
              src="/logo.png"
              alt="Logo GIO DA SORTE"
              referrerPolicy="no-referrer"
              className="w-7 h-7 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>

          {!collapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-editorial font-bold text-base tracking-tight text-[#FAF8F3] group-hover:text-[#C9A167] transition-colors truncate">
                  GIO DA SORTE
                </span>
                <span className="text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-[#B48A51]/20 text-[#C9A167] border border-[#B48A51]/40">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-[#8EA397] truncate">
                Gestão & Sorteios LIVE
              </p>
            </div>
          )}
        </button>

        {/* Mobile close button */}
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-lg text-[#8EA397] hover:text-[#FAF8F3] hover:bg-[#162822] transition-colors"
          aria-label="Fechar menu lateral"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Action Button (when expanded) */}
      {!collapsed && onStartNewRaffle && (
        <div className="px-3 pt-3 pb-1">
          <button
            type="button"
            onClick={onStartNewRaffle}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#486D56] hover:bg-[#5B846B] text-white text-xs font-semibold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#486D56]"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Sorteio</span>
          </button>
        </div>
      )}

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 no-scrollbar">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            {!collapsed ? (
              <div className="px-2.5 py-1 text-[10px] font-bold tracking-wider text-[#6F887C] uppercase">
                {section.title}
              </div>
            ) : (
              <div className="h-px bg-[#162822] my-2 mx-1" />
            )}

            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = normalizedActiveTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-all group relative ${
                    isActive
                      ? 'bg-[#486D56] text-white shadow-sm font-semibold'
                      : 'text-[#B0C2B7] hover:text-[#FAF8F3] hover:bg-[#162822]/80'
                  } ${collapsed ? 'justify-center' : 'justify-start'}`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive
                        ? 'text-white'
                        : 'text-[#8EA397] group-hover:text-[#FAF8F3]'
                    }`}
                  />

                  {!collapsed && (
                    <span className="truncate flex-1 text-left">{item.label}</span>
                  )}

                  {!collapsed && item.isProBadge && (
                    <span className="text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-[#B48A51]/25 text-[#C9A167] border border-[#B48A51]/30">
                      PRO
                    </span>
                  )}

                  {/* Active Indicator Bar on collapsed view */}
                  {collapsed && isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-[#C9A167]" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* User Account / Footer Area */}
      <div className="p-2 border-t border-[#162822] shrink-0 bg-[#1A3029]/40 space-y-2">
        <button
          type="button"
          onClick={onOpenAccount}
          title={
            currentUser?.displayName || currentUser?.email || 'Minha Conta'
          }
          className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-colors hover:bg-[#162822] text-[#B0C2B7] hover:text-[#FAF8F3] ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-[#203A32] border border-[#486D56] flex items-center justify-center shrink-0 text-[#FAF8F3] font-bold text-xs">
            {currentUser?.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Avatar"
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <User className="w-4 h-4 text-[#8EA397]" />
            )}
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[#FAF8F3] truncate">
                {currentUser?.displayName ||
                  (currentUser?.email ? currentUser.email.split('@')[0] : 'Minha Conta')}
              </div>
              <div className="text-[10px] text-[#8EA397] truncate">
                {currentUser ? 'Conectado via Firebase' : 'Entrar / Cadastrar'}
              </div>
            </div>
          )}
        </button>

        {/* Desktop Collapse Toggle */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="hidden lg:flex w-full items-center justify-center gap-2 py-1.5 px-2 rounded text-[11px] text-[#6F887C] hover:text-[#FAF8F3] hover:bg-[#162822] transition-colors"
          title={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Recolher</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed top-0 bottom-0 left-0 z-30 bg-[#203A32] border-r border-[#162822] transition-all duration-200 ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer (Responsive) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#162822]/70 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />

          {/* Drawer content */}
          <aside className="relative w-[280px] max-w-[85vw] h-full bg-[#203A32] shadow-2xl flex flex-col z-10 animate-fade-in">
            {renderNavContent()}
          </aside>
        </div>
      )}
    </>
  );
};
