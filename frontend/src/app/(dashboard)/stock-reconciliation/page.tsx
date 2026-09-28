'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Plus, PackageSearch } from 'lucide-react';
import { keepPreviousData } from '@tanstack/react-query';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import { SkeletonTable } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { PAGE_SIZE, ROUTES, PRODUCT_SECTIONS, PRODUCT_CATEGORIES } from '@/constants';
import { stockReconciliationService } from '@/services/stockReconciliation.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { formatDateTime } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'COUNTING', label: 'Counting' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'POSTED', label: 'Posted' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export default function StockReconciliationPage() {
  const router = useRouter();
  const canCount = useCan('stock_reconciliation:count');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [section, setSection] = useState('');
  const [category, setCategory] = useState('');
  const [articleGroup, setArticleGroup] = useState('');
  const [notes, setNotes] = useState('');

  const { data, isLoading } = useApiQuery(
    ['stock-reconciliations', String(page), status],
    () => stockReconciliationService.getAll({ page, limit: PAGE_SIZE, status: status || undefined }),
    { placeholderData: keepPreviousData }
  );

  const { mutate: openSession, isPending: isOpening } = useApiMutation(
    () =>
      stockReconciliationService.open({
        scope: {
          section: section || undefined,
          category: category || undefined,
          article_group: articleGroup || undefined,
        },
        notes: notes || undefined,
      }),
    {
      successMessage: 'Session opened',
      invalidateKeys: [['stock-reconciliations']],
      onSuccess: (session) => router.push(ROUTES.STOCK_RECONCILIATION_DETAIL(session.id)),
    }
  );

  return (
    <div>
      <PageHeader
        title="Stock Verification"
        description="Count physical stock against system records and post corrections after review"
        action={
          canCount ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowOpenModal(true)}>
              New Session
            </Button>
          ) : undefined
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-brand-border bg-binny-navy-50/50 flex flex-col sm:flex-row gap-3">
          <Select
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="sm:w-56"
          />
        </div>

        {isLoading ? (
          <div className="p-4">
            <SkeletonTable />
          </div>
        ) : !data?.data?.length ? (
          <div className="p-12 text-center">
            <PackageSearch className="h-12 w-12 mx-auto mb-3 text-brand-text-muted opacity-40" />
            <p className="text-brand-text-muted">No reconciliation sessions yet.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-brand-border">
              {data.data.map((session) => (
                <Link
                  key={session.id}
                  href={ROUTES.STOCK_RECONCILIATION_DETAIL(session.id)}
                  className="block p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-brand-text-dark">{session.session_code}</span>
                        <StatusBadge status={session.status} size="sm" />
                        {session.recount_of_session_id && (
                          <span className="text-xs text-brand-text-muted">Recount</span>
                        )}
                      </div>
                      <p className="text-sm text-brand-text-dark">
                        {[session.scope?.section, session.scope?.category, session.scope?.article_group]
                          .filter(Boolean)
                          .join(' / ') || 'Full warehouse'}
                      </p>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        {session.expected_count ?? 0} expected · {session.scanned_count ?? 0} found
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-brand-text-muted">{formatDateTime(session.created_at)}</p>
                      {session.created_by_name && (
                        <p className="text-xs text-brand-text-muted mt-0.5">by {session.created_by_name}</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {data && data.totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-brand-border gap-3">
                <p className="text-sm text-brand-text-muted">
                  Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, data.total)} of {data.total}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <span className="text-sm text-brand-text-muted px-2">
                    Page {page} of {data.totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === data.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Modal
        isOpen={showOpenModal}
        onClose={() => setShowOpenModal(false)}
        title="Open a Stock Verification Session"
        description="Leave a filter blank to cover the whole warehouse. Items outside this scope are never marked missing."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowOpenModal(false)}>
              Cancel
            </Button>
            <Button isLoading={isOpening} leftIcon={<ClipboardCheck className="h-4 w-4" />} onClick={() => openSession(undefined as void)}>
              Open Session
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Section"
            placeholder="All sections"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            options={PRODUCT_SECTIONS.map((s) => ({ value: s, label: s }))}
          />
          <Select
            label="Category"
            placeholder="All categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
          <Input
            label="Article group (optional)"
            placeholder="e.g. a specific article group"
            value={articleGroup}
            onChange={(e) => setArticleGroup(e.target.value)}
          />
          <Input
            label="Notes (optional)"
            placeholder="e.g. monthly count — Hawaii section"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
