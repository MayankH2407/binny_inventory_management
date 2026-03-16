'use client';

import { useState, useCallback } from 'react';
import { Search, Package, Boxes, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import QRScanner from '@/components/scanning/QRScanner';
import PageHeader from '@/components/layout/PageHeader';
import { childBoxService } from '@/services/childBox.service';
import { masterCartonService } from '@/services/masterCarton.service';
import type { ChildBoxWithProduct, MasterCarton } from '@/types';
import toast from 'react-hot-toast';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { ROUTES } from '@/constants';

type ScanResult =
  | { type: 'childBox'; data: ChildBoxWithProduct }
  | { type: 'masterCarton'; data: MasterCarton }
  | null;

export default function ScanPage() {
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<ScanResult>(null);
  const [isSearching, setIsSearching] = useState(false);

  const lookupCode = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setIsSearching(true);
    setResult(null);

    try {
      const childBox = await childBoxService.getByBarcode(code);
      setResult({ type: 'childBox', data: childBox });
      toast.success('Child box found');
      setIsSearching(false);
      return;
    } catch {
      // Not a child box, try master carton
    }

    try {
      const carton = await masterCartonService.getByBarcode(code);
      setResult({ type: 'masterCarton', data: carton });
      toast.success('Master carton found');
    } catch {
      toast.error('QR code not found in system');
    }

    setIsSearching(false);
  }, []);

  const handleScan = useCallback(
    (decodedText: string) => {
      lookupCode(decodedText);
    },
    [lookupCode]
  );

  const handleManualSearch = () => {
    lookupCode(manualCode);
  };

  return (
    <div>
      <PageHeader
        title="Scan QR Code"
        description="Scan or enter a QR code to look up child boxes or master cartons"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold text-brand-text-dark mb-4">Camera Scanner</h3>
            <QRScanner onScanSuccess={handleScan} />
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-brand-text-dark mb-4">Manual Entry</h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Enter barcode or carton barcode..."
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                  leftIcon={<Search className="h-4 w-4" />}
                />
              </div>
              <Button onClick={handleManualSearch} isLoading={isSearching}>
                Look Up
              </Button>
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <h3 className="font-semibold text-brand-text-dark mb-4">Scan Result</h3>

          {!result ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-12 w-12 text-brand-text-muted/30 mb-4" />
              <p className="text-brand-text-muted">
                Scan a QR code or enter it manually to see details
              </p>
            </div>
          ) : result.type === 'childBox' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <Package className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-blue-700">Child Box</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-brand-text-muted">Barcode</span>
                  <span className="text-sm font-mono">{result.data.barcode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-brand-text-muted">SKU</span>
                  <span className="text-sm font-medium">{result.data.sku}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-brand-text-muted">Product</span>
                  <span className="text-sm font-medium">{result.data.article_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-brand-text-muted">Size / Colour</span>
                  <span className="text-sm">
                    {result.data.size} / {result.data.colour}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-brand-text-muted">MRP</span>
                  <span className="text-sm font-medium">{formatCurrency(result.data.mrp)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-brand-text-muted">Status</span>
                  <StatusBadge status={result.data.status} size="sm" />
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-brand-text-muted">Created</span>
                  <span className="text-xs text-brand-text-muted">
                    {formatDateTime(result.data.created_at)}
                  </span>
                </div>
              </div>
              <Link href={ROUTES.TRACEABILITY + `?qr=${result.data.barcode}`}>
                <Button variant="outline" fullWidth size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  View Full Traceability
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                <Boxes className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-green-700">Master Carton</span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-brand-text-muted">Carton Barcode</span>
                  <span className="text-sm font-mono">{result.data.carton_barcode}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-brand-text-muted">Status</span>
                  <StatusBadge status={result.data.status} size="sm" />
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-brand-text-muted">Boxes</span>
                  <span className="text-sm font-semibold">
                    {result.data.child_count} / {result.data.max_capacity}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-brand-text-muted">Created</span>
                  <span className="text-xs text-brand-text-muted">
                    {formatDateTime(result.data.created_at)}
                  </span>
                </div>
              </div>
              <Link href={ROUTES.MASTER_CARTON_DETAIL(result.data.id)}>
                <Button variant="outline" fullWidth size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>
                  View Carton Details
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
