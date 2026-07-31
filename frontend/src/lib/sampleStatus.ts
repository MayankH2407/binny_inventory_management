// Friendly, warehouse-facing labels for the sample lifecycle — the DB status
// values (CREATED/ACTIVE/CLOSED/DISPATCHED) are inventory-system jargon; these
// are presentation-only, no schema/enum change. CREATED vs ACTIVE is purely
// "does this sample have any boxes yet" (see recomputeSampleChildCount on the
// backend), so "Empty"/"Open" is an honest rendering of a distinction the DB
// already derives, not a new concept.
export type SampleStatusVariant = 'green' | 'blue' | 'gray' | 'orange' | 'yellow' | 'red' | 'purple';

const SAMPLE_STATUS_DISPLAY: Record<string, { label: string; variant: SampleStatusVariant }> = {
  CREATED: { label: 'Empty', variant: 'gray' },
  ACTIVE: { label: 'Open', variant: 'green' },
  CLOSED: { label: 'Ready to dispatch', variant: 'blue' },
  DISPATCHED: { label: 'Sent', variant: 'gray' },
};

export function sampleStatusLabel(status: string): string {
  return SAMPLE_STATUS_DISPLAY[status]?.label ?? status;
}

export function sampleStatusVariant(status: string): SampleStatusVariant {
  return SAMPLE_STATUS_DISPLAY[status]?.variant ?? 'gray';
}
