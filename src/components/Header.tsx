import React, { useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  LayoutDashboard,
  Ticket,
  Radio,
  Users,
  BarChart3,
  Crown,
  Settings,
  Tv,
  Volume2,
  VolumeX,
  Printer,
  Video,
  User,
  Menu,
  X,
  Plus,
  Compass,
  Scale,
} from 'lucide-react';

export type AppNavigationTab =
  | 'dashboard'
  | 'draw'
  | 'tiktok'
  | 'search'
  | 'stats'
  | 'subscription'
  | 'legal'
  | 'settings'
  | 'help'
  | 'support';

interface HeaderProps {
  activeTab: AppNavigationTab;
  onSelectTab: (tab: AppNavigationTab) => void;
  onStartNewRaffle?: () => void;
  onOpenOnboarding?: () => void;
  isProPlan?: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenPresentation: () => void;
  onOpenPrintSheet: () => void;
  onOpenObsOverlay: () => void;
  currentUser: FirebaseUser | null;
  onOpenAccount: () => void;
  totalParticipants: number;
  themeMode?: 'default' | 'neon';
  onToggleTheme?: () => void;
}

const PRIMARY_NAV_ITEMS: {
  id: AppNavigationTab;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
  isProHighlight?: boolean;
}[] = [
  { id: 'dashboard', label: 'Painel', shortLabel: 'Painel', icon: LayoutDashboard },
  { id: 'draw', label: 'Sorteios', shortLabel: 'Sorteios', icon: Ticket },
  { id: 'tiktok', label: 'TikTok LIVE PRO', shortLabel: 'LIVE PRO', icon: Radio, isProHighlight: true },
  { id: 'search', label: 'Participantes', shortLabel: 'Pessoas', icon: Users },
  { id: 'stats', label: 'Relatórios', shortLabel: 'Relatórios', icon: BarChart3 },
  { id: 'subscription', label: 'Assinatura', shortLabel: 'Planos', icon: Crown },
  { id: 'legal', label: 'Central Legal', shortLabel: 'Legal', icon: Scale },
  { id: 'settings', label: 'Configurações', shortLabel: 'Ajustes', icon: Settings },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onStartNewRaffle,
  onOpenOnboarding,
  isProPlan = true,
  soundEnabled,
  onToggleSound,
  onOpenPresentation,
  onOpenPrintSheet,
  onOpenObsOverlay,
  currentUser,
  onOpenAccount,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const normalizedActiveTab: AppNavigationTab =
    activeTab === 'help' || activeTab === 'support' ? 'legal' : activeTab;

  const handleTabClick = (tab: AppNavigationTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#080D18]/95 backdrop-blur-xl border-b border-[#A5B1C5]/15 shadow-lg">
        <div className="max-w-[1720px] mx-auto w-full px-3 sm:px-5 lg:px-6 2xl:px-8">
          <div className="flex items-center justify-between gap-2 lg:gap-3 h-16">
            {/* Brand Wordmark & Official Logo */}
            <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
              <button
                type="button"
                onClick={() => handleTabClick('dashboard')}
                className="text-left flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080D18] rounded-lg group"
              >
                <img
                  src="/logo.png"
                  alt="Logotipo Oficial GIO DA SORTE"
                  referrerPolicy="no-referrer"
                  className="h-8 w-auto object-contain rounded-lg border border-[#0131CD]/45 shadow-sm shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <span className="text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded bg-[#A6C957]/15 text-[#A6C957] border border-[#A6C957]/35">
                  PRO
                </span>
              </button>
            </div>

            {/* Desktop Navigation Links — 7 Logical SaaS Pillars */}
            <nav
              className="hidden xl:flex items-center gap-1 bg-[#111B30] p-1 rounded-xl border border-[#A5B1C5]/15 text-xs font-semibold text-[#A5B1C5] min-w-0"
              aria-label="Navegação principal"
            >
              {PRIMARY_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = normalizedActiveTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleTabClick(item.id)}
                    className={`px-3 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080D18] ${
                      isActive
                        ? 'bg-[#0131CD] text-[#FFFFFF] shadow-sm font-semibold'
                        : 'hover:text-[#FFFFFF] hover:bg-[#080D18]/60 text-[#A5B1C5]'
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 ${
                        item.isProHighlight
                          ? 'text-[#A6C957]'
                          : isActive
                          ? 'text-[#FFFFFF]'
                          : 'text-[#A5B1C5]'
                      }`}
                    />
                    <span>{item.label}</span>
                    {item.id === 'subscription' && (
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          isProPlan
                            ? 'bg-[#A6C957]/15 text-[#A6C957]'
                            : 'bg-[#080D18] text-[#A5B1C5]'
                        }`}
                      >
                        {isProPlan ? 'PRO' : 'FREE'}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Quick Action Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* + Criar Novo Sorteio Quick CTA */}
              {onStartNewRaffle && (
                <button
                  type="button"
                  onClick={onStartNewRaffle}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-[#FFFFFF] bg-[#0131CD] hover:brightness-110 active:scale-95 rounded-xl shadow-md border border-[#FFFFFF]/15 transition whitespace-nowrap min-h-[38px]"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Novo Sorteio</span>
                </button>
              )}

              {/* Utility Dock (Sound, Print, OBS, Guide) */}
              <div className="flex items-center bg-[#111B30] border border-[#A5B1C5]/15 rounded-xl p-1 gap-0.5">
                {onOpenOnboarding && (
                  <button
                    type="button"
                    onClick={onOpenOnboarding}
                    title="Abrir guia rápido de como usar"
                    aria-label="Abrir guia rápido de como usar"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] transition-colors"
                  >
                    <Compass className="w-4 h-4 text-[#A6C957]" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={onToggleSound}
                  title={soundEnabled ? 'Desativar efeitos sonoros' : 'Ativar efeitos sonoros'}
                  aria-label={soundEnabled ? 'Desativar efeitos sonoros' : 'Ativar efeitos sonoros'}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] transition-colors"
                >
                  {soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-[#A6C957]" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-[#A5B1C5]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={onOpenPrintSheet}
                  title="Visualizar folha para impressão"
                  aria-label="Visualizar folha para impressão"
                  className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] transition-colors"
                >
                  <Printer className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={onOpenObsOverlay}
                  title="Modo Overlay Transparente para OBS / Lives"
                  aria-label="Modo Overlay Transparente para OBS e transmissões"
                  className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-[#080D18] transition"
                >
                  <Video className="w-4 h-4 text-[#FFFFFF]" />
                </button>
              </div>

              {/* Modo Telão */}
              <button
                type="button"
                onClick={onOpenPresentation}
                title="Abrir Modo Telão em Tela Cheia"
                aria-label="Abrir Modo Telão para transmissão ao vivo"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#FFFFFF] bg-[#0131CD] hover:brightness-110 border border-[#FFFFFF]/15 rounded-xl shadow-sm transition whitespace-nowrap shrink-0 min-h-[38px]"
              >
                <Tv className="w-4 h-4 text-[#A6C957]" />
                <span className="hidden md:inline">Modo Telão</span>
              </button>

              {/* Account Profile Button */}
              <button
                type="button"
                onClick={onOpenAccount}
                title={currentUser ? `Conectado como ${currentUser.displayName || currentUser.email}` : 'Conectar conta'}
                aria-label={currentUser ? `Conta de ${currentUser.displayName || currentUser.email}` : 'Conectar conta'}
                className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-[#111B30] border border-[#A5B1C5]/20 hover:border-[#0131CD] transition text-xs font-semibold text-[#FFFFFF] min-h-[38px] shrink-0"
              >
                {currentUser?.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt="Perfil"
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full border border-[#A6C957] object-cover shrink-0"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#0131CD] text-[#FFFFFF] flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
                <span className="hidden sm:inline max-w-[90px] truncate text-[#FFFFFF] font-medium">
                  {currentUser?.displayName ? currentUser.displayName.split(' ')[0] : 'Conta'}
                </span>
              </button>

              {/* Mobile / Tablet Menu Drawer Button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                title={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu completo'}
                aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu completo'}
                aria-expanded={mobileMenuOpen}
                className="xl:hidden w-10 h-10 p-2 flex items-center justify-center text-[#FFFFFF] bg-[#111B30] border border-[#A5B1C5]/20 rounded-xl transition shrink-0"
              >
                {mobileMenuOpen ? <X className="w-5 h-5 text-[#A6C957]" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile & Tablet Expanded Drawer */}
          {mobileMenuOpen && (
            <div className="xl:hidden py-4 px-1 border-t border-[#A5B1C5]/15 bg-[#080D18] space-y-3 animate-fade-in">
              {onStartNewRaffle && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onStartNewRaffle();
                  }}
                  className="w-full min-h-[46px] px-4 py-3 rounded-xl bg-[#0131CD] text-[#FFFFFF] font-black text-xs flex items-center justify-center gap-2 shadow-md"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>+ CRIAR NOVO SORTEIO PASSO A PASSO</span>
                </button>
              )}

              <nav className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-semibold" aria-label="Menu móvel">
                {PRIMARY_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = normalizedActiveTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleTabClick(item.id)}
                      className={`min-h-[46px] px-3.5 py-2.5 rounded-xl flex items-center gap-2.5 transition ${
                        isActive
                          ? 'bg-[#0131CD] text-[#FFFFFF] font-bold border border-[#A6C957]/60 shadow-sm'
                          : 'bg-[#111B30] text-[#A5B1C5] hover:text-[#FFFFFF] border border-[#A5B1C5]/15'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-[#A6C957] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="pt-2 border-t border-[#A5B1C5]/15 flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onOpenPrintSheet();
                    setMobileMenuOpen(false);
                  }}
                  className="flex-1 min-h-[42px] px-3 py-2 bg-[#111B30] border border-[#A5B1C5]/15 text-[#FFFFFF] rounded-xl flex items-center justify-center gap-1.5 font-medium"
                >
                  <Printer className="w-4 h-4 text-[#A6C957]" />
                  <span>Folha de Impressão</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenObsOverlay();
                    setMobileMenuOpen(false);
                  }}
                  className="flex-1 min-h-[42px] px-3 py-2 bg-[#111B30] border border-[#A5B1C5]/15 text-[#FFFFFF] rounded-xl flex items-center justify-center gap-1.5 font-medium"
                >
                  <Video className="w-4 h-4 text-[#A6C957]" />
                  <span>Overlay OBS</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Fixed Bottom Navigation Bar for Mobile One-Handed Ergonomics */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#080D18]/95 backdrop-blur-xl border-t border-[#A5B1C5]/15 px-2 py-1.5 grid grid-cols-5 gap-1 shadow-2xl"
        aria-label="Navegação rápida inferior para celular"
      >
        {[
          PRIMARY_NAV_ITEMS[0], // Painel
          PRIMARY_NAV_ITEMS[1], // Sorteios
          PRIMARY_NAV_ITEMS[2], // LIVE PRO
          PRIMARY_NAV_ITEMS[3], // Participantes
          PRIMARY_NAV_ITEMS[5], // Assinatura
        ].map((item) => {
          const Icon = item.icon;
          const isActive = normalizedActiveTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTabClick(item.id)}
              className={`min-h-[48px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition ${
                isActive
                  ? 'bg-[#0131CD] text-[#FFFFFF] font-bold border border-[#A6C957]/50'
                  : 'text-[#A5B1C5] hover:text-[#FFFFFF]'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#A6C957]' : 'text-[#A5B1C5]'}`} />
              <span className="truncate max-w-[64px]">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
