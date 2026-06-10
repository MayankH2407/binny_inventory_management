'use client';

import { useParams } from 'next/navigation';
import PageHeader from '@/components/layout/PageHeader';
import DrillDownView, { LeafPlaceholder } from '@/components/inventory/InventoryDrillView';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryDrillPage() {
  const params = useParams();
  // In Next.js 14 App Router, catch-all params are string[].
  // The param key matches the folder name: "[...path]" → params.path
  const rawSegments = Array.isArray(params.path) ? params.path : [];
  const depth = rawSegments.length;

  // Level 6 = leaf (size_group is level 5; beyond that is the detail table)
  const isLeaf = depth >= 6;

  // Page title: use last decoded segment
  const lastSegment =
    rawSegments.length > 0
      ? decodeURIComponent(rawSegments[rawSegments.length - 1]) || '(Ungrouped)'
      : null;
  const pageTitle = lastSegment ? `Inventory › ${lastSegment}` : 'Inventory';

  return (
    <div>
      <PageHeader
        title={pageTitle}
        description="Drill down into stock levels by category, article, colour, and size"
      />

      {isLeaf ? (
        <LeafPlaceholder rawSegments={rawSegments} />
      ) : (
        <DrillDownView rawSegments={rawSegments} />
      )}
    </div>
  );
}
