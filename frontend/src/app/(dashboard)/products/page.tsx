'use client';

import { useState, useRef } from 'react';
import { Plus, Search, Tag, UserCheck, UserX, X, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/layout/PageHeader';
import { SkeletonTable } from '@/components/ui/Spinner';
import { PRODUCT_CATEGORIES, PRODUCT_LOCATIONS } from '@/constants';
import { useAuth } from '@/hooks/useAuth';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { productService, BulkUploadResult, BulkRowError } from '@/services/product.service';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@/types';
import toast from 'react-hot-toast';

// Derive the server root from the API base URL (strip the /api/v1 path)
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1').replace(/\/api\/v1$/, '');

function getImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path}`;
}

interface ProductForm {
  article_name: string;
  article_code: string;
  colour: string;
  size: string;
  mrp: string;
  description: string;
  category: string;
  section: string;
  location: string;
  article_group: string;
  hsn_code: string;
  size_group: string;
}

const emptyForm: ProductForm = {
  article_name: '', article_code: '', colour: '', size: '', mrp: '',
  description: '', category: '', section: '', location: '', article_group: '',
  hsn_code: '', size_group: '',
};

export default function ProductsPage() {
  const { isManager } = useAuth();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [activeSection, setActiveSection] = useState<string>('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>({ ...emptyForm });
  const [createImageFile, setCreateImageFile] = useState<File | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebounce(search);

  // Sections from API
  const { data: sectionsData } = useApiQuery(
    ['sections'],
    () => productService.getSections(),
  );
  const sections = sectionsData ?? [];

  const { data, isLoading, refetch } = useApiQuery(
    ['products-admin', debouncedSearch, String(page), activeSection, JSON.stringify(filters)],
    () => productService.getAll({
      search: debouncedSearch || undefined,
      page,
      limit: 25,
      section: activeSection || undefined,
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    }),
  );

  const products = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const { mutate: createProduct, isPending: isCreating } = useApiMutation(
    async (data: Record<string, unknown>) => {
      const product = await productService.create(data);
      // If an image was selected during creation, upload it now
      if (createImageFile && product.id) {
        try {
          await productService.uploadImage(product.id, createImageFile);
        } catch {
          toast.error('Product created but image upload failed. You can upload it by editing the product.');
        }
      }
      return product;
    },
    {
      successMessage: 'Product created successfully',
      invalidateKeys: [['products-admin'], ['products-for-generate']],
      onSuccess: () => { closeModal(); refetch(); },
    }
  );

  const { mutate: updateProduct, isPending: isUpdating } = useApiMutation(
    (data: { id: string; payload: Record<string, unknown> }) => productService.update(data.id, data.payload),
    {
      successMessage: 'Product updated successfully',
      invalidateKeys: [['products-admin'], ['products-for-generate']],
      onSuccess: () => { closeModal(); refetch(); },
    }
  );

  const toggleStatus = async (product: Product) => {
    try {
      await productService.update(product.id, { is_active: !product.is_active });
      toast.success(`Product ${product.is_active ? 'deactivated' : 'activated'} successfully`);
      refetch();
    } catch {
      toast.error('Failed to update product status');
    }
  };

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      article_name: form.article_name,
      article_code: form.article_code,
      colour: form.colour,
      size: form.size,
      mrp: parseFloat(form.mrp) || 0,
      description: form.description || null,
      category: form.category || null,
      section: form.section || null,
      location: form.location || null,
      article_group: form.article_group || null,
      hsn_code: form.hsn_code || null,
      size_group: form.size_group || null,
    };
    return payload;
  };

  const handleSubmit = () => {
    if (!form.article_name.trim() || !form.article_code.trim() || !form.colour.trim() || !form.size.trim()) {
      toast.error('Please fill in all required fields (Article Name, Article Code, Colour, Size)');
      return;
    }
    if (!form.section.trim() || !form.category.trim()) {
      toast.error('Section and Category are required fields');
      return;
    }
    if (!form.mrp || parseFloat(form.mrp) <= 0) {
      toast.error('MRP must be a positive number');
      return;
    }
    if (editingProduct) {
      updateProduct({ id: editingProduct.id, payload: buildPayload() });
    } else {
      createProduct(buildPayload());
    }
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      article_name: product.article_name, article_code: product.article_code,
      colour: product.colour, size: product.size, mrp: String(product.mrp),
      description: product.description || '', category: product.category || '',
      section: product.section || '', location: product.location || '',
      article_group: product.article_group || '', hsn_code: product.hsn_code || '',
      size_group: product.size_group || '',
    });
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingProduct(null);
    setForm({ ...emptyForm });
    setCreateImageFile(null);
  };

  const updateField = (field: keyof ProductForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilter = (key: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setPage(1);
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) return;
    setBulkUploading(true);
    try {
      const result = await productService.bulkUpload(bulkFile);
      setBulkResult(result);
      if (result.created > 0) {
        toast.success(`${result.created} products created successfully`);
        refetch();
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} rows had errors — see details below`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast.error(message);
    } finally {
      setBulkUploading(false);
    }
  };

  const handleDownloadSample = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('binny_token') : null;
    const url = productService.getSampleCsvUrl();
    const a = document.createElement('a');
    // Use fetch with auth header to download
    fetch(url, { headers: { Authorization: `Bearer ${token || ''}` } })
      .then((r) => r.blob())
      .then((blob) => {
        a.href = URL.createObjectURL(blob);
        a.download = 'product_upload_sample.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast.error('Failed to download sample file'));
  };

  const closeBulkModal = () => {
    setShowBulkModal(false);
    setBulkFile(null);
    setBulkResult(null);
    if (bulkFileRef.current) bulkFileRef.current.value = '';
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Tag className="h-16 w-16 text-brand-text-muted/20 mb-4" />
        <h2 className="text-lg font-semibold text-brand-text-dark mb-2">Access Denied</h2>
        <p className="text-brand-text-muted">Only administrators and supervisors can manage products.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description="Manage product master (SKU catalog)"
        action={
          <div className="flex gap-2">
            <Button variant="outline" leftIcon={<Upload className="h-4 w-4" />} onClick={() => setShowBulkModal(true)}>
              Bulk Import
            </Button>
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowCreateModal(true)}>
              Add Product
            </Button>
          </div>
        }
      />

      {/* Section Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
        <button
          onClick={() => { setActiveSection(''); setPage(1); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            !activeSection ? 'bg-binny-navy text-white' : 'bg-gray-100 text-brand-text-muted hover:bg-gray-200'
          }`}
        >
          All
        </button>
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => { setActiveSection(s.name); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeSection === s.name ? 'bg-binny-navy text-white' : 'bg-gray-100 text-brand-text-muted hover:bg-gray-200'
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <Card padding={false}>
        {/* Search bar */}
        <div className="p-4 border-b border-brand-border bg-binny-navy-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-text-muted" />
            <input
              type="text"
              placeholder="Search by name, SKU, or article code..."
              className="w-full pl-10 pr-4 py-2 border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {/* Column filters */}
        <div className="p-4 border-b border-brand-border bg-gray-50/50">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            <div className="relative">
              <select
                className="w-full text-xs border border-brand-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary/30 appearance-none pr-6"
                value={filters.category || ''}
                onChange={(e) => e.target.value ? setFilter('category', e.target.value) : clearFilter('category')}
              >
                <option value="">All Categories</option>
                {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {filters.category && (
                <button onClick={() => clearFilter('category')} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Colour..."
                className="w-full text-xs border border-brand-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary/30 pr-6"
                value={filters.colour || ''}
                onChange={(e) => e.target.value ? setFilter('colour', e.target.value) : clearFilter('colour')}
              />
              {filters.colour && (
                <button onClick={() => clearFilter('colour')} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Size..."
                className="w-full text-xs border border-brand-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary/30 pr-6"
                value={filters.size || ''}
                onChange={(e) => e.target.value ? setFilter('size', e.target.value) : clearFilter('size')}
              />
              {filters.size && (
                <button onClick={() => clearFilter('size')} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Article Group..."
                className="w-full text-xs border border-brand-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary/30 pr-6"
                value={filters.article_group || ''}
                onChange={(e) => e.target.value ? setFilter('article_group', e.target.value) : clearFilter('article_group')}
              />
              {filters.article_group && (
                <button onClick={() => clearFilter('article_group')} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="relative">
              <select
                className="w-full text-xs border border-brand-border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-primary/30 appearance-none pr-6"
                value={filters.location || ''}
                onChange={(e) => e.target.value ? setFilter('location', e.target.value) : clearFilter('location')}
              >
                <option value="">All Locations</option>
                {PRODUCT_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              {filters.location && (
                <button onClick={() => clearFilter('location')} className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={() => { setFilters({}); setPage(1); }}
                className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 px-2 py-1.5"
              >
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">
            <SkeletonTable />
          </div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-brand-text-muted">
            {search || activeSection || activeFilterCount > 0
              ? 'No products match your filters.'
              : 'No products yet. Add your first product.'}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Image</TableHeader>
                    <TableHeader>SKU</TableHeader>
                    <TableHeader>Article</TableHeader>
                    <TableHeader>Colour</TableHeader>
                    <TableHeader>Size</TableHeader>
                    <TableHeader>MRP</TableHeader>
                    <TableHeader>Category</TableHeader>
                    <TableHeader>Section</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Actions</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        {getImageUrl(p.image_url) ? (
                          <img
                            src={getImageUrl(p.image_url)!}
                            alt={p.article_name}
                            className="w-10 h-10 object-cover rounded-md border border-brand-border"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-md border border-brand-border bg-gray-100 flex items-center justify-center">
                            <Tag className="h-4 w-4 text-gray-300" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">{p.article_name}</TableCell>
                      <TableCell>{p.colour}</TableCell>
                      <TableCell>{p.size}</TableCell>
                      <TableCell>{formatCurrency(p.mrp)}</TableCell>
                      <TableCell>{p.category || '-'}</TableCell>
                      <TableCell>{p.section || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={p.is_active ? 'green' : 'gray'}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(p)}>Edit</Button>
                          <button
                            onClick={() => toggleStatus(p)}
                            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                            title={p.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {p.is_active
                              ? <UserX className="h-4 w-4 text-red-500" />
                              : <UserCheck className="h-4 w-4 text-green-500" />
                            }
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-brand-border">
              {products.map((p) => (
                <div key={p.id} className="p-4 space-y-1">
                  <div className="flex items-start gap-3">
                    {getImageUrl(p.image_url) ? (
                      <img
                        src={getImageUrl(p.image_url)!}
                        alt={p.article_name}
                        className="w-12 h-12 object-cover rounded-md border border-brand-border flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-md border border-brand-border bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Tag className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-brand-text-dark truncate">{p.article_name}</span>
                        <Badge variant={p.is_active ? 'green' : 'gray'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      <p className="text-xs font-mono text-brand-text-muted">{p.sku}</p>
                      <p className="text-xs text-brand-text-muted">
                        {p.colour} | Size {p.size} | {formatCurrency(p.mrp)}
                        {p.category ? ` | ${p.category}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => toggleStatus(p)}>
                      {p.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-brand-border">
                <p className="text-sm text-brand-text-muted">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showCreateModal || !!editingProduct}
        onClose={closeModal}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">

          {/* SKU display (edit only) */}
          {editingProduct && (
            <div className="rounded-lg bg-gray-50 border border-brand-border px-4 py-3">
              <p className="text-xs text-brand-text-muted mb-0.5">SKU (auto-generated)</p>
              <p className="font-mono text-sm font-semibold text-brand-text-dark">{editingProduct.sku}</p>
              <p className="text-xs text-brand-text-muted mt-1">SKU is auto-generated from Section, Article Name, Category, and Colour</p>
            </div>
          )}

          {!editingProduct && (
            <p className="text-xs text-brand-text-muted bg-blue-50 border border-blue-100 rounded-lg px-4 py-2">
              SKU is auto-generated from Section, Article Name, Category, and Colour — no need to enter it manually.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Article Code *"
              placeholder="e.g., ART-001"
              value={form.article_code}
              onChange={(e) => updateField('article_code', e.target.value)}
            />
            <Input
              label="Article Name *"
              placeholder="e.g., Classic Hawaii Slipper"
              value={form.article_name}
              onChange={(e) => updateField('article_name', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Colour *" placeholder="e.g., Black" value={form.colour} onChange={(e) => updateField('colour', e.target.value)} />
            <Input label="Size *" placeholder="e.g., 8" value={form.size} onChange={(e) => updateField('size', e.target.value)} />
            <Input label="MRP *" type="number" placeholder="e.g., 749" value={form.mrp} onChange={(e) => updateField('mrp', e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Section *"
              placeholder="Select section..."
              options={sections.length > 0
                ? sections.map((s) => ({ value: s.name, label: s.name }))
                : [{ value: 'Hawaii', label: 'Hawaii' }, { value: 'PU', label: 'PU' }, { value: 'EVA', label: 'EVA' }]
              }
              value={form.section}
              onChange={(e) => updateField('section', e.target.value)}
            />
            <Select
              label="Category *"
              placeholder="Select category..."
              options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))}
              value={form.category}
              onChange={(e) => updateField('category', e.target.value)}
            />
            <Select
              label="Location"
              placeholder="Select location..."
              options={PRODUCT_LOCATIONS.map((l) => ({ value: l, label: l }))}
              value={form.location}
              onChange={(e) => updateField('location', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Article Group" placeholder="e.g., Premium" value={form.article_group} onChange={(e) => updateField('article_group', e.target.value)} />
            <Input label="HSN Code" placeholder="e.g., 6402" value={form.hsn_code} onChange={(e) => updateField('hsn_code', e.target.value)} />
            <Input label="Size Group" placeholder="e.g., 6-10" value={form.size_group} onChange={(e) => updateField('size_group', e.target.value)} />
          </div>

          <Input label="Description" placeholder="Optional product description" value={form.description} onChange={(e) => updateField('description', e.target.value)} />

          {/* Image upload */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-brand-text-dark">Product Image</label>
            {editingProduct && getImageUrl(editingProduct.image_url) && (
              <img
                src={getImageUrl(editingProduct.image_url)!}
                alt=""
                className="w-24 h-24 object-cover rounded-lg border border-brand-border"
              />
            )}
            {!editingProduct && createImageFile && (
              <div className="flex items-center gap-2 text-sm text-brand-text-muted">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>{createImageFile.name}</span>
                <button onClick={() => setCreateImageFile(null)} className="text-red-400 hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (editingProduct) {
                  try {
                    await productService.uploadImage(editingProduct.id, file);
                    toast.success('Image uploaded successfully');
                    refetch();
                  } catch {
                    toast.error('Failed to upload image');
                  }
                } else {
                  setCreateImageFile(file);
                }
              }}
              className="block text-sm text-brand-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-binny-navy file:text-white hover:file:bg-binny-navy/90"
            />
            {!editingProduct && (
              <p className="text-xs text-brand-text-muted">Image will be uploaded after the product is created.</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSubmit} isLoading={isCreating || isUpdating}>
              {editingProduct ? 'Update Product' : 'Create Product'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Upload Modal */}
      <Modal isOpen={showBulkModal} onClose={closeBulkModal} title="Bulk Import Products">
        <div className="space-y-4">
          <p className="text-sm text-brand-text-muted">
            Upload a CSV file with product details. Each row creates one product with an auto-generated SKU.
          </p>

          {/* Sample download */}
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <FileSpreadsheet className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">Download sample CSV</p>
              <p className="text-xs text-blue-700">Use this template to format your product data correctly.</p>
            </div>
            <button
              onClick={handleDownloadSample}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50"
            >
              <Download className="h-3 w-3" /> Download
            </button>
          </div>

          {/* Required columns info */}
          <div className="text-xs text-brand-text-muted">
            <p className="font-medium mb-1">Required columns:</p>
            <p>article_code, article_name, colour, size, mrp, section, category</p>
            <p className="mt-1">Optional: location, description, article_group, hsn_code, size_group</p>
            <p className="mt-1">Maximum 500 rows per upload. Images must be uploaded separately after import.</p>
          </div>

          {/* File input */}
          {!bulkResult && (
            <>
              <div className="border-2 border-dashed border-brand-border rounded-lg p-6 text-center">
                <Upload className="h-8 w-8 text-brand-text-muted mx-auto mb-2" />
                <input
                  ref={bulkFileRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-brand-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-binny-navy file:text-white hover:file:bg-binny-navy/90 mx-auto"
                />
                {bulkFile && (
                  <p className="mt-2 text-sm text-brand-text-dark font-medium">{bulkFile.name}</p>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={closeBulkModal}>Cancel</Button>
                <Button
                  onClick={handleBulkUpload}
                  isLoading={bulkUploading}
                  disabled={!bulkFile || bulkUploading}
                  leftIcon={<Upload className="h-4 w-4" />}
                >
                  Upload & Create Products
                </Button>
              </div>
            </>
          )}

          {/* Results */}
          {bulkResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                <p className="text-sm font-medium text-green-900">{bulkResult.created} products created successfully</p>
              </div>

              {bulkResult.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    <p className="text-sm font-medium">{bulkResult.errors.length} rows failed</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-red-200 rounded-lg divide-y divide-red-100">
                    {bulkResult.errors.map((err: BulkRowError, i: number) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <span className="font-medium text-red-800">Row {err.row}</span>
                        {err.article_name && <span className="text-red-600"> ({err.article_name})</span>}
                        <span className="text-red-600">: {err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={closeBulkModal}>Close</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setBulkResult(null);
                    setBulkFile(null);
                    if (bulkFileRef.current) bulkFileRef.current.value = '';
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
    </div>
  );
}
