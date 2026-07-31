'use client';

import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Lock,
  PackageOpen,
  ScanLine,
  Copy,
  Plus,
  X,
  BarChart3,
  Boxes,
  Printer,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  Undo2,
  ArrowUpFromLine,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/ui/Table';
import StatusBadge from '@/components/ui/StatusBadge';
import { PageSpinner } from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/layout/PageHeader';
import QRScanner from '@/components/scanning/QRScanner';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import { ROUTES } from '@/constants';
import { sampleService } from '@/services/sample.service';
import { childBoxService } from '@/services/childBox.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import { checkFootAvailability } from '@/lib/sampleFoot';
import { printSampleLabel } from '@/lib/sampleLabel';
import { sampleStatusLabel, sampleStatusVariant } from '@/lib/sampleStatus';
import type { SampleChildBoxRow, CartonMembership } from '@/types';
import toast from 'react-hot-toast';

function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message || e?.message || fallback;
}

export default function SampleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isManager } = useAuth();
  const queryClient = useQueryClient();

  const [showUnpackConfirm, setShowUnpackConfirm] = useState(false);
  const [showAddBox, setShowAddBox] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showCartonScanner, setShowCartonScanner] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isScanningCarton, setIsScanningCarton] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [splittingMappingId, setSplittingMappingId] = useState<string | null>(null);
  const [expandedCartons, setExpandedCartons] = useState<Set<string>>(new Set());
  const [takeOutCartonId, setTakeOutCartonId] = useState<string | null>(null);
  const [removeCartonId, setRemoveCartonId] = useState<string | null>(null);

  const { data: sample, isLoading } = useApiQuery(['sample', id], () => sampleService.getById(id));
  const { data: assortment } = useApiQuery(['sample-assortment', id], () => sampleService.getAssortment(id), { enabled: !!sample });
  const { data: cartons } = useApiQuery(['sample-cartons', id], () => sampleService.getCartons(id), { enabled: !!sample });

  const invalidateSample = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sample', id] });
    queryClient.invalidateQueries({ queryKey: ['sample-assortment', id] });
    queryClient.invalidateQueries({ queryKey: ['sample-cartons', id] });
    queryClient.invalidateQueries({ queryKey: ['samples'] });
    queryClient.invalidateQueries({ queryKey: ['child-boxes'] });
    queryClient.invalidateQueries({ queryKey: ['master-cartons'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  }, [id, queryClient]);

  const { mutate: closeSample, isPending: isClosing } = useApiMutation(() => sampleService.close(id), {
    successMessage: 'Sample closed successfully',
    invalidateKeys: [['sample', id], ['samples'], ['dashboard-stats']],
    onSuccess: () => setOverflowOpen(false),
  });

  const { mutate: fullUnpack, isPending: isUnpacking } = useApiMutation(() => sampleService.fullUnpack(id), {
    successMessage: 'Sample emptied',
    invalidateKeys: [['sample', id], ['sample-assortment', id], ['sample-cartons', id], ['samples'], ['child-boxes'], ['master-cartons'], ['dashboard-stats']],
    onSuccess: () => {
      setShowUnpackConfirm(false);
      setOverflowOpen(false);
    },
  });

  const addBoxByBarcode = useCallback(
    async (barcode: string) => {
      if (!barcode.trim()) {
        toast.error('Enter a barcode');
        return;
      }
      setIsAdding(true);
      try {
        const childBox = await childBoxService.getByBarcode(barcode.trim());
        const avail = checkFootAvailability(childBox, 'PAIR');
        if (!avail.ok) {
          toast.error(avail.reason);
          return;
        }
        await sampleService.addBox({ child_box_id: childBox.id, sample_record_id: id });
        toast.success(`Added: ${barcode}`);
        invalidateSample();
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to add box'));
      } finally {
        setIsAdding(false);
      }
    },
    [id, invalidateSample]
  );

  const handleScanCarton = useCallback(
    async (barcode: string) => {
      const code = barcode.trim().toUpperCase();
      if (!code) {
        toast.error('Enter a carton barcode');
        return;
      }
      setIsScanningCarton(true);
      try {
        const result = await sampleService.scanCarton({ sample_record_id: id, carton_barcode: code });
        toast.success(`Added ${result.added} box${result.added === 1 ? '' : 'es'} from carton ${result.cartonBarcode}`);
        invalidateSample();
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to scan carton'));
      } finally {
        setIsScanningCarton(false);
      }
    },
    [id, invalidateSample]
  );

  const handleRemoveBox = useCallback(
    async (mappingId: string, barcode: string) => {
      setRemovingId(mappingId);
      try {
        await sampleService.removeBox({ mapping_id: mappingId, sample_record_id: id });
        toast.success(`Removed: ${barcode}`);
        invalidateSample();
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to remove box'));
      } finally {
        setRemovingId(null);
      }
    },
    [id, invalidateSample]
  );

  const handleSetFoot = useCallback(
    async (mappingId: string, foot: 'LEFT' | 'RIGHT' | 'PAIR') => {
      try {
        await sampleService.setBoxFoot({ sample_record_id: id, mapping_id: mappingId, foot });
        invalidateSample();
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to update foot'));
      } finally {
        setSplittingMappingId(null);
      }
    },
    [id, invalidateSample]
  );

  const handleRemoveCarton = useCallback(
    async (masterCartonId: string) => {
      try {
        await sampleService.removeCarton({ sample_record_id: id, master_carton_id: masterCartonId });
        toast.success('Carton sent back to stock');
        invalidateSample();
      } catch (err) {
        toast.error(apiErrorMessage(err, 'Failed to release carton'));
      } finally {
        setRemoveCartonId(null);
      }
    },
    [id, invalidateSample]
  );

  const handleCopyBarcode = () => {
    if (sample?.sample_barcode) {
      navigator.clipboard.writeText(sample.sample_barcode);
      toast.success('Barcode copied');
    }
  };

  const toggleCartonExpanded = (cartonId: string) => {
    setExpandedCartons((prev) => {
      const next = new Set(prev);
      if (next.has(cartonId)) next.delete(cartonId);
      else next.add(cartonId);
      return next;
    });
  };

  // Group child_boxes by carton (source === 'carton') vs loose, for the merged Contents list.
  const { looseBoxes, cartonGroups } = useMemo(() => {
    const boxes = sample?.child_boxes ?? [];
    const loose = boxes.filter((b) => b.source === 'loose');
    const byCarton = new Map<string, SampleChildBoxRow[]>();
    for (const b of boxes) {
      if (b.source !== 'carton' || !b.master_carton_id) continue;
      if (!byCarton.has(b.master_carton_id)) byCarton.set(b.master_carton_id, []);
      byCarton.get(b.master_carton_id)!.push(b);
    }
    return { looseBoxes: loose, cartonGroups: byCarton };
  }, [sample?.child_boxes]);

  if (isLoading) return <PageSpinner />;

  if (!sample) {
    return (
      <div className="text-center py-12">
        <p className="text-brand-text-muted">Sample not found.</p>
      </div>
    );
  }

  const canModify = sample.status === 'CREATED' || sample.status === 'ACTIVE';
  const canClose = sample.status === 'ACTIVE' && isManager;
  const canUnpack = sample.status === 'CREATED' || sample.status === 'ACTIVE' || sample.status === 'CLOSED';
  const totalAssortmentQty = assortment?.reduce((sum, item) => sum + item.count, 0) || 0;

  const recipientLine = sample.customer_firm_name
    ? sample.customer_firm_name
    : sample.recipient_name
    ? `Free-text recipient: ${sample.recipient_name}`
    : null;

  const nextStepHint =
    sample.status === 'CREATED'
      ? 'Add boxes to get started.'
      : sample.status === 'ACTIVE'
      ? 'Add more boxes, or take the sample barcode to Dispatch.'
      : sample.status === 'CLOSED'
      ? 'Scan this barcode on the Dispatch screen.'
      : null;

  return (
    <div>
      <PageHeader
        title={`Sample: ${sample.sample_barcode}`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {canModify && (
              <Button variant="outline" size="sm" onClick={() => setShowAddBox(!showAddBox)} leftIcon={<Plus className="h-4 w-4" />}>
                Add Boxes
              </Button>
            )}
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
                    {canClose && (
                      <button
                        onClick={() => closeSample(undefined as void)}
                        disabled={isClosing}
                        className="w-full text-left px-4 py-2 text-sm text-brand-text-dark hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Lock className="h-3.5 w-3.5" /> Close Sample
                      </button>
                    )}
                    {canUnpack && (
                      <button
                        onClick={() => {
                          setShowUnpackConfirm(true);
                          setOverflowOpen(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-brand-error hover:bg-red-50 flex items-center gap-2"
                      >
                        <PackageOpen className="h-3.5 w-3.5" /> Empty Sample
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

      {/* Status / Info / Timeline cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Status</p>
          <StatusBadge status={sample.status} label={sampleStatusLabel(sample.status)} variant={sampleStatusVariant(sample.status)} />
          <p className="mt-2 text-sm font-medium text-brand-text-dark">{sample.name}</p>
          {recipientLine && <p className="text-xs text-brand-text-muted mt-0.5">{recipientLine}</p>}
          {nextStepHint && <p className="text-xs text-brand-text-muted mt-2 italic">{nextStepHint}</p>}
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Details</p>
          {sample.purpose && (
            <p className="text-xs text-brand-text-muted mb-1">
              <span className="font-medium text-brand-text-dark">Purpose:</span> {sample.purpose}
            </p>
          )}
          {sample.sample_date && (
            <p className="text-xs text-brand-text-muted mb-1">
              <span className="font-medium text-brand-text-dark">Sample Date:</span> {formatDateTime(sample.sample_date)}
            </p>
          )}
          {sample.notes && (
            <p className="text-xs text-brand-text-muted">
              <span className="font-medium text-brand-text-dark">Notes:</span> {sample.notes}
            </p>
          )}
          {!sample.purpose && !sample.sample_date && !sample.notes && <p className="text-sm text-brand-text-muted">No additional details.</p>}
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Timeline</p>
          <p className="text-xs text-brand-text-muted">
            <span className="font-medium text-brand-text-dark">Created:</span> {formatDateTime(sample.created_at)}
            {sample.creator_name ? ` by ${sample.creator_name}` : ''}
          </p>
          {sample.closed_at && (
            <p className="text-xs text-brand-text-muted mt-1">
              <span className="font-medium text-brand-text-dark">Closed:</span> {formatDateTime(sample.closed_at)}
            </p>
          )}
          {sample.dispatched_at && (
            <p className="text-xs text-brand-text-muted mt-1">
              <span className="font-medium text-brand-text-dark">Dispatched:</span> {formatDateTime(sample.dispatched_at)}
            </p>
          )}
          <p className="text-sm font-bold text-brand-text-dark mt-2">{sample.child_count} items</p>
        </Card>
      </div>

      {/* Add Boxes section */}
      {showAddBox && canModify && (
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
              <ScanLine className="h-4 w-4" />
              Scan to Add Boxes
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddBox(false);
                setShowScanner(false);
                setShowCartonScanner(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <HIDScannerInput onScan={addBoxByBarcode} placeholder="Scan or enter child box barcode..." autoFocus disabled={isAdding} className="mb-4" />

          <div className="flex items-center gap-4">
            <Button variant={showScanner ? 'secondary' : 'outline'} size="sm" onClick={() => setShowScanner(!showScanner)} leftIcon={<ScanLine className="h-4 w-4" />}>
              {showScanner ? 'Hide Camera' : 'Use Camera Instead'}
            </Button>
            <button
              type="button"
              onClick={() => setShowCartonScanner(!showCartonScanner)}
              className="text-sm text-brand-text-muted hover:text-brand-text-dark inline-flex items-center gap-1"
            >
              {showCartonScanner ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Scan a whole carton instead
            </button>
          </div>

          {showScanner && (
            <div className="max-w-md mt-4">
              <QRScanner onScanSuccess={addBoxByBarcode} autoStart />
            </div>
          )}

          {showCartonScanner && (
            <div className="mt-4 pt-4 border-t border-brand-border">
              <p className="text-xs text-brand-text-muted mb-3">
                The whole carton gets reserved for this sample. You can take individual boxes out of it later, or send it back to stock.
              </p>
              <HIDScannerInput onScan={handleScanCarton} placeholder="Scan or enter master carton barcode..." disabled={isScanningCarton} />
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

      {/* Contents — merged carton groups + loose boxes (was two separate tables) */}
      <Card padding={false}>
        <div className="p-4 border-b border-brand-border">
          <h3 className="font-semibold text-brand-text-dark">Contents ({sample.child_count})</h3>
        </div>

        {!cartons?.length && !looseBoxes.length ? (
          <div className="p-12 text-center">
            <p className="text-brand-text-muted">Nothing in this sample yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-brand-border">
            {(cartons ?? []).map((carton) => {
              const cartonId = carton.master_carton_id;
              const isExpanded = expandedCartons.has(cartonId);
              const boxesInCarton = cartonGroups.get(cartonId) ?? [];
              const remaining = carton.child_count;
              const takenOut = carton.taken_out_count ?? 0;
              const original = remaining + takenOut;

              return (
                <div key={cartonId}>
                  <button
                    type="button"
                    onClick={() => toggleCartonExpanded(cartonId)}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-brand-text-muted shrink-0" /> : <ChevronRight className="h-4 w-4 text-brand-text-muted shrink-0" />}
                      <Boxes className="h-4 w-4 text-binny-navy shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-text-dark">
                          Carton {carton.carton_barcode} —{' '}
                          {takenOut > 0 ? `${remaining} of ${original} boxes, reserved whole` : `${remaining} boxes, reserved whole`}
                        </p>
                        {(carton.article_summary || carton.colour_summary || carton.size_summary) && (
                          <p className="text-xs text-brand-text-muted mt-0.5">
                            {[carton.article_summary, carton.colour_summary, carton.size_summary].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4">
                      {canModify && (
                        <div className="flex items-center gap-2 mb-3">
                          <Button size="sm" variant="outline" onClick={() => setTakeOutCartonId(cartonId)} leftIcon={<ArrowUpFromLine className="h-3.5 w-3.5" />}>
                            Take boxes out…
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRemoveCartonId(cartonId)}>
                            Send carton back to stock
                          </Button>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {boxesInCarton.map((box) => (
                          <div key={box.id} className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded text-sm">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-mono text-xs text-brand-text-muted">{box.barcode}</span>
                              <span className="text-xs text-brand-text-dark truncate">{box.article_name} · {box.colour} · {box.size}</span>
                            </div>
                            <StatusBadge status={box.status} size="sm" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {looseBoxes.length > 0 && (
              <div>
                {(cartons?.length ?? 0) > 0 && (
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wide">Individual boxes ({looseBoxes.length})</p>
                  </div>
                )}
                <div className="divide-y divide-brand-border">
                  {looseBoxes.map((box, index) => {
                    const isSplitting = splittingMappingId === box.id;
                    return (
                      <div key={box.id} className="flex items-center justify-between p-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="text-xs font-medium text-brand-text-muted w-6 pt-0.5">{index + 1}.</span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              <span className="font-mono text-xs text-brand-text-dark">{box.barcode}</span>
                              <span className="text-sm font-medium text-brand-text-dark">{box.article_name}</span>
                              <span className="text-xs text-brand-text-muted">{box.colour}</span>
                              <span className="text-xs text-brand-text-muted">Size {box.size}</span>
                              <span className="text-xs text-brand-text-muted">{formatCurrency(box.mrp)}</span>
                              <StatusBadge status={box.status} size="sm" />
                              {box.source_master_carton_id && (
                                <span className="text-[11px] text-brand-text-muted">[from carton]</span>
                              )}
                            </div>

                            {canModify && (
                              <>
                                {isSplitting ? (
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-xs text-brand-text-muted">Which shoe?</span>
                                    <button
                                      type="button"
                                      onClick={() => handleSetFoot(box.id, 'LEFT')}
                                      className="px-2 py-0.5 rounded text-[11px] font-medium border border-brand-border bg-white hover:bg-gray-100"
                                    >
                                      Left
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSetFoot(box.id, 'RIGHT')}
                                      className="px-2 py-0.5 rounded text-[11px] font-medium border border-brand-border bg-white hover:bg-gray-100"
                                    >
                                      Right
                                    </button>
                                    <button type="button" onClick={() => setSplittingMappingId(null)} className="text-[11px] text-brand-text-muted hover:text-brand-text-dark">
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
                                      onClick={() => handleSetFoot(box.id, 'PAIR')}
                                      title="Undo — send as a whole pair"
                                      className="p-0.5 rounded text-brand-text-muted hover:text-brand-text-dark"
                                    >
                                      <Undo2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setSplittingMappingId(box.id)}
                                    className="text-[11px] text-brand-text-muted hover:text-brand-text-dark underline decoration-dotted mt-1"
                                  >
                                    Send one shoe only
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {canModify && (
                          <button
                            onClick={() => handleRemoveBox(box.id, box.barcode)}
                            disabled={removingId === box.id}
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

      {/* Take boxes out of a carton */}
      {takeOutCartonId && (
        <TakeOutCartonModal
          cartonId={takeOutCartonId}
          cartonBarcode={cartons?.find((c) => c.master_carton_id === takeOutCartonId)?.carton_barcode ?? ''}
          boxes={cartonGroups.get(takeOutCartonId) ?? []}
          sampleId={id}
          onClose={() => setTakeOutCartonId(null)}
          onDone={() => {
            setTakeOutCartonId(null);
            invalidateSample();
          }}
        />
      )}

      {/* Send carton back to stock confirmation */}
      <Modal
        isOpen={!!removeCartonId}
        onClose={() => setRemoveCartonId(null)}
        title="Send Carton Back to Stock"
        description="Nothing inside the carton is unpacked — it just leaves this sample."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveCartonId(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => removeCartonId && handleRemoveCarton(removeCartonId)}>Send Back</Button>
          </>
        }
      >
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            Carton {cartons?.find((c) => c.master_carton_id === removeCartonId)?.carton_barcode} and its{' '}
            {cartons?.find((c) => c.master_carton_id === removeCartonId)?.child_count} boxes go back to normal stock.
          </p>
        </div>
      </Modal>

      {/* Empty Sample confirmation */}
      <Modal
        isOpen={showUnpackConfirm}
        onClose={() => setShowUnpackConfirm(false)}
        title="Empty Sample"
        description="Everything currently in this sample — loose boxes and any reserved cartons — goes back to available stock."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowUnpackConfirm(false)}>Cancel</Button>
            <Button variant="danger" isLoading={isUnpacking} onClick={() => fullUnpack(undefined as void)} leftIcon={<PackageOpen className="h-4 w-4" />}>
              Confirm — Empty It
            </Button>
          </>
        }
      >
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">
            This will empty sample <strong className="font-mono">{sample.sample_barcode}</strong> ({sample.child_count} item(s)). This action cannot be undone.
          </p>
        </div>
      </Modal>
    </div>
  );
}

// ─── Take boxes out of a carton — scan-to-check + checkbox list ──────────────

function TakeOutCartonModal({
  cartonId,
  cartonBarcode,
  boxes,
  sampleId,
  onClose,
  onDone,
}: {
  cartonId: string;
  cartonBarcode: string;
  boxes: SampleChildBoxRow[];
  sampleId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<'keep' | 'release' | null>(null);

  const toggle = (childBoxId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(childBoxId)) next.delete(childBoxId);
      else next.add(childBoxId);
      return next;
    });
  };

  const handleScan = (barcode: string) => {
    const match = boxes.find((b) => b.barcode.toUpperCase() === barcode.trim().toUpperCase());
    if (!match) {
      toast.error(`${barcode} is not in this carton`);
      return;
    }
    setSelected((prev) => new Set(prev).add(match.child_box_id));
  };

  const submit = async (releaseCarton: boolean) => {
    if (selected.size === 0) {
      toast.error('Select at least one box');
      return;
    }
    setSubmitting(releaseCarton ? 'release' : 'keep');
    try {
      await sampleService.takeOutCartonBoxes({
        sample_record_id: sampleId,
        master_carton_id: cartonId,
        child_box_ids: Array.from(selected),
        release_carton: releaseCarton,
      });
      toast.success(`Took ${selected.size} box(es) out of carton ${cartonBarcode}`);
      onDone();
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to take boxes out'));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Take Boxes Out of ${cartonBarcode}`}
      description="These boxes come out of the carton and become their own tracked items. The rest of the carton stays packed."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="outline" isLoading={submitting === 'keep'} onClick={() => submit(false)}>
            Take Out Selected ({selected.size})
          </Button>
          <Button variant="danger" isLoading={submitting === 'release'} onClick={() => submit(true)}>
            Take Out + Send Rest Back
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <HIDScannerInput onScan={handleScan} placeholder="Scan a box in this carton to select it..." autoFocus />
        <div className="max-h-[300px] overflow-y-auto space-y-1.5">
          {boxes.map((box) => (
            <label key={box.child_box_id} className="flex items-center gap-3 p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100">
              <input type="checkbox" checked={selected.has(box.child_box_id)} onChange={() => toggle(box.child_box_id)} className="h-4 w-4" />
              <span className="font-mono text-xs text-brand-text-muted">{box.barcode}</span>
              <span className="text-sm text-brand-text-dark truncate">{box.article_name} · {box.colour} · {box.size}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
