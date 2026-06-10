'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import api from '@/services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  article_name: string;
  colour: string;
  section: string;
  category: string;
  article_group: string | null;
}

interface ProductListResponse {
  data: Product[];
  total: number;
}

// ─── Helper: build the drill path for a product ───────────────────────────────

function buildDrillPath(product: Product): string {
  const group = product.article_group || '(Ungrouped)';
  const segments = [
    product.section,
    product.category,
    group,
    product.article_name,
  ].map(encodeURIComponent);
  return `/inventory/${segments.join('/')}`;
}

// ─── Debounce hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InventorySearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 250);

  // Fetch results when debounced query changes
  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    api
      .get<ProductListResponse>('/products', {
        params: { search: debouncedQuery, limit: 8, is_active: 'true' },
      })
      .then((res) => {
        if (cancelled) return;
        // The api interceptor unwraps the data wrapper; for paginated responses
        // it returns { data: [...], page, limit, total, totalPages }
        const raw = res.data as unknown;
        let products: Product[] = [];
        if (Array.isArray(raw)) {
          products = raw as Product[];
        } else if (raw && typeof raw === 'object' && Array.isArray((raw as { data: Product[] }).data)) {
          products = (raw as { data: Product[] }).data;
        }
        setResults(products);
        setIsOpen(products.length > 0);
      })
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setIsOpen(false);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  function handleSelect(product: Product) {
    const path = buildDrillPath(product);
    setQuery('');
    setIsOpen(false);
    router.push(path);
  }

  function handleClear() {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full sm:max-w-sm">
      {/* Input */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-brand-text-muted pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search article or colour…"
          className="
            w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-gray-200
            bg-white text-brand-text-dark placeholder:text-brand-text-muted
            focus:outline-none focus:ring-2 focus:ring-binny-navy/20 focus:border-binny-navy
            transition-all duration-150
          "
          aria-label="Search inventory"
          autoComplete="off"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-2.5 p-0.5 text-brand-text-muted hover:text-brand-text-dark transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {isLoading && !query.length && (
          <span className="absolute right-2.5 h-4 w-4 border-2 border-binny-navy/30 border-t-binny-navy rounded-full animate-spin" />
        )}
      </div>

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          {results.map((product) => (
            <button
              key={product.id}
              onClick={() => handleSelect(product)}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
            >
              <p className="text-sm font-medium text-brand-text-dark truncate">
                {product.article_name}
              </p>
              <p className="text-xs text-brand-text-muted mt-0.5">
                {product.colour}
                {(product.section || product.category) && (
                  <> &middot; {[product.section, product.category].filter(Boolean).join('/')}</>
                )}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* No results */}
      {isOpen && results.length === 0 && !isLoading && debouncedQuery.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white rounded-xl border border-gray-200 shadow-lg px-4 py-3">
          <p className="text-sm text-brand-text-muted">No products found for &ldquo;{debouncedQuery}&rdquo;</p>
        </div>
      )}
    </div>
  );
}
