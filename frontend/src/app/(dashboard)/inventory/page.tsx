'use client';

import PageHeader from '@/components/layout/PageHeader';
import DrillDownView from '@/components/inventory/InventoryDrillView';
import LegacyUploadButton from '@/components/inventory/LegacyUploadButton';

/**
 * Root inventory page — shows the top-level section breakdown.
 * Drill-down for depths 1–6 is handled by the [[...path]] catch-all route.
 */
export default function InventoryPage() {
  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Drill down into stock levels by section, category, article, colour, and size"
        action={<LegacyUploadButton />}
      />
      <DrillDownView rawSegments={[]} />
    </div>
  );
}
