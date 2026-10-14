'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ScanLine, CheckCircle2, XCircle, Send, RotateCcw, Ban, Download,
  AlertTriangle, PackageX, PackageCheck, HelpCircle, Copy, MapPinOff,
} from 'lucide-react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import StatusBadge from '@/components/ui/StatusBadge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { SkeletonTable } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { ROUTES } from '@/constants';
import { stockReconciliationService } from '@/services/stockReconciliation.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime, formatCurrency } from '@/lib/utils';

export default function StockReconciliationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const userId = useAuthStore((s) => s.user?.id);
  const isAdmin = useAuthStore((s) => s.user?.role) === 'Admin';

  const canCount = useCan('stock_reconciliation:count');
  const canApprove = useCan('stock_reconciliation:approve');
  const canPost = useCan('stock_reconciliation:post');

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showPostConfirm, setShowPostConfirm] = useState(false);

  const { data: session, isLoading } = useApiQuery(['stock-reconciliation', id], () =>
    stockReconciliationService.getById(id)
  );
  const { data: progress } = useApiQuery(
    ['stock-reconciliation-progress', id],
    () => stockReconciliationService.getProgress(id),
    { enabled: !!session }
  );
  const { data: variance } = useApiQuery(
    ['stock-reconciliation-variance', id],
    () => stockReconciliationService.getVariance(id),
    // Live while counting too (refreshes every 15s) so the missing list is
    // visible without having to "Submit for Approval" — which locks the session.
    { enabled: !!session, refetchInterval: session?.status === 'COUNTING' ? 15000 : false }
  );

  const invalidate = [['stock-reconciliations'], ['stock-reconciliation', id], ['stock-reconciliation-progress', id], ['stock-reconciliation-variance', id], ['inventory-breakdown'], ['inventory-leaf'], ['inventory-stock-summary'], ['dashboard-stats']];

  const { mutate: submitSession, isPending: isSubmitting } = useApiMutation(
    () => stockReconciliationService.submit(id),
    { successMessage: 'Submitted for approval', invalidateKeys: invalidate }
  );
  const { mutate: cancelSession, isPending: isCancelling } = useApiMutation(
    () => stockReconciliationService.cancel(id),
    { successMessage: 'Session cancelled', invalidateKeys: invalidate }
  );
  const { mutate: approveSession, isPending: isApproving } = useApiMutation(
    () => stockReconciliationService.approve(id),
    { successMessage: 'Session approved', invalidateKeys: invalidate }
  );
  const { mutate: rejectSession, isPending: isRejecting } = useApiMutation(
    () => stockReconciliationService.reject(id, rejectReason),
    {
      successMessage: 'Session sent back for recount',
      invalidateKeys: invalidate,
      onSuccess: () => { setShowRejectModal(false); setRejectReason(''); },
    }
  );
  const { mutate: postSession, isPending: isPosting } = useApiMutation(
    () => stockReconciliationService.post(id),
    { successMessage: 'Stock corrections posted', invalidateKeys: invalidate, onSuccess: () => setShowPostConfirm(false) }
  );
  const { mutate: recountSession, isPending: isRecounting } = useApiMutation(
    () => stockReconciliationService.recount(id),
    {
      successMessage: 'New recount session opened',
      invalidateKeys: [['stock-reconciliations']],
      onSuccess: (newSession) => router.push(ROUTES.STOCK_RECONCILIATION_DETAIL(newSession.id)),
    }
  );

  const handleExport = async () => {
    try {
      const blob = await stockReconciliationService.exportVarianceCsv(id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stock-reconciliation-${session?.session_code || id}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      toast.error('Export failed');
    }
  };

  if (isLoading || !session) {
    return (
      <div>
        <PageHeader title="Stock Verification Session" />
        <SkeletonTable />
      </div>
    );
  }

  const missingBoxCount = variance?.missing_boxes.length ?? 0;
  const missingLegacyCount = variance?.missing_legacy_cartons.length ?? 0;
  const foundAgainCount = variance?.found_again.length ?? 0;
  const isCounting = session.status === 'COUNTING';
  // Admin may always approve; other roles must differ from whoever counted/submitted.
  const isSameUser = !isAdmin && (session.created_by === userId || session.submitted_by === userId);

  return (
    <div>
      <PageHeader
        title={session.session_code}
        description={
          [session.scope?.section, session.scope?.category, session.scope?.article_group].filter(Boolean).join(' / ') ||
          'Full warehouse scope'
        }
        action={<StatusBadge status={session.status} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader>Progress</CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-brand-text-dark">{progress?.expected_total ?? '—'}</p>
                <p className="text-xs text-brand-text-muted">Expected</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{progress?.found_total ?? '—'}</p>
                <p className="text-xs text-brand-text-muted">Found</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{missingBoxCount + missingLegacyCount || '—'}</p>
                <p className="text-xs text-brand-text-muted">Missing so far</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{foundAgainCount || 0}</p>
                <p className="text-xs text-brand-text-muted">Found again</p>
              </div>
            </div>
            {session.notes && <p className="mt-4 text-sm text-brand-text-muted italic">{session.notes}</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>Timeline</CardHeader>
          <CardBody>
            <ul className="space-y-2 text-xs">
              <li><span className="font-medium">Opened</span> by {session.created_by_name} — {formatDateTime(session.created_at)}</li>
              {session.submitted_at && <li><span className="font-medium">Submitted</span> by {session.submitted_by_name} — {formatDateTime(session.submitted_at)}</li>}
              {session.approved_at && <li><span className="font-medium">Approved</span> by {session.approved_by_name} — {formatDateTime(session.approved_at)}</li>}
              {session.rejected_at && <li><span className="font-medium">Rejected</span> by {session.rejected_by_name} — {formatDateTime(session.rejected_at)}{session.rejection_reason ? `: ${session.rejection_reason}` : ''}</li>}
              {session.posted_at && <li><span className="font-medium">Posted</span> by {session.posted_by_name} — {formatDateTime(session.posted_at)}</li>}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        {session.status === 'COUNTING' && canCount && (
          <>
            <Link href={ROUTES.STOCK_RECONCILIATION_COUNT(session.id)}>
              <Button leftIcon={<ScanLine className="h-4 w-4" />}>Go to Counting</Button>
            </Link>
            <Button variant="secondary" leftIcon={<Send className="h-4 w-4" />} isLoading={isSubmitting} onClick={() => submitSession(undefined as void)}>
              Submit for Approval
            </Button>
            <Button variant="ghost" leftIcon={<Ban className="h-4 w-4" />} isLoading={isCancelling} onClick={() => cancelSession(undefined as void)}>
              Cancel Session
            </Button>
          </>
        )}
        {session.status === 'SUBMITTED' && canApprove && (
          <>
            <Button
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
              isLoading={isApproving}
              disabled={isSameUser}
              title={isSameUser ? 'You counted or submitted this session — a different user must approve it' : undefined}
              onClick={() => approveSession(undefined as void)}
            >
              Approve
            </Button>
            <Button variant="danger" leftIcon={<XCircle className="h-4 w-4" />} onClick={() => setShowRejectModal(true)}>
              Reject
            </Button>
            {isSameUser && (
              <span className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> A different user must approve this session</span>
            )}
          </>
        )}
        {session.status === 'APPROVED' && canPost && (
          <Button leftIcon={<PackageCheck className="h-4 w-4" />} onClick={() => setShowPostConfirm(true)}>
            Post Corrections
          </Button>
        )}
        {session.status === 'REJECTED' && canCount && (
          <Button leftIcon={<RotateCcw className="h-4 w-4" />} isLoading={isRecounting} onClick={() => recountSession(undefined as void)}>
            Open Recount
          </Button>
        )}
        <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />} onClick={handleExport}>
          Export {isCounting ? 'Live ' : ''}Variance CSV
        </Button>
      </div>

      {isCounting && variance && (
        <p className="text-sm text-brand-text-muted mb-4">
          Live view — updates every 15 seconds while counting. Items still listed as missing have not been scanned yet; the session stays open for scanning.
        </p>
      )}

      {variance && (
        <div className="space-y-6">
          <Card padding={false}>
            <CardHeader className="px-6 pt-6">Variance by SKU</CardHeader>
            <Table>
              <TableHead>
                <tr>
                  <TableHeader>SKU</TableHeader>
                  <TableHeader>Article</TableHeader>
                  <TableHeader>Colour / Size</TableHeader>
                  <TableHeader className="text-right">Expected</TableHeader>
                  <TableHeader className="text-right">Physical</TableHeader>
                  <TableHeader className="text-right">Variance</TableHeader>
                  <TableHeader className="text-right">Value Impact</TableHeader>
                </tr>
              </TableHead>
              <TableBody>
                {variance.sku_summary.map((row) => {
                  const diff = row.physical_qty - row.expected_qty;
                  return (
                    <TableRow key={row.product_id}>
                      <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                      <TableCell>{row.article_name}</TableCell>
                      <TableCell>{row.colour} / {row.size}</TableCell>
                      <TableCell className="text-right">{row.expected_qty}</TableCell>
                      <TableCell className="text-right">{row.physical_qty}</TableCell>
                      <TableCell className={`text-right font-semibold ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </TableCell>
                      <TableCell className="text-right">{row.mrp != null ? formatCurrency(Math.abs(diff) * row.mrp) : '—'}</TableCell>
                    </TableRow>
                  );
                })}
                {variance.sku_summary.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-brand-text-muted py-8">No expected stock in this scope.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          <VarianceListSection
            icon={<PackageX className="h-4 w-4" />}
            title={`${isCounting ? 'Not yet scanned' : 'Missing'} boxes (${missingBoxCount})`}
            empty="Nothing missing among individually-tracked boxes."
          >
            {variance.missing_boxes.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm py-1.5 border-b border-brand-border last:border-0">
                <span className="font-mono text-xs">{b.barcode}</span>
                <span className="text-brand-text-muted">{b.article_name} — {b.colour} / {b.size}</span>
              </div>
            ))}
          </VarianceListSection>

          {variance.missing_legacy_cartons.length > 0 && (
            <VarianceListSection icon={<PackageX className="h-4 w-4" />} title={`${isCounting ? 'Not yet scanned' : 'Missing'} legacy cartons (${missingLegacyCount})`} empty="">
              {variance.missing_legacy_cartons.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-brand-border last:border-0">
                  <span className="font-mono text-xs">{c.carton_barcode}</span>
                  <span className="text-brand-text-muted">{c.article_group || '—'} {c.legacy_pairs != null ? `— ${c.legacy_pairs} pairs` : ''}</span>
                </div>
              ))}
            </VarianceListSection>
          )}

          {variance.found_again.length > 0 && (
            <VarianceListSection icon={<PackageCheck className="h-4 w-4" />} title={`Found again (${foundAgainCount})`} empty="">
              {variance.found_again.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-brand-border last:border-0">
                  <span className="font-mono text-xs">{f.box_barcode || f.carton_barcode}</span>
                  <Badge variant="green" size="sm">Was marked missing — will be restored on post</Badge>
                </div>
              ))}
            </VarianceListSection>
          )}

          {variance.conflicts.length > 0 && (
            <VarianceListSection icon={<AlertTriangle className="h-4 w-4" />} title={`Status conflicts — never auto-corrected (${variance.conflicts.length})`} empty="">
              {variance.conflicts.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-brand-border last:border-0">
                  <span className="font-mono text-xs">{c.box_barcode || c.carton_barcode}</span>
                  <span className="text-brand-text-muted">System shows {c.box_status || c.carton_status} — investigate before touching</span>
                </div>
              ))}
            </VarianceListSection>
          )}

          {variance.out_of_scope.length > 0 && (
            <VarianceListSection icon={<MapPinOff className="h-4 w-4" />} title={`Scanned but out of scope (${variance.out_of_scope.length})`} empty="">
              {variance.out_of_scope.map((s, i) => (
                <div key={i} className="text-sm py-1.5 border-b border-brand-border last:border-0 font-mono text-xs">{s.raw_payload}</div>
              ))}
            </VarianceListSection>
          )}

          {variance.unknown.length > 0 && (
            <VarianceListSection icon={<HelpCircle className="h-4 w-4" />} title={`Unrecognized codes (${variance.unknown.length})`} empty="">
              {variance.unknown.map((s, i) => (
                <div key={i} className="text-sm py-1.5 border-b border-brand-border last:border-0 font-mono text-xs">{s.raw_payload}</div>
              ))}
            </VarianceListSection>
          )}

          {variance.duplicates.length > 0 && (
            <VarianceListSection icon={<Copy className="h-4 w-4" />} title={`Duplicate scans (${variance.duplicates.length})`} empty="">
              {variance.duplicates.map((s, i) => (
                <div key={i} className="text-sm py-1.5 border-b border-brand-border last:border-0 font-mono text-xs">{s.raw_payload}</div>
              ))}
            </VarianceListSection>
          )}
        </div>
      )}

      <Modal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Reject this session"
        description="It goes back for a fresh recount — counted numbers are never hand-edited."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowRejectModal(false)}>Cancel</Button>
            <Button variant="danger" isLoading={isRejecting} disabled={!rejectReason.trim()} onClick={() => rejectSession(undefined as void)}>
              Reject Session
            </Button>
          </>
        }
      >
        <textarea
          className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm text-brand-text-dark placeholder:text-brand-text-muted focus:outline-none focus:ring-2 focus:ring-binny-navy/30 focus:border-binny-navy"
          rows={4}
          maxLength={1000}
          placeholder="Why is this being sent back for a recount?"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>

      <Modal
        isOpen={showPostConfirm}
        onClose={() => setShowPostConfirm(false)}
        title="Post stock corrections"
        description="This is the only step that changes system stock. Every change is logged with a full audit trail."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPostConfirm(false)}>Cancel</Button>
            <Button isLoading={isPosting} onClick={() => postSession(undefined as void)}>Confirm & Post</Button>
          </>
        }
      >
        <ul className="text-sm space-y-1.5">
          <li>• <strong>{missingBoxCount}</strong> box(es) and <strong>{missingLegacyCount}</strong> legacy carton(s) will be marked <Badge variant="red" size="sm">Missing</Badge></li>
          <li>• <strong>{foundAgainCount}</strong> previously-missing item(s) will be restored to stock</li>
          <li>• Conflicts (e.g. dispatched items found here) are reported only — never auto-corrected</li>
        </ul>
      </Modal>
    </div>
  );
}

function VarianceListSection({ icon, title, empty, children }: { icon: React.ReactNode; title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2">
          {icon}
          <span>{title}</span>
        </span>
      </CardHeader>
      <CardBody>
        {hasChildren ? children : <p className="text-sm text-brand-text-muted">{empty}</p>}
      </CardBody>
    </Card>
  );
}
