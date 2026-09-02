'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  PackageOpen,
  ScanLine,
  Copy,
  Trash2,
  BarChart3,
  Boxes,
  Printer,
  MoreVertical,
  Undo2,
  X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import StatusBadge from '@/components/ui/StatusBadge';
import Badge from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/layout/PageHeader';
import QRScanner from '@/components/scanning/QRScanner';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import { ROUTES } from '@/constants';
import { sampleService } from '@/services/sample.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import { printSampleLabel } from '@/lib/sampleLabel';
import { sampleStatusLabel, sampleStatusVariant } from '@/lib/sampleStatus';
import type { SampleItem, Foot } from '@/types';
import toast from 'react-hot-toast';

const INVALIDATE_KEYS = (id: string) => [
  ['sample', id],
  ['sample-assortment', id],
  ['samples'],
  ['samples-summary'],
  ['child-boxes'],
  ['master-cartons'],
  ['inventory-breakdown'],
  ['inventory-leaf'],
  ['inventory-stock-summary'],
  ['dashboard-stats'],
];

export default function SampleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const canUpdate = useCan('samples:update');
  const canDelete = useCan('samples:delete');

  const [showScanner, setShowScanner] = useState(false);
  const [fullScreenScan, setFullScreenScan] = useState(false);
  const [scanFoot, setScanFoot] = useState<Foot>('PAIR');
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [unpackTarget, setUnpackTarget] = useState<SampleItem | null>(null);
  const [removeTarget, setRemoveTarget] = useState<SampleItem | null>(null);
  const [splittingMappingId, setSplittingMappingId] = useState<string | null>(null);

  const { data: sample, isLoading } = useApiQuery(['sample', id], () => sampleService.getById(id));
  const { data: assortment } = useApiQuery(
    ['sample-assortment', id],
    () => sampleService.getAssortment(id),
    { enabled: !!sample }
  );

  const invalidateKeys = INVALIDATE_KEYS(id);

  const { mutate: scanItem, isPending: isScanning } = useApiMutation(
    (barcode: string) => sampleService.scan(id, { barcode, foot: scanFoot }),
    {
      invalidateKeys,
      onSuccess: (result) => {
        const message =
          result.item_type === 'CARTON'
            ? `Added carton ${result.barcode} (${result.boxes_added} box${result.boxes_added === 1 ? '' : 'es'}) to this sample`
            : `Added box ${result.barcode}${result.foot !== 'PAIR' ? ` (${result.foot.toLowerCase()} shoe)` : ''} to this sample`;
        toast.success(message);
      },
    }
  );

  const { mutate: unpackCarton, isPending: isUnpacking } = useApiMutation(
    (mappingId: string) => sampleService.unpackCarton(id, mappingId),
    {
      invalidateKeys,
      onSuccess: (result) => {
        toast.success(`Carton ${result.carton_barcode} unpacked into ${result.boxes_unpacked} loose box${result.boxes_unpacked === 1 ? '' : 'es'}`);
        setUnpackTarget(null);
      },
    }
  );

  const { mutate: removeItem, isPending: isRemoving } = useApiMutation(
    (vars: { item_type: 'BOX' | 'CARTON'; mapping_id: string }) => sampleService.remove(id, vars),
    {
      invalidateKeys,
      onSuccess: (result) => {
        toast.success(`${result.item_type === 'CARTON' ? 'Carton' : 'Box'} ${result.barcode} removed from this sample`);
        setRemoveTarget(null);
      },
    }
  );

  const { mutate: setFoot } = useApiMutation(
    (vars: { mapping_id: string; foot: Foot }) => sampleService.setFoot(id, vars),
    {
      invalidateKeys,
      onSuccess: () => setSplittingMappingId(null),
    }
  );

  const { mutate: clearSample, isPending: isClearing } = useApiMutation(
    () => sampleService.clear(id),
    {
      invalidateKeys,
      onSuccess: (result) => {
        toast.success(`Cleared ${result.released_boxes} box(es) and ${result.released_cartons} carton(s) back to stock`);
        setShowClearConfirm(false);
        setOverflowOpen(false);
      },
    }
  );

  const { mutate: deleteSample, isPending: isDeleting } = useApiMutation(
    () => sampleService.delete(id),
    {
      successMessage: 'Sample deleted',
      invalidateKeys: [['samples'], ['samples-summary']],
      onSuccess: () => router.push(ROUTES.SAMPLES),
    }
  );

  const handleCopyBarcode = () => {
    if (sample?.sample_barcode) {
      navigator.clipboard.writeText(sample.sample_barcode);
      toast.success('Barcode copied');
    }
  };

  if (isLoading) return <PageSpinner />;

  if (!sample) {
    return (
      <div className="text-center py-12">
        <p className="text-brand-text-muted">Sample not found.</p>
      </div>
    );
  }

  const items = sample.items ?? [];
  const looseBoxes = items.filter((i): i is SampleItem & { item_type: 'BOX' } => i.item_type === 'BOX');
  const cartonItems = items.filter((i): i is SampleItem & { item_type: 'CARTON' } => i.item_type === 'CARTON');
  const state = sample.state ?? 'EMPTY';
  const totalAssortmentQty = assortment?.reduce((sum, item) => sum + item.count, 0) || 0;
  const canDeleteThis = canDelete && state === 'EMPTY' && !sample.shipped_box_count;

  return (
    <div>
      <PageHeader
        title={`Sample: ${sample.sample_barcode}`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={() => printSampleLabel(sample)} leftIcon={<Printer className="h-4 w-4" />}>
              Print Label
            </Button>
            <div className="relative">
              <Button variant="ghost" size="sm" onClick={() => setOverflowOpen(!overflowOpen)}>
                <MoreVertical className="h-4 w-4" />
              </Button>
              {overflowOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOverflowOpen(false)} />
                  <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-brand-border z-20 py-1">
                    <button
                      onClick={() => {
                        handleCopyBarcode();
                        setOverflowOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-brand-text-dark hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy Barcode
                    </button>
                    {canUpdate && items.length > 0 && (
                      <button
                        onClick={() => {
                          setShowClearConfirm(true);
                          setOverflowOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-brand-error hover:bg-red-50 flex items-center gap-2"
                      >
                        <PackageOpen className="h-3.5 w-3.5" /> Empty Sample
                      </button>
                    )}
                    {canDeleteThis && (
                      <button
                        onClick={() => {
                          setShowDeleteConfirm(true);
                          setOverflowOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-brand-error hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete Sample
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            <Link href={ROUTES.SAMPLES}>
              <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Back
              </Button>
            </Link>
          </div>
        }
      />

      {/* Status / Timeline cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Status</p>
          <StatusBadge status={state} label={sampleStatusLabel(state)} variant={sampleStatusVariant(state)} />
          <p className="mt-2 text-sm font-medium text-brand-text-dark">{sample.name || '(unnamed)'}</p>
          <p className="text-sm font-bold text-brand-text-dark mt-2">
            {sample.open_box_count ?? 0} box{(sample.open_box_count ?? 0) === 1 ? '' : 'es'} currently in this sample
          </p>
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Timeline</p>
          <p className="text-xs text-brand-text-muted">
            <span className="font-medium text-brand-text-dark">Created:</span> {formatDateTime(sample.created_at)}
            {sample.creator_name ? ` by ${sample.creator_name}` : ''}
          </p>
          {sample.last_dispatch_date && (
            <p className="text-xs text-brand-text-muted mt-1">
              <span className="font-medium text-brand-text-dark">Last dispatch:</span> {formatDateTime(sample.last_dispatch_date)}
              {sample.shipped_box_count ? ` (${sample.shipped_box_count} box${sample.shipped_box_count === 1 ? '' : 'es'} sent total)` : ''}
            </p>
          )}
          <p className="text-xs text-brand-text-muted mt-2 italic">
            Recipient, purpose, and reference date are captured when you dispatch this sample, not here.
          </p>
        </Card>
      </div>

      {/* Scan card */}
      {canUpdate && (
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg" style={{ backgroundColor: '#F3F0FF' }}>
              <ScanLine className="h-4 w-4 text-purple-600" />
            </div>
            <h3 className="font-semibold text-brand-text-dark">Scan Into This Sample</h3>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mb-3">
            <span className="text-xs text-brand-text-muted whitespace-nowrap">For a loose box, send:</span>
            <div className="flex gap-1.5">
              {(['PAIR', 'LEFT', 'RIGHT'] as Foot[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setScanFoot(f)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border ${
                    scanFoot === f
                      ? 'border-binny-navy bg-binny-navy-50 text-binny-navy'
                      : 'border-brand-border bg-white text-brand-text-muted hover:bg-gray-50'
                  }`}
                >
                  {f === 'PAIR' ? 'Whole Pair' : f === 'LEFT' ? 'Left Shoe' : 'Right Shoe'}
                </button>
              ))}
            </div>
          </div>

          <HIDScannerInput
            onScan={(code) => scanItem(code)}
            placeholder="Scan a child box or master carton barcode..."
            autoFocus
            disabled={isScanning}
          />
          <div className="mt-4 pt-4 border-t border-brand-border">
            <Button
              variant={showScanner ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowScanner(!showScanner)}
              leftIcon={<ScanLine className="h-4 w-4" />}
            >
              {showScanner ? 'Hide Camera' : 'Use Camera Instead'}
            </Button>
          </div>
          {showScanner && (
            <div className="mt-4">
              <QRScanner
                onScanSuccess={(code) => scanItem(code)}
                autoStart
                fullScreen={fullScreenScan}
                onToggleFullScreen={() => setFullScreenScan(!fullScreenScan)}
              />
            </div>
          )}
        </Card>
      )}

      {/* Assortment Summary */}
      {assortment && assortment.length > 0 && (
        <Card padding={false} className="mb-6">
          <div className="p-4 border-b border-brand-border">
            <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Assortment Summary
            </h3>
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Article</TableHeader>
                  <TableHeader>Colour</TableHeader>
                  <TableHeader>Size</TableHeader>
                  <TableHeader>MRP</TableHeader>
                  <TableHeader className="text-right">Qty</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {assortment.map((item) => (
                  <TableRow key={`${item.article_name}-${item.colour}-${item.size}`}>
                    <TableCell className="font-medium">{item.article_name}</TableCell>
                    <TableCell>{item.colour}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell>{formatCurrency(item.mrp)}</TableCell>
                    <TableCell className="text-right font-bold">{item.count}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} className="font-bold text-brand-text-dark">Total</TableCell>
                  <TableCell className="text-right font-bold text-brand-text-dark">{totalAssortmentQty}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div className="block md:hidden divide-y divide-brand-border">
            {assortment.map((item) => (
              <div key={`${item.article_name}-${item.colour}-${item.size}`} className="p-4">
                <p className="text-sm font-medium">{item.article_name}</p>
                <div className="flex gap-3 text-xs text-brand-text-muted mt-1">
                  <span>{item.colour}</span>
                  <span>Size {item.size}</span>
                  <span>{formatCurrency(item.mrp)}</span>
                </div>
                <p className="text-sm font-bold mt-1">Qty: {item.count}</p>
              </div>
            ))}
            <div className="p-4 bg-gray-50">
              <p className="text-sm font-bold text-brand-text-dark">Total: {totalAssortmentQty} Prs</p>
            </div>
          </div>
        </Card>
      )}

      {/* Contents */}
      <Card padding={false}>
        <div className="p-4 border-b border-brand-border">
          <h3 className="font-semibold text-brand-text-dark">Contents ({items.length})</h3>
        </div>

        {items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-brand-text-muted">Nothing in this sample yet. Scan a box or carton above.</p>
          </div>
        ) : (
          <div className="divide-y divide-brand-border">
            {cartonItems.map((carton) => (
              <div key={carton.mapping_id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Boxes className="h-4 w-4 text-binny-navy shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-text-dark">
                        Carton {carton.barcode} — {carton.box_count} box{carton.box_count === 1 ? '' : 'es'}, reserved whole
                      </p>
                      {(carton.article_summary || carton.colour_summary || carton.size_summary) && (
                        <p className="text-xs text-brand-text-muted mt-0.5">
                          {[carton.article_summary, carton.colour_summary, carton.size_summary].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  {canUpdate && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUnpackTarget(carton)}
                        leftIcon={<PackageOpen className="h-3.5 w-3.5" />}
                      >
                        Unpack
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoveTarget(carton)}
                        leftIcon={<X className="h-3.5 w-3.5" />}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {looseBoxes.length > 0 && (
              <div>
                {cartonItems.length > 0 && (
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
                      Individual boxes ({looseBoxes.length})
                    </p>
                  </div>
                )}
                <div className="divide-y divide-brand-border">
                  {looseBoxes.map((box, index) => {
                    const isSplitting = splittingMappingId === box.mapping_id;
                    return (
                      <div key={box.mapping_id} className="flex items-center justify-between p-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="text-xs font-medium text-brand-text-muted w-6 pt-0.5">{index + 1}.</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              <span className="font-mono text-xs text-brand-text-dark">{box.barcode}</span>
                              {box.article_summary && (
                                <span className="text-sm font-medium text-brand-text-dark">{box.article_summary}</span>
                              )}
                              {box.colour_summary && <span className="text-xs text-brand-text-muted">{box.colour_summary}</span>}
                              {box.size_summary && <span className="text-xs text-brand-text-muted">Size {box.size_summary}</span>}
                              {box.mrp != null && <span className="text-xs text-brand-text-muted">{formatCurrency(box.mrp)}</span>}
                              {box.source_carton_barcode && (
                                <span className="text-[11px] text-brand-text-muted">[from {box.source_carton_barcode}]</span>
                              )}
                            </div>

                            {canUpdate && (
                              <>
                                {isSplitting ? (
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-xs text-brand-text-muted">Which shoe?</span>
                                    <button
                                      type="button"
                                      onClick={() => setFoot({ mapping_id: box.mapping_id, foot: 'LEFT' })}
                                      className="px-2 py-0.5 rounded text-[11px] font-medium border border-brand-border bg-white hover:bg-gray-100"
                                    >
                                      Left
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setFoot({ mapping_id: box.mapping_id, foot: 'RIGHT' })}
                                      className="px-2 py-0.5 rounded text-[11px] font-medium border border-brand-border bg-white hover:bg-gray-100"
                                    >
                                      Right
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setSplittingMappingId(null)}
                                      className="text-[11px] text-brand-text-muted hover:text-brand-text-dark"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : box.foot !== 'PAIR' ? (
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700">
                                      {box.foot === 'LEFT' ? 'Left' : 'Right'} shoe only
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setFoot({ mapping_id: box.mapping_id, foot: 'PAIR' })}
                                      title="Undo — send as a whole pair"
                                      className="p-0.5 rounded text-brand-text-muted hover:text-brand-text-dark"
                                    >
                                      <Undo2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setSplittingMappingId(box.mapping_id)}
                                    className="text-[11px] text-brand-text-muted hover:text-brand-text-dark underline decoration-dotted mt-1"
                                  >
                                    Send one shoe only
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {canUpdate && (
                          <button
                            onClick={() => setRemoveTarget(box)}
                            disabled={isRemoving}
                            className="p-1 rounded text-brand-text-muted hover:text-brand-error hover:bg-red-50 transition-colors shrink-0"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Unpack confirmation */}
      <Modal
        isOpen={unpackTarget !== null}
        onClose={() => setUnpackTarget(null)}
        title="Unpack Carton"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnpackTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              isLoading={isUnpacking}
              leftIcon={<PackageOpen className="h-4 w-4" />}
              onClick={() => unpackTarget && unpackCarton(unpackTarget.mapping_id)}
            >
              Confirm Unpack
            </Button>
          </>
        }
      >
        {unpackTarget && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              Unpack carton <strong className="font-mono">{unpackTarget.barcode}</strong>? All{' '}
              <strong>{unpackTarget.box_count}</strong> boxes become individually-trackable loose items in this
              sample (each foot-splittable), and the carton itself becomes empty and available for repacking. This
              is all-or-nothing — there is no way to take out just some of the boxes.
            </p>
          </div>
        )}
      </Modal>

      {/* Remove confirmation */}
      <Modal
        isOpen={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title="Remove From Sample"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              isLoading={isRemoving}
              leftIcon={<X className="h-4 w-4" />}
              onClick={() => removeTarget && removeItem({ item_type: removeTarget.item_type, mapping_id: removeTarget.mapping_id })}
            >
              Confirm Remove
            </Button>
          </>
        }
      >
        {removeTarget && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">
              {removeTarget.item_type === 'CARTON' ? (
                <>
                  Remove <strong className="font-mono">{removeTarget.barcode}</strong> from this sample? Its{' '}
                  <strong>{removeTarget.box_count}</strong> boxes go back to main inventory, untouched.
                </>
              ) : (
                <>
                  Remove <strong className="font-mono">{removeTarget.barcode}</strong> from this sample? It goes back
                  to main inventory as available stock.
                </>
              )}
            </p>
          </div>
        )}
      </Modal>

      {/* Empty Sample confirmation */}
      <Modal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Empty Sample"
        description="Everything currently in this sample — loose boxes and any reserved cartons — goes back to available stock. Anything already dispatched from this sample is unaffected."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
            <Button variant="danger" isLoading={isClearing} onClick={() => clearSample()} leftIcon={<PackageOpen className="h-4 w-4" />}>
              Confirm — Empty It
            </Button>
          </>
        }
      >
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">
            This will empty sample <strong className="font-mono">{sample.sample_barcode}</strong> ({items.length} item(s)
            currently in it). This action cannot be undone.
          </p>
        </div>
      </Modal>

      {/* Delete Sample confirmation */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Sample Record"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="danger" isLoading={isDeleting} onClick={() => deleteSample()} leftIcon={<Trash2 className="h-4 w-4" />}>
              Confirm Delete
            </Button>
          </>
        }
      >
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">
            Permanently delete <strong className="font-mono">{sample.sample_barcode}</strong>? This is only possible
            because it has never held or shipped anything. This cannot be undone.
          </p>
        </div>
      </Modal>
    </div>
  );
}
