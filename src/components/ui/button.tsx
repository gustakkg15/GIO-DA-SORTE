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
    'bg-[#0131CD] hover:bg-[#0131CD]/90 text-[#FFFFFF] shadow-lg shadow-[#080D18]/40 border border-white/15',
  secondary:
    'bg-[#111B30] hover:bg-[#111B30]/80 text-[#FFFFFF] border border-[#A5B1C5]/20 hover:border-[#0131CD]',
  outline:
    'bg-transparent hover:bg-[#111B30] text-[#FFFFFF] border border-[#A5B1C5]/25 hover:border-[#0131CD]',
  ghost:
    'bg-transparent hover:bg-[#111B30] text-[#A5B1C5] hover:text-[#FFFFFF] border border-transparent',
  danger:
    'bg-[#F05262] hover:bg-[#F05262]/90 text-[#FFFFFF] shadow-md shadow-[#080D18]/40 border border-transparent',
  gold:
    'bg-[#A6C957] hover:bg-[#B5D477] text-[#080D18] font-bold shadow-md shadow-[#080D18]/40 border border-transparent',
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
        className={`inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A6C957] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080D18] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 select-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
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
