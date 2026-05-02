'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { Barcode, CheckCircle2 } from 'lucide-react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface HIDScannerInputProps {
  onScan: (code: string) => void | Promise<void>;
  placeholder?: string;
  label?: string;
  helperText?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  className?: string;
  /** Minimum length before triggering onScan. Default 1. */
  minLength?: number;
}

export default function HIDScannerInput({
  onScan,
  placeholder = 'Scan barcode or type manually...',
  label,
  helperText,
  autoFocus = true,
  disabled = false,
  className,
  minLength = 1,
}: HIDScannerInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && !disabled) {
      inputRef.current?.focus();
    }
  }, [autoFocus, disabled]);

  // Re-focus on any keystroke when no editable element has focus and we're not disabled
  useEffect(() => {
    if (!autoFocus || disabled) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isEditable =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable);

      if (!isEditable && inputRef.current) {
        // Don't steal focus for modifier-only or special keys
        if (e.key.length === 1 || e.key === 'Backspace') {
          inputRef.current.focus();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [autoFocus, disabled]);

  const triggerScan = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (trimmed.length < minLength) return;
      setValue('');
      // Refocus after state clear so next scan lands in the input immediately
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      await onScan(trimmed);
    },
    [onScan, minLength]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerScan(value);
    }
  };

  const handleAddClick = () => {
    triggerScan(value);
  };

  const scannerReadyIcon = (
    <div
      className={cn(
        'flex items-center gap-1 transition-colors duration-200',
        isFocused ? 'text-green-600' : 'text-brand-text-muted'
      )}
    >
      {isFocused ? (
        <CheckCircle2 className="h-4 w-4 animate-pulse" />
      ) : (
        <Barcode className="h-4 w-4" />
      )}
    </div>
  );

  return (
    <div className={cn('w-full', className)}>
      {/* Scanner-ready badge */}
      <div className="flex items-center justify-between mb-1.5">
        {label ? (
          <span className="text-sm font-medium text-brand-text-dark">{label}</span>
        ) : (
          <span className="text-sm font-medium text-brand-text-dark">Barcode Scanner</span>
        )}
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full transition-all duration-200',
            isFocused
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-gray-100 text-brand-text-muted border border-brand-border'
          )}
        >
          {isFocused ? (
            <>
              <CheckCircle2 className="h-3 w-3 animate-pulse" />
              Scanner ready
            </>
          ) : (
            <>
              <Barcode className="h-3 w-3" />
              Click to focus
            </>
          )}
        </span>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            ref={inputRef}
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            leftIcon={scannerReadyIcon}
            className={cn(
              'transition-all duration-200',
              isFocused && 'ring-2 ring-green-500/20 border-green-400'
            )}
          />
        </div>
        <Button
          type="button"
          size="md"
          disabled={disabled || value.trim().length < minLength}
          onClick={handleAddClick}
        >
          Add
        </Button>
      </div>

      {helperText && (
        <p className="mt-1 text-xs text-brand-text-muted">{helperText}</p>
      )}
    </div>
  );
}
