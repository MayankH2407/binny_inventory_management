'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'text-white focus:ring-binny-navy shadow-sm hover:shadow-md',
  secondary:
    'bg-white hover:bg-gray-50 text-brand-text-dark border border-brand-border focus:ring-gray-300 shadow-sm',
  outline:
    'bg-transparent hover:bg-binny-navy-50 text-binny-navy border border-binny-navy focus:ring-binny-navy',
  ghost:
    'bg-transparent hover:bg-gray-100 text-brand-text-muted focus:ring-gray-300',
  danger:
    'text-white focus:ring-red-500 shadow-sm hover:shadow-md',
};

const variantInlineStyles: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'linear-gradient(135deg, #2D2A6E 0%, #3D3A8E 100%)', color: '#FFFFFF' },
  secondary: { backgroundColor: '#FFFFFF', color: '#1A1A2E' },
  outline: { borderColor: '#2D2A6E', color: '#2D2A6E' },
  ghost: {},
  danger: { background: 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)', color: '#FFFFFF' },
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-md gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-lg gap-2',
  lg: 'px-6 py-3 text-base rounded-lg gap-2.5',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      style,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'active:scale-[0.98]',
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className
        )}
        style={{ ...variantInlineStyles[variant], ...style }}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
