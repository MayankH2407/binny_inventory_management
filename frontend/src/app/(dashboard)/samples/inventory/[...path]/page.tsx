'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import DrillDownView, { LeafPlaceholder } from '@/components/inventory/InventoryDrillView';
import { CHANNEL_CONFIG } from '@/components/inventory/channelConfig';
import { ROUTES } from '@/constants';

export default function SampleInventoryDrillPage() {
  const params = useParams();
  const rawSegments = Array.isArray(params.path) ? params.path : [];
  const depth = rawSegments.length;
  const isLeaf = depth >= 6;

  const lastSegment =
    rawSegments.length > 0
      ? decodeURIComponent(rawSegments[rawSegments.length - 1]) || '(Ungrouped)'
      : null;
  const pageTitle = lastSegment ? `Sample Stock › ${lastSegment}` : 'Sample Stock';

  return (
    <div>
      <Link
        href={ROUTES.SAMPLES}
        className="inline-flex items-center gap-1 text-sm text-brand-text-muted hover:text-brand-text-dark mb-3"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Samples
      </Link>

      <PageHeader
        title={pageTitle}
        description="Drill down into stock currently allocated to samples by category, article, colour, and size"
      />

      {isLeaf ? (
        <LeafPlaceholder rawSegments={rawSegments} config={CHANNEL_CONFIG.sample} />
      ) : (
        <DrillDownView rawSegments={rawSegments} config={CHANNEL_CONFIG.sample} />
      )}
    </div>
  );
}
