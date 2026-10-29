import React, { useState } from 'react';
import { X, Copy, CheckCircle2, Download, Tv, ExternalLink, Sparkles } from 'lucide-react';

interface RaffleQrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  raffleCode: string;
  organizerName: string;
  raffleTitle: string;
}

export const RaffleQrCodeModal: React.FC<RaffleQrCodeModalProps> = ({
  isOpen,
  onClose,
  raffleCode,
  organizerName,
  raffleTitle,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const currentUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  const directLink = `${currentUrl}?sorteio=${encodeURIComponent(raffleCode)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=15&data=${encodeURIComponent(
    directLink
  )}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(directLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-slide-up">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-sky-400">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-black text-lg text-white">QR Code para Participantes</h3>
              <p className="text-xs text-slate-400">Para exibir na live, stories ou cartaz</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 text-center space-y-5">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
              {organizerName || 'GIO DA SORTE'}
            </span>
            <h4 className="font-display font-black text-xl text-white">{raffleTitle || 'Sorteio Oficial'}</h4>
            <div className="inline-block mt-1 font-mono font-black text-sm bg-blue-600/20 text-sky-300 border border-blue-500/40 px-3 py-1 rounded-full">
              Código: #{raffleCode}
            </div>
          </div>

          {/* QR Code Container */}
          <div className="p-4 bg-white rounded-2xl shadow-xl inline-block mx-auto border-4 border-blue-500/30">
            <img
              src={qrUrl}
              alt={`QR Code para sorteio ${raffleCode}`}
              className="w-56 h-56 object-contain rounded-lg"
              loading="lazy"
            />
          </div>

          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Peça para os participantes apontarem a câmera do celular. O link já abre diretamente na aba de consulta com
            seus bilhetes!
          </p>

          {/* Link Box */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-2 text-left">
            <div className="font-mono text-xs text-slate-300 truncate select-all">{directLink}</div>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition shrink-0 flex items-center gap-1 active:scale-95"
            >
              {copiedLink ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  );
};
