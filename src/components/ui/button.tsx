import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'gold';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[#0866F5] hover:bg-[#00A9FF] text-white shadow-lg shadow-[#0866F5]/20 border border-transparent',
  secondary:
    'bg-[#101F3D] hover:bg-[#182C52] text-[#F8FAFC] border border-white/10 hover:border-white/20',
  outline:
    'bg-transparent hover:bg-white/5 text-slate-200 border border-white/15 hover:border-white/30',
  ghost:
    'bg-transparent hover:bg-white/10 text-slate-300 hover:text-white border border-transparent',
  danger:
    'bg-[#F05262] hover:bg-[#D93D4D] text-white shadow-md shadow-[#F05262]/20 border border-transparent',
  gold:
    'bg-gradient-to-r from-[#F5B942] to-[#E5A832] hover:from-[#E5A832] hover:to-[#D49722] text-[#050D20] font-bold shadow-md shadow-[#F5B942]/20 border border-transparent',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5 min-h-[32px]',
  md: 'px-4 py-2 text-sm rounded-xl gap-2 min-h-[40px]',
  lg: 'px-5 py-2.5 text-base rounded-xl gap-2.5 min-h-[48px]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      className = '',
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isControlDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isControlDisabled}
        className={`inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00A9FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050D20] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 select-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        <span className="truncate">{children}</span>
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
