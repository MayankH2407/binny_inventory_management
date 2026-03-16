'use client';

import { useState } from 'react';
import { Plus, Search, Tag, UserCheck, UserX } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/layout/PageHeader';
import { PRODUCT_CATEGORIES, PRODUCT_SECTIONS, PRODUCT_LOCATIONS } from '@/constants';
import { useAuth } from '@/hooks/useAuth';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { productService } from '@/services/product.service';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@/types';
import toast from 'react-hot-toast';

interface ProductForm {
  sku: string;
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
  sku: '', article_name: '', article_code: '', colour: '', size: '', mrp: '',
  description: '', category: '', section: '', location: '', article_group: '',
  hsn_code: '', size_group: '',
};

export default function ProductsPage() {
  const { isManager } = useAuth();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>({ ...emptyForm });
  const debouncedSearch = useDebounce(search);

  const { data, isLoading, refetch } = useApiQuery(
    ['products-admin', debouncedSearch, String(page)],
    () => productService.getAll({ search: debouncedSearch || undefined, page, limit: 25 }),
  );

  const products = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const { mutate: createProduct, isPending: isCreating } = useApiMutation(
    (data: Record<string, unknown>) => productService.create(data),
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

  const buildPayload = (): Record<string, unknown> => ({
    sku: form.sku,
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
  });

  const handleSubmit = () => {
    if (!form.sku.trim() || !form.article_name.trim() || !form.article_code.trim() || !form.colour.trim() || !form.size.trim()) {
      toast.error('Please fill in all required fields (SKU, Article Name, Article Code, Colour, Size)');
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
      sku: product.sku, article_name: product.article_name, article_code: product.article_code,
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
  };

  const updateField = (field: keyof ProductForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

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
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowCreateModal(true)}>
            Add Product
          </Button>
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-brand-border">
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

        {isLoading ? (
          <div className="p-8 text-center text-brand-text-muted">Loading products...</div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-brand-text-muted">
            {search ? 'No products match your search.' : 'No products yet. Add your first product.'}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
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
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-brand-text-dark">{p.article_name}</span>
                    <Badge variant={p.is_active ? 'green' : 'gray'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <p className="text-xs font-mono text-brand-text-muted">{p.sku}</p>
                  <p className="text-xs text-brand-text-muted">
                    {p.colour} | Size {p.size} | {formatCurrency(p.mrp)}
                    {p.category ? ` | ${p.category}` : ''}
                  </p>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="SKU *" placeholder="e.g., BF-HAW-BLK-8" value={form.sku} onChange={(e) => updateField('sku', e.target.value)} />
            <Input label="Article Code *" placeholder="e.g., ART-001" value={form.article_code} onChange={(e) => updateField('article_code', e.target.value)} />
          </div>
          <Input label="Article Name *" placeholder="e.g., Classic Hawaii Slipper" value={form.article_name} onChange={(e) => updateField('article_name', e.target.value)} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input label="Colour *" placeholder="e.g., Black" value={form.colour} onChange={(e) => updateField('colour', e.target.value)} />
            <Input label="Size *" placeholder="e.g., 8" value={form.size} onChange={(e) => updateField('size', e.target.value)} />
            <Input label="MRP *" type="number" placeholder="e.g., 749" value={form.mrp} onChange={(e) => updateField('mrp', e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Category"
              placeholder="Select category..."
              options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))}
              value={form.category}
              onChange={(e) => updateField('category', e.target.value)}
            />
            <Select
              label="Section"
              placeholder="Select section..."
              options={PRODUCT_SECTIONS.map((s) => ({ value: s, label: s }))}
              value={form.section}
              onChange={(e) => updateField('section', e.target.value)}
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
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSubmit} isLoading={isCreating || isUpdating}>
              {editingProduct ? 'Update Product' : 'Create Product'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
