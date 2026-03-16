import { create } from 'zustand';
import type { ScanSessionType } from '@/types';

interface ScanStore {
  scannedItems: string[];
  sessionType: ScanSessionType | null;
  isScanning: boolean;
  startSession: (type: ScanSessionType) => void;
  addItem: (qrCode: string) => boolean;
  removeItem: (qrCode: string) => void;
  clearItems: () => void;
  endSession: () => void;
  setScanning: (scanning: boolean) => void;
}

export const useScanStore = create<ScanStore>((set, get) => ({
  scannedItems: [],
  sessionType: null,
  isScanning: false,

  startSession: (type: ScanSessionType) => {
    set({
      sessionType: type,
      scannedItems: [],
      isScanning: false,
    });
  },

  addItem: (qrCode: string) => {
    const { scannedItems } = get();
    if (scannedItems.includes(qrCode)) {
      return false;
    }
    set({ scannedItems: [...scannedItems, qrCode] });
    return true;
  },

  removeItem: (qrCode: string) => {
    const { scannedItems } = get();
    set({ scannedItems: scannedItems.filter((item) => item !== qrCode) });
  },

  clearItems: () => {
    set({ scannedItems: [] });
  },

  endSession: () => {
    set({
      sessionType: null,
      scannedItems: [],
      isScanning: false,
    });
  },

  setScanning: (scanning: boolean) => {
    set({ isScanning: scanning });
  },
}));
