import Badge from './Badge';

type StatusType = 'GENERATED' | 'FREE' | 'PACKED' | 'SAMPLE' | 'ECOMMERCE' | 'DISPATCHED' | 'ACTIVE' | 'CLOSED' | 'CREATED' | 'IN_TRANSIT' | 'DELIVERED';

interface StatusBadgeProps {
  status: StatusType | string;
  size?: 'sm' | 'md';
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

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status] || { variant: 'gray' as const, label: status };

  return (
    <Badge variant={config.variant} size={size} dot>
      {config.label}
    </Badge>
  );
}
