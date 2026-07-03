'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import DrillDownView, { LeafPlaceholder } from '@/components/inventory/InventoryDrillView';
import { CHANNEL_CONFIG } from '@/components/inventory/channelConfig';
import { ROUTES } from '@/constants';
import { useCan } from '@/hooks/useCan';

export default function EcommerceStockDrillPage() {
  const canRead = useCan('ecommerce:read');
  const params = useParams();
  const rawSegments = Array.isArray(params.path) ? params.path : [];
  const depth = rawSegments.length;
  const isLeaf = depth >= 6;

  const lastSegment =
    rawSegments.length > 0
      ? decodeURIComponent(rawSegments[rawSegments.length - 1]) || '(Ungrouped)'
      : null;
  const pageTitle = lastSegment ? `E-commerce Stock › ${lastSegment}` : 'E-commerce Stock';

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <ShoppingCart className="h-16 w-16 text-brand-text-muted/20 mb-4" />
        <h2 className="text-lg font-semibold text-brand-text-dark mb-2">Access Denied</h2>
        <p className="text-brand-text-muted">You do not have permission to view e-commerce stock.</p>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={ROUTES.ECOMMERCE}
        className="inline-flex items-center gap-1 text-sm text-brand-text-muted hover:text-brand-text-dark mb-3"
      >
        <ArrowLeft className="h-4 w-4" /> Back to E-commerce
      </Link>

      <PageHeader
        title={pageTitle}
        description="Drill down into stock currently allocated to e-commerce by category, article, colour, and size"
      />

      {isLeaf ? (
        <LeafPlaceholder rawSegments={rawSegments} config={CHANNEL_CONFIG.ecommerce} />
      ) : (
        <DrillDownView rawSegments={rawSegments} config={CHANNEL_CONFIG.ecommerce} />
      )}
    </div>
  );
}
