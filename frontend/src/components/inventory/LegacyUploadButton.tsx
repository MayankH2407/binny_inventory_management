'use client';

import { useState, useRef } from 'react';
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { useCan } from '@/hooks/useCan';
import { masterCartonService, type LegacyUploadResult } from '@/services/masterCarton.service';
import toast from 'react-hot-toast';

export default function LegacyUploadButton() {
  const canCreate = useCan('cartons:create');
  const [showModal, setShowModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<LegacyUploadResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!canCreate) return null;

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await masterCartonService.bulkUploadLegacy(file);
      setResult(res);
      if (res.cartons_created > 0) {
        toast.success(`${res.cartons_created} legacy carton${res.cartons_created !== 1 ? 's' : ''} created`);
      }
      if (res.errors.length > 0) {
        toast.error(`${res.errors.length} row${res.errors.length !== 1 ? 's' : ''} had errors — see details`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadSample = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('binny_token') : null;
    const url = masterCartonService.getLegacySampleCsvUrl();
    fetch(url, { headers: { Authorization: `Bearer ${token || ''}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'legacy_stock_upload_sample.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast.error('Failed to download sample file'));
  };

  const closeModal = () => {
    setShowModal(false);
    setFile(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <>
      <Button
        variant="outline"
        leftIcon={<Upload className="h-4 w-4" />}
        onClick={() => setShowModal(true)}
      >
        Upload Existing Stock
      </Button>

      <Modal isOpen={showModal} onClose={closeModal} title="Upload Existing Stock (Legacy CSV)">
        <div className="space-y-4">
          <p className="text-sm text-brand-text-muted">
            Upload a CSV of pre-go-live sealed master cartons. Each row creates the specified number
            of legacy carton records. Legacy stock appears in the inventory drill-down as a separate
            carton count (never mixed with piece counts).
          </p>

          {/* Sample download */}
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <FileSpreadsheet className="h-5 w-5 text-blue-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">Download sample CSV</p>
              <p className="text-xs text-blue-700">
                4 columns: SECTION, CATEGORY, ARTICLE GROUP (SIZE GROUP), MASTER CARTON QUANTITY
              </p>
            </div>
            <button
              onClick={handleDownloadSample}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50"
            >
              <Download className="h-3 w-3" /> Download
            </button>
          </div>

          {/* Column info */}
          <div className="text-xs text-brand-text-muted">
            <p className="font-medium mb-1">Required columns:</p>
            <p>SECTION, CATEGORY, ARTICLE GROUP (SIZE GROUP), MASTER CARTON QUANTITY</p>
            <p className="mt-1">
              Rows with quantity 0 are skipped. Upload is additive — re-uploading the same section
              adds more cartons and shows a warning.
            </p>
            <p className="mt-1">Maximum 20,000 cartons per upload file.</p>
          </div>

          {/* File picker (hidden when result is shown) */}
          {!result && (
            <>
              <div className="border-2 border-dashed border-brand-border rounded-lg p-6 text-center">
                <Upload className="h-8 w-8 text-brand-text-muted mx-auto mb-2" />
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-brand-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-binny-navy file:text-white hover:file:bg-binny-navy/90 mx-auto"
                />
                {file && (
                  <p className="mt-2 text-sm text-brand-text-dark font-medium">{file.name}</p>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={closeModal}>Cancel</Button>
                <Button
                  onClick={handleUpload}
                  isLoading={uploading}
                  disabled={!file || uploading}
                  leftIcon={<Upload className="h-4 w-4" />}
                >
                  Upload &amp; Create Cartons
                </Button>
              </div>
            </>
          )}

          {/* Results panel */}
          {result && (
            <div className="space-y-3">
              {/* Created count */}
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                <div className="text-sm text-green-900">
                  <p className="font-medium">
                    {result.cartons_created.toLocaleString('en-IN')} legacy carton{result.cartons_created !== 1 ? 's' : ''} created
                  </p>
                  <p className="text-xs text-green-700">
                    {result.rows_processed} row{result.rows_processed !== 1 ? 's' : ''} processed
                    {result.rows_skipped_zero > 0
                      ? ` · ${result.rows_skipped_zero} skipped (zero qty)`
                      : ''}
                  </p>
                </div>
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-800 mb-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <p className="text-sm font-medium">{result.warnings.length} warning{result.warnings.length !== 1 ? 's' : ''}</p>
                  </div>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {result.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-amber-700">
                        &bull; {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    <p className="text-sm font-medium">{result.errors.length} row{result.errors.length !== 1 ? 's' : ''} failed</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-red-200 rounded-lg divide-y divide-red-100">
                    {result.errors.map((err, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <span className="font-medium text-red-800">Row {err.row}</span>
                        {err.article_group && (
                          <span className="text-red-600"> ({err.article_group}
                            {err.size_group ? ` / ${err.size_group}` : ''})</span>
                        )}
                        <span className="text-red-600">: {err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={closeModal}>Close</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setResult(null);
                    setFile(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  leftIcon={<Upload className="h-4 w-4" />}
                >
                  Upload Another File
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
