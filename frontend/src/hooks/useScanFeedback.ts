'use client';

import { useRef, useCallback } from 'react';

function playTone(frequency: number, durationMs: number, volume: number = 0.15) {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.value = volume;

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + durationMs / 1000);

    // Clean up after tone finishes
    setTimeout(() => ctx.close(), durationMs + 100);
  } catch {
    // AudioContext may not be available
  }
}

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

export function useScanFeedback() {
  const lastFeedbackTime = useRef(0);

  const triggerSuccess = useCallback(() => {
    const now = Date.now();
    // Debounce: min 200ms between feedbacks
    if (now - lastFeedbackTime.current < 200) return;
    lastFeedbackTime.current = now;

    vibrate(100);
    playTone(1200, 100);
  }, []);

  const triggerError = useCallback(() => {
    const now = Date.now();
    if (now - lastFeedbackTime.current < 200) return;
    lastFeedbackTime.current = now;

    vibrate([50, 50, 50]);
    playTone(400, 150);
  }, []);

  // Distinct from success/error: for a scan that's valid but not clean (e.g.
  // duplicate, out-of-scope, status conflict) — worth a heads-up, not a hard
  // stop, so counting staff don't pause on every one.
  const triggerWarning = useCallback(() => {
    const now = Date.now();
    if (now - lastFeedbackTime.current < 200) return;
    lastFeedbackTime.current = now;

    vibrate([80, 40, 80]);
    playTone(700, 120);
  }, []);

  return { triggerSuccess, triggerError, triggerWarning };
}
