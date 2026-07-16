'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, ChevronDown, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  /** Currently selected value (empty string = nothing selected). */
  value: string;
  onChange: (value: string) => void;
  /** Fetches options for the given search term. Called with '' on open/focus to show an initial page. */
  fetchOptions: (search: string) => Promise<SearchableSelectOption[]>;
  placeholder?: string;
  disabled?: boolean;
  /** Label to show for the current `value` without a refetch (e.g. supplied by the parent from an earlier lookup). */
  selectedLabel?: string;
  className?: string;
}

const DEBOUNCE_MS = 300;

/**
 * A controlled, debounced, async single-select combobox. Replaces the
 * load-everything-then-filter-client-side pattern for dropdowns backed by
 * large tables (products, customers): options are fetched a page at a time
 * from the server as the user types, instead of loading every row up front.
 */
export default function SearchableSelect({
  value,
  onChange,
  fetchOptions,
  placeholder = 'Search...',
  disabled,
  selectedLabel,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [options, setOptions] = useState<SearchableSelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [internalLabel, setInternalLabel] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const justOpenedRef = useRef(false);

  // Close on outside click (mirrors the pattern in child-boxes/generate/page.tsx)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // If the value is cleared externally, forget any locally-remembered label.
  useEffect(() => {
    if (!value) setInternalLabel('');
  }, [value]);

  const runFetch = useCallback(
    (search: string) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      fetchOptions(search)
        .then((results) => {
          if (requestId === requestIdRef.current) setOptions(results);
        })
        .catch(() => {
          if (requestId === requestIdRef.current) setOptions([]);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        });
    },
    [fetchOptions]
  );

  // Fetch immediately when the dropdown opens; debounce while typing.
  useEffect(() => {
    if (!open) return;
    const delay = justOpenedRef.current ? 0 : DEBOUNCE_MS;
    justOpenedRef.current = false;
    const handle = setTimeout(() => runFetch(searchTerm), delay);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, open]);

  const openDropdown = () => {
    if (!open) justOpenedRef.current = true;
    setOpen(true);
  };

  const handleFocus = () => {
    openDropdown();
    if (value) setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setInternalLabel('');
    setSearchTerm('');
  };

  const displayLabel = selectedLabel ?? internalLabel;

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div
        className={cn(
          'w-full flex items-center rounded-lg border bg-gray-50/50 px-4 py-2.5 text-sm cursor-pointer transition-all duration-200',
          'border-brand-border focus-within:border-binny-navy focus-within:ring-2 focus-within:ring-binny-navy/20 focus-within:bg-white',
          disabled && 'opacity-60 cursor-not-allowed'
        )}
        onClick={() => {
          if (!disabled) openDropdown();
        }}
      >
        <Search className="h-4 w-4 text-brand-text-muted shrink-0 mr-2" />
        <input
          type="text"
          disabled={disabled}
          placeholder={value ? '' : placeholder}
          value={open ? searchTerm : displayLabel || ''}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            if (!open) openDropdown();
          }}
          onFocus={handleFocus}
          className="flex-1 min-w-0 outline-none bg-transparent text-brand-text-dark placeholder:text-brand-text-muted disabled:cursor-not-allowed"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-0.5 text-brand-text-muted hover:text-brand-text-dark shrink-0"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {loading ? (
          <Loader2 className="h-4 w-4 text-brand-text-muted shrink-0 ml-2 animate-spin" />
        ) : (
          <ChevronDown
            className={cn(
              'h-4 w-4 text-brand-text-muted shrink-0 ml-2 transition-transform',
              open && 'rotate-180'
            )}
          />
        )}
      </div>
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-brand-border rounded-lg shadow-lg">
          {loading && options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-brand-text-muted">Loading...</div>
          ) : options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-brand-text-muted">No results found</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setInternalLabel(opt.label);
                  setSearchTerm('');
                  setOpen(false);
                }}
                className={cn(
                  'w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors',
                  value === opt.value
                    ? 'bg-binny-navy-light text-binny-navy font-medium'
                    : 'text-brand-text-dark'
                )}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
