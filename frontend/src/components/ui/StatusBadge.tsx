import Badge from './Badge';

type StatusType = 'GENERATED' | 'FREE' | 'PACKED' | 'SAMPLE' | 'ECOMMERCE' | 'DISPATCHED' | 'ACTIVE' | 'CLOSED' | 'CREATED' | 'IN_TRANSIT' | 'DELIVERED';

type BadgeVariant = 'green' | 'blue' | 'gray' | 'orange' | 'yellow' | 'red' | 'purple';

interface StatusBadgeProps {
  status: StatusType | string;
  size?: 'sm' | 'md';
  // Override the default label/variant for this one call site — e.g. Samples
  // shows "Open"/"Ready to dispatch" instead of the generic "Active"/"Closed"
  // that Master Cartons and E-commerce (which share the same status values)
  // still show. Additive: omit both to get today's default behavior unchanged.
  label?: string;
  variant?: BadgeVariant;
}

const statusConfig: Record<string, { variant: 'green' | 'blue' | 'gray' | 'orange' | 'yellow' | 'red' | 'purple'; label: string }> = {
  GENERATED: { variant: 'gray', label: 'Generated' },
  FREE: { variant: 'green', label: 'Free' },
  PACKED: { variant: 'blue', label: 'Packed' },
  SAMPLE: { variant: 'red', label: 'Sample' },
  ECOMMERCE: { variant: 'purple', label: 'E-commerce' },
  DISPATCHED: { variant: 'gray', label: 'Dispatched' },
  ACTIVE: { variant: 'green', label: 'Active' },
  CLOSED: { variant: 'orange', label: 'Closed' },
  CREATED: { variant: 'yellow', label: 'Created' },
  IN_TRANSIT: { variant: 'blue', label: 'In Transit' },
  DELIVERED: { variant: 'green', label: 'Delivered' },
};

export default function StatusBadge({ status, size = 'md', label, variant }: StatusBadgeProps) {
  const config = statusConfig[status] || { variant: 'gray' as const, label: status };

  return (
    <Badge variant={variant ?? config.variant} size={size} dot>
      {label ?? config.label}
    </Badge>
  );
}
