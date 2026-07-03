'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import {
  type ChannelConfig,
  DEFAULT_CHANNEL_CONFIG,
} from '@/components/inventory/channelConfig';

interface InventoryBreadcrumbProps {
  pathSegments: string[];
  config?: ChannelConfig;
}

/** Maps a raw path segment to a human-readable label.
 *  Empty string (Ungrouped) is preserved as-is; the display fallback is in the card. */
function segmentLabel(segment: string): string {
  return segment === '' ? '(Ungrouped)' : segment;
}

/** Build the href for a given depth in the breadcrumb.
 *  depth 0 = root (/inventory), depth 1 = /inventory/<seg0>, etc.
 *
 *  Segments arrive from `useParams()` which behaviour varies across Next.js
 *  versions (some return decoded, some encoded). Decode-then-encode is
 *  idempotent: it produces a correct URL whether the input is already
 *  encoded or not. Without this, names containing spaces (e.g. "City 01")
 *  would double-encode to "City%2520" and break back-navigation. */
function buildHref(basePath: string, segments: string[], depth: number): string {
  if (depth === 0) return basePath;
  const encoded = segments
    .slice(0, depth)
    .map((s) => encodeURIComponent(decodeURIComponent(s)));
  return `${basePath}/${encoded.join('/')}`;
}

export default function InventoryBreadcrumb({
  pathSegments,
  config = DEFAULT_CHANNEL_CONFIG,
}: InventoryBreadcrumbProps) {
  // Breadcrumb items: root + one per segment
  const totalItems = pathSegments.length + 1; // +1 for the root crumb

  return (
    <nav aria-label="Inventory breadcrumb" className="flex items-center gap-1 flex-wrap mb-5">
      {/* Root item */}
      {totalItems === 1 ? (
        <span className="px-2.5 py-1 rounded-md text-sm font-medium bg-binny-navy text-white">
          {config.rootLabel}
        </span>
      ) : (
        <Link
          href={config.basePath}
          className="px-2.5 py-1 rounded-md text-sm text-brand-text-muted hover:text-brand-text-dark hover:bg-gray-100 transition-colors"
        >
          {config.rootLabel}
        </Link>
      )}

      {pathSegments.map((segment, idx) => {
        const isLast = idx === pathSegments.length - 1;
        const label = segmentLabel(decodeURIComponent(segment));
        return (
          <span key={idx} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-brand-text-muted shrink-0" />
            {isLast ? (
              <span className="px-2.5 py-1 rounded-md text-sm font-medium bg-binny-navy text-white">
                {label}
              </span>
            ) : (
              <Link
                href={buildHref(config.basePath, pathSegments, idx + 1)}
                className="px-2.5 py-1 rounded-md text-sm text-brand-text-muted hover:text-brand-text-dark hover:bg-gray-100 transition-colors"
              >
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
