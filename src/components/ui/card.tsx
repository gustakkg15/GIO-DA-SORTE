import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'interactive' | 'accent';
  children: React.ReactNode;
}

const cardVariantClasses = {
  default: 'bg-[#111B30] border border-[#A5B1C5]/15 shadow-lg shadow-[#080D18]/50',
  glass: 'bg-[#111B30]/90 backdrop-blur-md border border-[#A5B1C5]/15 shadow-xl',
  interactive:
    'bg-[#111B30] hover:bg-[#111B30] border border-[#A5B1C5]/15 hover:border-[#0131CD] transition-all duration-200 cursor-pointer shadow-lg',
  accent:
    'bg-[#111B30] border border-[#0131CD]/50 shadow-lg',
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-2xl text-[#FFFFFF] overflow-hidden ${cardVariantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', children, ...props }, ref) => (
  <div
    ref={ref}
    className={`p-5 sm:p-6 flex flex-col gap-1.5 border-b border-[#A5B1C5]/15 ${className}`}
    {...props}
  >
    {children}
  </div>
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className = '', children, ...props }, ref) => (
  <h3
    ref={ref}
    className={`text-lg font-bold tracking-tight text-[#FFFFFF] ${className}`}
    {...props}
  >
    {children}
  </h3>
));
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className = '', children, ...props }, ref) => (
  <p
    ref={ref}
    className={`text-xs sm:text-sm text-[#A5B1C5] leading-relaxed ${className}`}
    {...props}
  >
    {children}
  </p>
));
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', children, ...props }, ref) => (
  <div ref={ref} className={`p-5 sm:p-6 ${className}`} {...props}>
    {children}
  </div>
));
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', children, ...props }, ref) => (
  <div
    ref={ref}
    className={`p-5 sm:p-6 pt-0 flex items-center justify-between gap-4 ${className}`}
    {...props}
  >
    {children}
  </div>
));
CardFooter.displayName = 'CardFooter';
