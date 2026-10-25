import React, { useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  Sparkles,
  Tv,
  Volume2,
  VolumeX,
  Printer,
  Video,
  User,
  Heart,
  Settings,
  HelpCircle,
  Ticket,
  Search,
  BarChart3,
  Menu,
  X,
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'draw' | 'search' | 'stats' | 'settings' | 'help' | 'support';
  onSelectTab: (tab: 'draw' | 'search' | 'stats' | 'settings' | 'help' | 'support') => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenPresentation: () => void;
  onOpenPrintSheet: () => void;
  onOpenObsOverlay: () => void;
  currentUser: FirebaseUser | null;
  onOpenAccount: () => void;
  totalParticipants: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  soundEnabled,
  onToggleSound,
  onOpenPresentation,
  onOpenPrintSheet,
  onOpenObsOverlay,
  currentUser,
  onOpenAccount,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleTabClick = (tab: 'draw' | 'search' | 'stats' | 'settings' | 'help' | 'support') => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-blue-950/60 shadow-lg shadow-blue-950/20">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 sm:gap-4 md:gap-8 h-16">
          {/* Brand Wordmark & Logo */}
          <div className="flex items-center gap-2 sm:gap-2.5 whitespace-nowrap shrink-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/30 ring-1 ring-blue-400/40">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
            </div>
            <button
              type="button"
              onClick={() => handleTabClick('draw')}
              className="text-left font-display font-black text-lg sm:text-2xl tracking-tight bg-gradient-to-r from-white via-sky-100 to-sky-300 bg-clip-text text-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-lg"
            >
              GIO DA SORTE
            </button>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1 sm:gap-1.5 text-sm font-semibold text-slate-300" aria-label="Navegação principal">
            <button
              type="button"
              onClick={() => handleTabClick('draw')}
              className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                activeTab === 'draw'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'hover:text-white hover:bg-slate-900 text-slate-300'
              }`}
            >
              Sorteio
            </button>
            <button
              type="button"
              onClick={() => handleTabClick('search')}
              className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                activeTab === 'search'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'hover:text-white hover:bg-slate-900 text-slate-300'
              }`}
            >
              Consultar
            </button>
            <button
              type="button"
              onClick={() => handleTabClick('stats')}
              className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                activeTab === 'stats'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'hover:text-white hover:bg-slate-900 text-slate-300'
              }`}
            >
              Chances & Dados
            </button>
            <button
              type="button"
              onClick={() => handleTabClick('settings')}
              className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                activeTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'hover:text-white hover:bg-slate-900 text-slate-300'
              }`}
            >
              Configurações
            </button>
            <button
              type="button"
              onClick={() => handleTabClick('help')}
              className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                activeTab === 'help'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'hover:text-white hover:bg-slate-900 text-slate-300'
              }`}
            >
              Como Funciona
            </button>
            <button
              type="button"
              onClick={() => handleTabClick('support')}
              className={`px-3.5 py-2 rounded-xl transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                activeTab === 'support'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30 font-bold ring-1 ring-blue-400/50'
                  : 'text-sky-300 hover:text-white hover:bg-blue-950/60 bg-blue-950/30 border border-blue-800/40'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${activeTab === 'support' ? 'fill-white text-white' : 'fill-rose-500/80 text-rose-400'}`} />
              <span>Apoiar</span>
            </button>
          </nav>

          {/* Quick Actions (Sound, Print, OBS, Telão, Account, Hamburger) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Sound Toggle */}
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'Desativar efeitos sonoros' : 'Ativar efeitos sonoros'}
              aria-label={soundEnabled ? 'Desativar efeitos sonoros' : 'Ativar efeitos sonoros'}
              className="min-w-[40px] min-h-[40px] p-2 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-900 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {soundEnabled ? <Volume2 className="w-5 h-5 text-sky-400" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
            </button>

            {/* Print Sheet (Visible on sm+) */}
            <button
              type="button"
              onClick={onOpenPrintSheet}
              title="Visualizar folha para impressão"
              aria-label="Visualizar folha para impressão"
              className="hidden sm:flex min-w-[40px] min-h-[40px] p-2 items-center justify-center text-slate-300 hover:text-white hover:bg-slate-900 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <Printer className="w-5 h-5" />
            </button>

            {/* OBS Overlay (Visible on md+) */}
            <button
              type="button"
              onClick={onOpenObsOverlay}
              title="Modo Overlay Transparente para OBS / Lives"
              aria-label="Modo Overlay Transparente para OBS e transmissões"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-sky-200 hover:text-white bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/60 rounded-xl transition whitespace-nowrap shrink-0 min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <Video className="w-3.5 h-3.5 text-sky-400" />
              <span>OBS</span>
            </button>

            {/* Modo Telão Presentation */}
            <button
              type="button"
              onClick={onOpenPresentation}
              title="Abrir Modo Telão em Tela Cheia"
              aria-label="Abrir Modo Telão para transmissão ao vivo"
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-2 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 rounded-xl shadow-md shadow-blue-600/30 transition whitespace-nowrap shrink-0 min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <Tv className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Modo Telão</span>
            </button>

            {/* Account Profile Button */}
            <button
              type="button"
              onClick={onOpenAccount}
              title={currentUser ? `Conectado como ${currentUser.displayName || currentUser.email}` : 'Conectar conta'}
              aria-label={currentUser ? `Conta de ${currentUser.displayName || currentUser.email}` : 'Conectar conta'}
              className="flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500/60 transition text-xs font-semibold text-slate-200 min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="Perfil"
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-full border border-blue-400 object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-600/40 text-sky-300 flex items-center justify-center">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
              <span className="hidden md:inline max-w-[90px] truncate">
                {currentUser?.displayName ? currentUser.displayName.split(' ')[0] : 'Conta'}
              </span>
            </button>

            {/* Mobile Hamburger Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              title={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu de navegação'}
              aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu de navegação'}
              aria-expanded={mobileMenuOpen}
              className="lg:hidden min-w-[40px] min-h-[40px] p-2 flex items-center justify-center text-slate-300 hover:text-white bg-slate-900/80 border border-slate-800 rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-sky-400" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu Drawer (When hamburger is clicked) */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-3 px-1 border-t border-slate-800/80 bg-slate-950 animate-in fade-in slide-in-from-top-2 duration-150 space-y-2">
            <nav className="grid grid-cols-2 gap-2 text-xs font-semibold" aria-label="Menu móvel">
              <button
                type="button"
                onClick={() => handleTabClick('draw')}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-2.5 transition active:scale-98 ${
                  activeTab === 'draw'
                    ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30'
                    : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <Ticket className="w-4 h-4 text-sky-400" />
                <span>Sorteio</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabClick('search')}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-2.5 transition active:scale-98 ${
                  activeTab === 'search'
                    ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30'
                    : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <Search className="w-4 h-4 text-sky-400" />
                <span>Consultar</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabClick('stats')}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-2.5 transition active:scale-98 ${
                  activeTab === 'stats'
                    ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30'
                    : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <BarChart3 className="w-4 h-4 text-sky-400" />
                <span>Chances</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabClick('settings')}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-2.5 transition active:scale-98 ${
                  activeTab === 'settings'
                    ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30'
                    : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <Settings className="w-4 h-4 text-sky-400" />
                <span>Configurações</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabClick('help')}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-2.5 transition active:scale-98 ${
                  activeTab === 'help'
                    ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/30'
                    : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                }`}
              >
                <HelpCircle className="w-4 h-4 text-sky-400" />
                <span>Como Funciona</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabClick('support')}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center gap-2.5 transition active:scale-98 ${
                  activeTab === 'support'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-md'
                    : 'bg-blue-950/60 text-sky-300 border border-blue-800/60 hover:text-white'
                }`}
              >
                <Heart className="w-4 h-4 fill-rose-500 text-rose-400" />
                <span>Apoiar Projeto</span>
              </button>
            </nav>

            {/* Quick Mobile Extra Actions */}
            <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  onOpenPrintSheet();
                  setMobileMenuOpen(false);
                }}
                className="flex-1 min-h-[40px] px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl flex items-center justify-center gap-1.5 font-medium"
              >
                <Printer className="w-4 h-4 text-sky-400" />
                <span>Imprimir Folha</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenObsOverlay();
                  setMobileMenuOpen(false);
                }}
                className="flex-1 min-h-[40px] px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl flex items-center justify-center gap-1.5 font-medium"
              >
                <Video className="w-4 h-4 text-sky-400" />
                <span>OBS Overlay</span>
              </button>
            </div>
          </div>
        )}

        {/* Mobile Horizontal Quick Tab Bar (Always visible on mobile when drawer is closed) */}
        {!mobileMenuOpen && (
          <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto py-2 border-t border-slate-800/60 no-scrollbar" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'draw'}
              onClick={() => handleTabClick('draw')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
                activeTab === 'draw' ? 'bg-blue-600 text-white font-bold shadow-sm' : 'text-slate-300 bg-slate-900 border border-slate-800'
              }`}
            >
              <Ticket className="w-3.5 h-3.5 text-sky-400" />
              <span>Sorteio</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'search'}
              onClick={() => handleTabClick('search')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
                activeTab === 'search' ? 'bg-blue-600 text-white font-bold shadow-sm' : 'text-slate-300 bg-slate-900 border border-slate-800'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-sky-400" />
              <span>Consultar</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'stats'}
              onClick={() => handleTabClick('stats')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
                activeTab === 'stats' ? 'bg-blue-600 text-white font-bold shadow-sm' : 'text-slate-300 bg-slate-900 border border-slate-800'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
              <span>Chances</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'settings'}
              onClick={() => handleTabClick('settings')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
                activeTab === 'settings' ? 'bg-blue-600 text-white font-bold shadow-sm' : 'text-slate-300 bg-slate-900 border border-slate-800'
              }`}
            >
              <Settings className="w-3.5 h-3.5 text-sky-400" />
              <span>Configurações</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'help'}
              onClick={() => handleTabClick('help')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
                activeTab === 'help' ? 'bg-blue-600 text-white font-bold shadow-sm' : 'text-slate-300 bg-slate-900 border border-slate-800'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
              <span>Ajuda</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'support'}
              onClick={() => handleTabClick('support')}
              className={`min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 flex items-center gap-1.5 transition ${
                activeTab === 'support' ? 'bg-blue-600 text-white font-bold' : 'text-sky-300 bg-blue-950/60 border border-blue-800/50'
              }`}
            >
              <Heart className="w-3.5 h-3.5 fill-rose-500/80 text-rose-400" />
              <span>Apoiar</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
