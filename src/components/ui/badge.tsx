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
  default: 'bg-[#111B30] text-[#FFFFFF] border-[#A5B1C5]/20',
  pro: 'bg-[#0131CD] text-[#FFFFFF] border-[#0131CD] font-semibold',
  gold: 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/35 font-semibold',
  success: 'bg-[#A6C957]/15 text-[#A6C957] border-[#A6C957]/35',
  warning: 'bg-[#111B30] text-[#A6C957] border-[#A6C957]/35',
  error: 'bg-[#F05262]/20 text-[#F05262] border-[#F05262]/40',
  outline: 'bg-transparent text-[#A5B1C5] border-[#A5B1C5]/25',
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
