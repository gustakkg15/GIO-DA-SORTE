import React from 'react';

export type BadgeVariant =
  | 'default'
  | 'pro'
  | 'gold'
  | 'success'
  | 'warning'
  | 'error'
  | 'outline';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

const badgeVariantClasses: Record<BadgeVariant, string> = {
  default: 'bg-white/10 text-slate-200 border-white/15',
  pro: 'bg-[#0866F5]/20 text-[#00A9FF] border-[#0866F5]/40 font-semibold',
  gold: 'bg-[#F5B942]/20 text-[#F5B942] border-[#F5B942]/40 font-semibold',
  success: 'bg-[#20C997]/20 text-[#20C997] border-[#20C997]/40',
  warning: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  error: 'bg-[#F05262]/20 text-[#F05262] border-[#F05262]/40',
  outline: 'bg-transparent text-slate-300 border-white/20',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  className = '',
  children,
  icon,
  ...props
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors select-none ${badgeVariantClasses[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
};
