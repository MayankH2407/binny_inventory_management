'use client';

import { Toaster } from 'react-hot-toast';

export default function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: '#FFFFFF',
          color: '#1A1A2E',
          borderRadius: '12px',
          border: '1px solid #E5E7EB',
          padding: '12px 16px',
          fontSize: '14px',
          boxShadow: '0 8px 24px -4px rgba(45, 42, 110, 0.12), 0 2px 8px -2px rgba(45, 42, 110, 0.06)',
        },
        success: {
          style: {
            borderLeft: '4px solid #16A34A',
          },
          iconTheme: {
            primary: '#16A34A',
            secondary: '#FFFFFF',
          },
        },
        error: {
          style: {
            borderLeft: '4px solid #DC2626',
          },
          iconTheme: {
            primary: '#DC2626',
            secondary: '#FFFFFF',
          },
        },
      }}
    />
  );
}
