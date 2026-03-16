import Badge from './Badge';

type StatusType = 'FREE' | 'PACKED' | 'DISPATCHED' | 'ACTIVE' | 'CLOSED' | 'CREATED' | 'IN_TRANSIT' | 'DELIVERED';

interface StatusBadgeProps {
  status: StatusType | string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<string, { variant: 'green' | 'blue' | 'gray' | 'orange' | 'yellow' | 'red'; label: string }> = {
  FREE: { variant: 'green', label: 'Free' },
  PACKED: { variant: 'blue', label: 'Packed' },
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
