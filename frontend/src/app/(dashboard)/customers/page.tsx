'use client';

import { useState } from 'react';
import { Plus, Search, Building2, UserCheck, UserX } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/layout/PageHeader';
import { SkeletonTable } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useDebounce } from '@/hooks/useDebounce';
import { customerService } from '@/services/customer.service';
import type { Customer, CreateCustomerRequest } from '@/types';
import toast from 'react-hot-toast';

interface CustomerForm extends CreateCustomerRequest {
  customer_type: 'Primary Dealer' | 'Sub Dealer';
  primary_dealer_id: string | null;
}

const emptyForm: CustomerForm = {
  firm_name: '',
  address: '',
  delivery_location: '',
  gstin: '',
  private_marka: '',
  gr: '',
  contact_person_name: '',
  contact_person_mobile: '',
  customer_type: 'Primary Dealer',
  primary_dealer_id: null,
};

export default function CustomersPage() {
  const { isAdmin, isManager } = useAuth();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>({ ...emptyForm });
  const [selectedPrimaryDealer, setSelectedPrimaryDealer] = useState<Customer | null>(null);
  const debouncedSearch = useDebounce(search);

  const { data, isLoading, refetch } = useApiQuery(
    ['customers', debouncedSearch, String(page), customerTypeFilter],
    () => customerService.getAll({
      search: debouncedSearch || undefined,
      page,
      limit: 25,
      customer_type: customerTypeFilter || undefined,
    }),
  );

  const { data: primaryDealersData } = useApiQuery(
    ['primary-dealers'],
    () => customerService.getPrimaryDealers(),
  );
  const primaryDealers = primaryDealersData ?? [];

  const customers = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const { mutate: createCustomer, isPending: isCreating } = useApiMutation(
    (data: CustomerForm) => customerService.create(data),
    {
      successMessage: 'Customer created successfully',
      invalidateKeys: [['customers'], ['primary-dealers']],
      onSuccess: () => {
        setShowCreateModal(false);
        setForm({ ...emptyForm });
        setSelectedPrimaryDealer(null);
        refetch();
      },
    }
  );

  const { mutate: updateCustomer, isPending: isUpdating } = useApiMutation(
    (data: { id: string; payload: CustomerForm }) => customerService.update(data.id, data.payload),
    {
      successMessage: 'Customer updated successfully',
      invalidateKeys: [['customers'], ['primary-dealers']],
      onSuccess: () => {
        setEditingCustomer(null);
        setForm({ ...emptyForm });
        setSelectedPrimaryDealer(null);
        refetch();
      },
    }
  );

  const toggleStatus = async (customer: Customer) => {
    try {
      await customerService.update(customer.id, { is_active: !customer.is_active });
      toast.success(`Customer ${customer.is_active ? 'deactivated' : 'activated'} successfully`);
      refetch();
    } catch {
      toast.error('Failed to update customer status');
    }
  };

  const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  const MOBILE_REGEX = /^[0-9]{10,15}$/;

  const handleSubmit = () => {
    if (!form.firm_name.trim()) {
      toast.error('Firm name is required');
      return;
    }
    if (form.customer_type === 'Sub Dealer' && !form.primary_dealer_id) {
      toast.error('Please select a Primary Dealer for this Sub Dealer');
      return;
    }
    if (form.gstin && !GSTIN_REGEX.test(form.gstin)) {
      toast.error('Invalid GSTIN format (e.g., 22AAAAA0000A1Z5)');
      return;
    }
    if (form.contact_person_mobile && !MOBILE_REGEX.test(form.contact_person_mobile)) {
      toast.error('Contact mobile must be 10-15 digits');
      return;
    }
    if (editingCustomer) {
      updateCustomer({ id: editingCustomer.id, payload: form });
    } else {
      createCustomer(form);
    }
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setSelectedPrimaryDealer(null);
    setForm({
      firm_name: customer.firm_name,
      address: customer.address || '',
      delivery_location: customer.delivery_location || '',
      gstin: customer.gstin || '',
      private_marka: customer.private_marka || '',
      gr: customer.gr || '',
      contact_person_name: customer.contact_person_name || '',
      contact_person_mobile: customer.contact_person_mobile || '',
      customer_type: customer.customer_type ?? 'Primary Dealer',
      primary_dealer_id: customer.primary_dealer_id ?? null,
    });
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingCustomer(null);
    setForm({ ...emptyForm });
    setSelectedPrimaryDealer(null);
  };

  const updateField = (field: keyof CustomerForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePrimaryDealerSelect = (dealerId: string) => {
    const dealer = primaryDealers.find((d) => d.id === dealerId);
    if (dealer) {
      setSelectedPrimaryDealer(dealer);
      setForm((prev) => ({
        ...prev,
        primary_dealer_id: dealerId,
        address: dealer.address || '',
        delivery_location: dealer.delivery_location || '',
        gstin: dealer.gstin || '',
        contact_person_name: dealer.contact_person_name || '',
        contact_person_mobile: dealer.contact_person_mobile || '',
      }));
    }
  };

  const isSubDealer = form.customer_type === 'Sub Dealer';
  const autoFilledFields = isSubDealer && selectedPrimaryDealer != null;

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Building2 className="h-16 w-16 text-brand-text-muted/20 mb-4" />
        <h2 className="text-lg font-semibold text-brand-text-dark mb-2">Access Denied</h2>
        <p className="text-brand-text-muted">Only administrators and supervisors can manage customers.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Manage customer master records"
        action={
          isAdmin ? (
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setShowCreateModal(true)}>
              Add Customer
            </Button>
          ) : undefined
        }
      />

      <Card padding={false}>
        {/* Search + Filter bar */}
        <div className="p-4 border-b border-brand-border bg-binny-navy-50/50">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-text-muted" />
              <input
                type="text"
                placeholder="Search by firm name, GSTIN, or contact..."
                className="w-full pl-10 pr-4 py-2 border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              value={customerTypeFilter}
              onChange={(e) => { setCustomerTypeFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 bg-white"
            >
              <option value="">All Types</option>
              <option value="Primary Dealer">Primary Dealer</option>
              <option value="Sub Dealer">Sub Dealer</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">
            <SkeletonTable />
          </div>
        ) : customers.length === 0 ? (
          <div className="p-8 text-center text-brand-text-muted">
            {search || customerTypeFilter ? 'No customers match your filter.' : 'No customers yet. Add your first customer.'}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Firm Name</TableHeader>
                    <TableHeader>Type</TableHeader>
                    <TableHeader>Primary Dealer</TableHeader>
                    <TableHeader>Delivery Location</TableHeader>
                    <TableHeader>GSTIN</TableHeader>
                    <TableHeader>Contact Person</TableHeader>
                    <TableHeader>Mobile</TableHeader>
                    <TableHeader>Status</TableHeader>
                    {isAdmin && <TableHeader>Actions</TableHeader>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.firm_name}</TableCell>
                      <TableCell>
                        <Badge variant={customer.customer_type === 'Primary Dealer' ? 'blue' : 'orange'}>
                          {customer.customer_type ?? 'Primary Dealer'}
                        </Badge>
                      </TableCell>
                      <TableCell>{customer.primary_dealer_name || '-'}</TableCell>
                      <TableCell>{customer.delivery_location || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{customer.gstin || '-'}</TableCell>
                      <TableCell>{customer.contact_person_name || '-'}</TableCell>
                      <TableCell>{customer.contact_person_mobile || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={customer.is_active ? 'green' : 'gray'}>
                          {customer.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(customer)}>
                              Edit
                            </Button>
                            <button
                              onClick={() => toggleStatus(customer)}
                              className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                              title={customer.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {customer.is_active
                                ? <UserX className="h-4 w-4 text-red-500" />
                                : <UserCheck className="h-4 w-4 text-green-500" />
                              }
                            </button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-brand-border">
              {customers.map((customer) => (
                <div key={customer.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-brand-text-dark">{customer.firm_name}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={customer.customer_type === 'Primary Dealer' ? 'blue' : 'orange'} size="sm">
                        {customer.customer_type ?? 'Primary Dealer'}
                      </Badge>
                      <Badge variant={customer.is_active ? 'green' : 'gray'} size="sm">
                        {customer.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                  {customer.primary_dealer_name && (
                    <p className="text-xs text-brand-text-muted">Primary Dealer: {customer.primary_dealer_name}</p>
                  )}
                  {customer.delivery_location && (
                    <p className="text-xs text-brand-text-muted">Location: {customer.delivery_location}</p>
                  )}
                  {customer.contact_person_name && (
                    <p className="text-xs text-brand-text-muted">
                      Contact: {customer.contact_person_name} {customer.contact_person_mobile ? `(${customer.contact_person_mobile})` : ''}
                    </p>
                  )}
                  {customer.gstin && (
                    <p className="text-xs font-mono text-brand-text-muted">GSTIN: {customer.gstin}</p>
                  )}
                  {isAdmin && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(customer)}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => toggleStatus(customer)}>
                        {customer.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t border-brand-border">
                <p className="text-sm text-brand-text-muted">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={showCreateModal || !!editingCustomer}
        onClose={closeModal}
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
      >
        <div className="space-y-4">

          {/* Customer Type Selector */}
          <div>
            <p className="text-sm font-medium text-brand-text-dark mb-2">Customer Type</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="customer_type"
                  value="Primary Dealer"
                  checked={form.customer_type === 'Primary Dealer'}
                  onChange={() => {
                    setForm((prev) => ({ ...prev, customer_type: 'Primary Dealer', primary_dealer_id: null }));
                    setSelectedPrimaryDealer(null);
                  }}
                  className="text-binny-navy"
                />
                <span className="text-sm font-medium">Primary Dealer</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="customer_type"
                  value="Sub Dealer"
                  checked={form.customer_type === 'Sub Dealer'}
                  onChange={() => setForm((prev) => ({ ...prev, customer_type: 'Sub Dealer' }))}
                  className="text-binny-navy"
                />
                <span className="text-sm font-medium">Sub Dealer</span>
              </label>
            </div>
          </div>

          {/* Primary Dealer Selector (only for Sub Dealer) */}
          {isSubDealer && (
            <div>
              <label className="block text-sm font-medium text-brand-text-dark mb-1">
                Select Primary Dealer <span className="text-red-500">*</span>
              </label>
              <select
                value={form.primary_dealer_id || ''}
                onChange={(e) => handlePrimaryDealerSelect(e.target.value)}
                className="w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 bg-white"
              >
                <option value="">-- Select a Primary Dealer --</option>
                {primaryDealers.map((dealer) => (
                  <option key={dealer.id} value={dealer.id}>
                    {dealer.firm_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Firm Name — always editable */}
          <Input
            label="Firm Name *"
            placeholder="Enter firm name"
            value={form.firm_name}
            onChange={(e) => updateField('firm_name', e.target.value)}
          />

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-brand-text-dark mb-1">Address</label>
            <input
              type="text"
              placeholder="Full address"
              value={form.address || ''}
              onChange={(e) => !autoFilledFields && updateField('address', e.target.value)}
              readOnly={autoFilledFields}
              className={`w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 ${autoFilledFields ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
            />
          </div>

          {/* Delivery Location */}
          <div>
            <label className="block text-sm font-medium text-brand-text-dark mb-1">Delivery Location</label>
            <input
              type="text"
              placeholder="Delivery location"
              value={form.delivery_location || ''}
              onChange={(e) => !autoFilledFields && updateField('delivery_location', e.target.value)}
              readOnly={autoFilledFields}
              className={`w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 ${autoFilledFields ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
            />
          </div>

          {/* GSTIN */}
          <div>
            <label className="block text-sm font-medium text-brand-text-dark mb-1">GSTIN</label>
            <input
              type="text"
              placeholder="e.g., 22AAAAA0000A1Z5"
              value={form.gstin || ''}
              onChange={(e) => !autoFilledFields && updateField('gstin', e.target.value)}
              readOnly={autoFilledFields}
              className={`w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 ${autoFilledFields ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
            />
            {!autoFilledFields && (
              <p className="mt-1 text-xs text-brand-text-muted">15-character GST Identification Number</p>
            )}
          </div>

          {/* Private Marka — always editable */}
          <Input
            label="Private Marka"
            placeholder="Customer's private brand mark"
            value={form.private_marka || ''}
            onChange={(e) => updateField('private_marka', e.target.value)}
          />

          {/* GR — always editable */}
          <Input
            label="GR (Goods Receipt)"
            placeholder="GR number"
            value={form.gr || ''}
            onChange={(e) => updateField('gr', e.target.value)}
          />

          {/* Contact Person Name */}
          <div>
            <label className="block text-sm font-medium text-brand-text-dark mb-1">Contact Person Name</label>
            <input
              type="text"
              placeholder="Contact person name"
              value={form.contact_person_name || ''}
              onChange={(e) => !autoFilledFields && updateField('contact_person_name', e.target.value)}
              readOnly={autoFilledFields}
              className={`w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 ${autoFilledFields ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
            />
          </div>

          {/* Contact Person Mobile */}
          <div>
            <label className="block text-sm font-medium text-brand-text-dark mb-1">Contact Person Mobile</label>
            <input
              type="text"
              placeholder="e.g., 9876543210"
              value={form.contact_person_mobile || ''}
              onChange={(e) => !autoFilledFields && updateField('contact_person_mobile', e.target.value)}
              readOnly={autoFilledFields}
              className={`w-full px-3 py-2 border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 ${autoFilledFields ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
            />
          </div>

          {autoFilledFields && (
            <p className="text-xs text-brand-text-muted italic">
              Address, location, GSTIN, and contact are inherited from the Primary Dealer and cannot be edited here.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              isLoading={isCreating || isUpdating}
            >
              {editingCustomer ? 'Update Customer' : 'Create Customer'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
