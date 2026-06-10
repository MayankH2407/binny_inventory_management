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

  // Stable refs so the global keydown listener doesn't need to re-bind
  // every render and always sees the latest props.
  const onScanRef = useRef(onScan);
  const minLengthRef = useRef(minLength);
  useEffect(() => {
    onScanRef.current = onScan;
    minLengthRef.current = minLength;
  }, [onScan, minLength]);

  // Submit helper. Reads the DOM value at call time and clears both state
  // and DOM so the next scan starts fresh.
  const submit = useCallback((code: string) => {
    // Barcode alphabet is uppercase A-Z and 0-9 only. Normalize defensively
    // because HID scanners + Windows Caps Lock can flip output to lowercase.
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < minLengthRef.current) return;
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    setValue('');
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    void Promise.resolve(onScanRef.current(trimmed));
  }, []);

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus && !disabled) {
      inputRef.current?.focus();
    }
  }, [autoFocus, disabled]);

  // Global keydown: when our input is NOT focused, capture characters that
  // would otherwise be lost and route them into the input. The previous
  // implementation only called .focus() on the first keystroke — but focus
  // is async, so the keystroke that triggered it (and any others arriving
  // before focus settles) was dropped. HID scanners inject the entire
  // barcode in a single burst, so dropping the first 1-2 chars usually
  // breaks the scan.
  useEffect(() => {
    if (!autoFocus || disabled) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const dom = inputRef.current;
      if (!dom) return;

      const active = document.activeElement;
      // Our input owns its keystrokes — let handleKeyDown handle them.
      if (active === dom) return;

      const isOtherEditable =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable);
      // User is typing into another field — don't hijack their input.
      if (isOtherEditable) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        submit(dom.value);
        return;
      }

      if (e.key.length === 1) {
        e.preventDefault();
        const next = dom.value + e.key;
        dom.value = next;
        setValue(next);
        dom.focus();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        const next = dom.value.slice(0, -1);
        dom.value = next;
        setValue(next);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [autoFocus, disabled, submit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Read the DOM directly. During an HID burst (12+ chars + Enter in
      // <50ms), React state from setValue may not have committed yet, so
      // the closure value is stale and triggerScan would fire with a
      // partial barcode. e.currentTarget.value reflects what the user
      // (or scanner) actually typed.
      submit(e.currentTarget.value);
    }
  };

  const handleAddClick = () => {
    submit(inputRef.current?.value ?? value);
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
