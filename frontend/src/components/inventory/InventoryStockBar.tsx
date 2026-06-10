'use client';

// ─── InventoryStockBar ────────────────────────────────────────────────────────
// A 4px-tall horizontal stacked bar showing packed vs loose split for a card.
// Packed = child_box_count - loose_child_box_count  (box units, not pieces)
// Loose  = loose_child_box_count

interface InventoryStockBarProps {
  childBoxCount: number;
  looseChildBoxCount: number;
}

export default function InventoryStockBar({
  childBoxCount,
  looseChildBoxCount,
}: InventoryStockBarProps) {
  const packed = Math.max(0, childBoxCount - looseChildBoxCount);
  const loose = Math.max(0, looseChildBoxCount);
  const total = packed + loose;

  // Omit the bar entirely if both counts are 0
  if (total === 0) return null;

  const packedPct = (packed / total) * 100;
  const loosePct = (loose / total) * 100;

  const title = `${packed} packed, ${loose} loose`;

  return (
    <div className="px-4 pb-2.5" title={title} aria-label={title}>
      <div className="flex h-1 rounded-full overflow-hidden bg-gray-100">
        {packed > 0 && (
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${packedPct}%` }}
          />
        )}
        {loose > 0 && (
          <div
            className="h-full bg-amber-400 transition-all duration-300"
            style={{ width: `${loosePct}%` }}
          />
        )}
      </div>
      <div className="flex items-center gap-3 mt-1">
        {packed > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-brand-text-muted">
            <span className="inline-block w-2 h-2 rounded-sm bg-blue-500" />
            {packed} packed
          </span>
        )}
        {loose > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-brand-text-muted">
            <span className="inline-block w-2 h-2 rounded-sm bg-amber-400" />
            {loose} loose
          </span>
        )}
      </div>
    </div>
  );
}
