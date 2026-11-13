import React, { useState } from 'react';
import { X, Copy, CheckCircle2, Tv } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#080D18]/85 backdrop-blur-md animate-fade-in">
      <div className="bg-[#111B30] border border-[var(--gio-border-subtle)] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-slide-up">
        {/* Header */}
        <div className="p-5 border-b border-[var(--gio-border-subtle)] flex items-center justify-between bg-[#111B30]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#0131CD] border border-[#0131CD] flex items-center justify-center text-[#FFFFFF]">
              <Tv className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-[#FFFFFF]">QR Code para Participantes</h3>
              <p className="text-xs text-[#A5B1C5]">Para exibir na live, stories ou cartaz</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#A5B1C5] hover:text-[#FFFFFF] p-2 rounded-xl hover:bg-[#080D18] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 text-center space-y-5">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#A6C957]">
              {organizerName || 'GIO DA SORTE'}
            </span>
            <h4 className="font-bold text-xl text-[#FFFFFF]">{raffleTitle || 'Sorteio Oficial'}</h4>
            <div className="inline-block mt-1 font-mono font-bold text-sm bg-[#0131CD] text-[#FFFFFF] border border-[#0131CD] px-3 py-1 rounded-full tabular-nums">
              Código: #{raffleCode}
            </div>
          </div>

          {/* QR Code Container (Preserved bg-white for optical scanners) */}
          <div className="p-4 bg-[#FFFFFF] rounded-2xl shadow-xl inline-block mx-auto border-4 border-[#0131CD]">
            <img
              src={qrUrl}
              alt={`QR Code para sorteio ${raffleCode}`}
              className="w-56 h-56 object-contain rounded-lg"
              loading="lazy"
            />
          </div>

          <p className="text-xs text-[#A5B1C5] max-w-xs mx-auto">
            Peça para os participantes apontarem a câmera do celular. O link já abre diretamente na aba de consulta com
            seus bilhetes!
          </p>

          {/* Link Box */}
          <div className="p-3 bg-[#080D18] rounded-xl border border-[var(--gio-border-subtle)] flex items-center justify-between gap-2 text-left">
            <div className="font-mono text-xs text-[#A5B1C5] truncate select-all">{directLink}</div>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 bg-[#0131CD] hover:brightness-110 text-[#FFFFFF] font-bold text-xs rounded-lg transition shrink-0 flex items-center gap-1 active:scale-95"
            >
              {copiedLink ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#A6C957]" />
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
        <div className="p-4 border-t border-[var(--gio-border-subtle)] bg-[#080D18] text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-[#111B30] hover:bg-[#0131CD] text-[#FFFFFF] font-bold text-xs rounded-xl border border-[var(--gio-border-subtle)] transition"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  );
};
