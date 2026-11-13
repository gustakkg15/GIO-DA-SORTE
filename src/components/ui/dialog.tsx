import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  showCloseButton?: boolean;
}

const maxWidthClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: 'max-w-4xl',
};

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'lg',
  showCloseButton = true,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      aria-modal="true"
      role="dialog"
    >
      <div
        ref={dialogRef}
        className={`relative w-full bg-[#111B30] border border-[#A5B1C5]/20 rounded-2xl shadow-2xl overflow-hidden text-[#FFFFFF] animate-in zoom-in-95 duration-200 ${maxWidthClasses[maxWidth]}`}
      >
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-[#A5B1C5]/15 bg-[#080D18]/60">
            <div>
              {title && (
                <h2 className="text-lg font-bold text-[#FFFFFF] tracking-tight">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-xs sm:text-sm text-[#A5B1C5] mt-1">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-[#A5B1C5] hover:text-[#FFFFFF] hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957]"
                aria-label="Fechar modal"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
};
