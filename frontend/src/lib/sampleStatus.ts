// Friendly, warehouse-facing labels for a sample record's derived state.
// Unlike the old CREATED/ACTIVE/CLOSED/DISPATCHED lifecycle (a stored column),
// state is now DERIVED at read time from live mapping rows — EMPTY (nothing
// ever added), OPEN (currently holds something), DISPATCHED (held nothing
// open but has shipped at least one item historically). There is no more
// "Close Sample" step: a sample is dispatchable the moment it holds anything.
export type SampleStatusVariant = 'green' | 'blue' | 'gray' | 'orange' | 'yellow' | 'red' | 'purple';

const SAMPLE_STATE_DISPLAY: Record<string, { label: string; variant: SampleStatusVariant }> = {
  EMPTY: { label: 'Empty', variant: 'gray' },
  OPEN: { label: 'Open', variant: 'green' },
  DISPATCHED: { label: 'Sent', variant: 'blue' },
};

export function sampleStatusLabel(state: string): string {
  return SAMPLE_STATE_DISPLAY[state]?.label ?? state;
}

export function sampleStatusVariant(state: string): SampleStatusVariant {
  return SAMPLE_STATE_DISPLAY[state]?.variant ?? 'gray';
}
