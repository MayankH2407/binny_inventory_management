'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import DrillDownView from '@/components/inventory/InventoryDrillView';
import { CHANNEL_CONFIG } from '@/components/inventory/channelConfig';
import { ROUTES } from '@/constants';

/**
 * Sample Stock — root drill-down over boxes currently allocated to samples
 * (child_boxes.status = SAMPLE). Depths 1–6 are handled by the [...path]
 * catch-all route. Mirrors the main Inventory drill-down UI.
 */
export default function SampleInventoryPage() {
  return (
    <div>
      <Link
        href={ROUTES.SAMPLES}
        className="inline-flex items-center gap-1 text-sm text-brand-text-muted hover:text-brand-text-dark mb-3"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Samples
      </Link>

      <PageHeader
        title="Sample Stock"
        description="Drill down into stock currently allocated to samples by section, category, article, colour, and size"
      />
      <DrillDownView rawSegments={[]} config={CHANNEL_CONFIG.sample} />
    </div>
  );
}
