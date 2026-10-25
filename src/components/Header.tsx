import { User as FirebaseUser } from 'firebase/auth';
import { Sparkles, Tv, Volume2, VolumeX, Printer, Video, User, Heart } from 'lucide-react';

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
  return (
    <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-blue-950/60 shadow-lg shadow-blue-950/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 md:gap-8 h-16">
          {/* Zone 1: Single text element wordmark */}
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/30 ring-1 ring-blue-400/40">
              <Sparkles className="w-5 h-5 fill-white" />
            </div>
            <span className="font-display font-black text-xl sm:text-2xl tracking-tight bg-gradient-to-r from-white via-sky-100 to-sky-300 bg-clip-text text-transparent">
              GIO DA SORTE
            </span>
          </div>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav className="hidden lg:flex items-center gap-1 sm:gap-2 text-sm font-semibold text-slate-300">
            <button
              type="button"
              onClick={() => onSelectTab('draw')}
              className={`px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'draw'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'hover:text-white hover:bg-slate-900 text-slate-300'
              }`}
            >
              Sorteio
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('search')}
              className={`px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'search'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'hover:text-white hover:bg-slate-900 text-slate-300'
              }`}
            >
              Consultar
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('stats')}
              className={`px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'stats'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'hover:text-white hover:bg-slate-900 text-slate-300'
              }`}
            >
              Chances & Dados
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('help')}
              className={`px-3.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'help'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-bold'
                  : 'hover:text-white hover:bg-slate-900 text-slate-300'
              }`}
            >
              Como Funciona
            </button>
            <button
              type="button"
              onClick={() => onSelectTab('support')}
              className={`px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeTab === 'support'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30 font-bold ring-1 ring-blue-400/50'
                  : 'text-sky-300 hover:text-white hover:bg-blue-950/60 bg-blue-950/30 border border-blue-800/40'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${activeTab === 'support' ? 'fill-white text-white' : 'fill-rose-500/80 text-rose-400'}`} />
              <span>Apoiar / Gratidão</span>
            </button>
          </nav>

          {/* Zone 3: 1 primary action + utility buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'Desativar efeitos sonoros' : 'Ativar efeitos sonoros'}
              aria-label={soundEnabled ? 'Desativar som' : 'Ativar som'}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-900 rounded-lg transition-colors"
            >
              {soundEnabled ? <Volume2 className="w-5 h-5 text-sky-400" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
            </button>

            <button
              type="button"
              onClick={onOpenPrintSheet}
              title="Visualizar folha para impressão"
              className="hidden sm:inline-flex p-2 text-slate-300 hover:text-white hover:bg-slate-900 rounded-lg transition-colors"
            >
              <Printer className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={onOpenObsOverlay}
              title="Modo Overlay Transparente para OBS / Lives"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-sky-200 hover:text-white bg-blue-950/60 hover:bg-blue-900/60 border border-blue-800/60 rounded-xl transition whitespace-nowrap shrink-0"
            >
              <Video className="w-3.5 h-3.5 text-sky-400" />
              <span>OBS Overlay</span>
            </button>

            <button
              type="button"
              onClick={onOpenPresentation}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 rounded-xl shadow-md shadow-blue-600/30 transition whitespace-nowrap shrink-0"
            >
              <Tv className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Modo Telão</span>
            </button>

            {/* Account / Cloud Profile Button */}
            <button
              type="button"
              onClick={onOpenAccount}
              title={currentUser ? `Conectado como ${currentUser.displayName || currentUser.email}` : 'Conectar conta'}
              className="flex items-center gap-1.5 p-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500/60 transition text-xs font-semibold text-slate-200"
            >
              {currentUser?.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt="Perfil"
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-full border border-blue-400"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-blue-600/40 text-sky-300 flex items-center justify-center">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
              <span className="hidden md:inline max-w-[100px] truncate">
                {currentUser?.displayName ? currentUser.displayName.split(' ')[0] : 'Conta'}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar */}
        <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto py-2.5 border-t border-slate-800/60 no-scrollbar">
          <button
            type="button"
            onClick={() => onSelectTab('draw')}
            className={`px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${
              activeTab === 'draw' ? 'bg-blue-600 text-white' : 'text-slate-300 bg-slate-900'
            }`}
          >
            Sorteio
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('search')}
            className={`px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${
              activeTab === 'search' ? 'bg-blue-600 text-white' : 'text-slate-300 bg-slate-900'
            }`}
          >
            Consultar
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('stats')}
            className={`px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${
              activeTab === 'stats' ? 'bg-blue-600 text-white' : 'text-slate-300 bg-slate-900'
            }`}
          >
            Chances
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('help')}
            className={`px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${
              activeTab === 'help' ? 'bg-blue-600 text-white' : 'text-slate-300 bg-slate-900'
            }`}
          >
            Ajuda
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('support')}
            className={`px-3 py-1 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 flex items-center gap-1 ${
              activeTab === 'support' ? 'bg-blue-600 text-white' : 'text-sky-300 bg-blue-950/60 border border-blue-800/50'
            }`}
          >
            <Heart className="w-3 h-3 fill-rose-500/80 text-rose-400" />
            <span>Apoiar</span>
          </button>
        </div>
      </div>
    </header>
  );
};
