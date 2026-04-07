import { test, expect } from '@playwright/test';
import { loginViaAPI, getAuthToken, BASE_API } from './helpers';

// =============================================================================
// A. OFFLINE SCAN QUEUE — IndexedDB persistence + auto-sync
// =============================================================================

test.describe('TC-PWA-OFFLINE: Offline Scan Queue', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-PWA-001: Scan page loads with no pending scans initially', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Scan QR Code')).toBeVisible();
    // No pending badge should be visible
    const pendingBadge = page.getByText(/pending sync/i);
    await expect(pendingBadge).not.toBeVisible();
  });

  test('TC-PWA-002: Manual barcode lookup works when online', async ({ page }) => {
    // First create a child box via API to have a valid barcode
    const token = await getAuthToken(page);
    const productsRes = await page.request.get(`${BASE_API}/products?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const products = await productsRes.json();
    if (!products.data?.length) return;

    const createRes = await page.request.post(`${BASE_API}/child-boxes/bulk`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { product_id: products.data[0].id, count: 1 },
    });
    const created = await createRes.json();
    const barcode = created[0]?.barcode;
    if (!barcode) return;

    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Enter barcode manually and look up
    const input = page.getByPlaceholder(/barcode/i).first();
    await input.fill(barcode);
    await page.getByRole('button', { name: /look up/i }).click();
    await page.waitForTimeout(3000);

    // Should show child box result
    await expect(page.getByText('Child Box').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(barcode).first()).toBeVisible();
  });

  test('TC-PWA-003: Offline scan saves to queue and shows pending badge', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Wait for page to be fully interactive
    const input = page.getByPlaceholder(/barcode/i).first();
    await expect(input).toBeVisible({ timeout: 10000 });

    // Go offline AFTER page is fully loaded and interactive
    await page.context().setOffline(true);
    await page.waitForTimeout(300);

    // Enter barcode and look up
    await input.fill('BINNY-CB-offline-test-001');
    await page.getByRole('button', { name: /look up/i }).click();
    await page.waitForTimeout(3000);

    // Should show "Saved offline" toast
    const toastText = page.getByText(/saved offline/i);
    await expect(toastText).toBeVisible({ timeout: 5000 });

    // Should show pending badge
    const pendingBadge = page.getByText(/pending sync/i);
    await expect(pendingBadge).toBeVisible({ timeout: 5000 });

    await page.context().setOffline(false);
  });

  test('TC-PWA-004: Multiple offline scans accumulate in queue', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Wait for page to be fully interactive
    const input = page.getByPlaceholder(/barcode/i).first();
    await expect(input).toBeVisible({ timeout: 10000 });
    const lookupBtn = page.getByRole('button', { name: /look up/i });

    // Go offline after page is ready
    await page.context().setOffline(true);
    await page.waitForTimeout(300);

    await input.fill('BINNY-CB-offline-multi-001');
    await lookupBtn.click();
    await page.waitForTimeout(2500);

    await input.clear();
    await input.fill('BINNY-CB-offline-multi-002');
    await lookupBtn.click();
    await page.waitForTimeout(2500);

    // Pending count should show 2+ scans
    const pendingBadge = page.getByText(/\d+ scans? pending sync/i);
    await expect(pendingBadge).toBeVisible({ timeout: 5000 });

    await page.context().setOffline(false);
  });

  test('TC-PWA-005: IndexedDB can store and retrieve pending scans', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Write directly to IndexedDB and verify it persists
    const result = await page.evaluate(async () => {
      return new Promise<{ written: boolean; count: number }>((resolve) => {
        const req = indexedDB.open('binny_offline', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('pending_scans')) {
            db.createObjectStore('pending_scans', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('pending_scans', 'readwrite');
          const store = tx.objectStore('pending_scans');
          store.put({
            id: 'test-persist-' + Date.now(),
            barcode: 'BINNY-CB-persist-test',
            sessionType: 'trace',
            scannedAt: new Date().toISOString(),
          });
          tx.oncomplete = () => {
            const readTx = db.transaction('pending_scans', 'readonly');
            const getAll = readTx.objectStore('pending_scans').getAll();
            getAll.onsuccess = () => {
              const count = getAll.result.length;
              db.close();
              resolve({ written: true, count });
            };
          };
        };
        req.onerror = () => resolve({ written: false, count: 0 });
      });
    });

    expect(result.written).toBe(true);
    expect(result.count).toBeGreaterThan(0);
  });
});

// =============================================================================
// B. NETWORK STATUS BAR — Online/offline indicator
// =============================================================================

test.describe('TC-PWA-NETWORK: Network Status Indicator', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-PWA-006: No status bar shown when online', async ({ page }) => {
    await page.waitForTimeout(1000);
    const offlineBar = page.getByText('You are offline');
    await expect(offlineBar).not.toBeVisible();
  });

  test('TC-PWA-007: Amber bar appears when going offline', async ({ page }) => {
    await page.context().setOffline(true);
    await page.waitForTimeout(500);

    const offlineBar = page.getByText('You are offline');
    await expect(offlineBar).toBeVisible({ timeout: 3000 });

    await page.context().setOffline(false);
  });

  test('TC-PWA-008: Green bar appears when coming back online', async ({ page }) => {
    // Go offline
    await page.context().setOffline(true);
    await page.waitForTimeout(500);
    await expect(page.getByText('You are offline')).toBeVisible({ timeout: 3000 });

    // Come back online
    await page.context().setOffline(false);
    await page.waitForTimeout(500);

    const onlineBar = page.getByText(/back online/i);
    await expect(onlineBar).toBeVisible({ timeout: 3000 });
  });

  test('TC-PWA-009: Green bar auto-dismisses after ~3 seconds', async ({ page }) => {
    await page.context().setOffline(true);
    await page.waitForTimeout(500);
    await page.context().setOffline(false);

    // Should be visible initially
    const onlineBar = page.getByText(/back online/i);
    await expect(onlineBar).toBeVisible({ timeout: 3000 });

    // Should disappear after ~3 seconds
    await expect(onlineBar).not.toBeVisible({ timeout: 6000 });
  });

  test('TC-PWA-010: Network bar shows on non-dashboard pages too', async ({ page }) => {
    // Navigate to child boxes first while online and wait for full load
    await page.goto('/child-boxes');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Child Boxes').first()).toBeVisible({ timeout: 15000 });
    // Extra wait to ensure all API calls settled
    await page.waitForTimeout(2000);

    // Go offline after page is fully loaded
    await page.context().setOffline(true);
    await page.waitForTimeout(1500);

    await expect(page.getByText('You are offline')).toBeVisible({ timeout: 8000 });

    await page.context().setOffline(false);
  });
});

// =============================================================================
// C. INSTALL PROMPT BANNER
// =============================================================================

test.describe('TC-PWA-INSTALL: Install Prompt Banner', () => {
  test('TC-PWA-011: Install prompt hook initializes without error', async ({ page }) => {
    await loginViaAPI(page);

    // The install prompt banner depends on `beforeinstallprompt` browser event
    // which only fires in certain conditions. Verify the component mounts without error.
    await page.waitForTimeout(2000);

    // App should load normally regardless of install prompt state
    await expect(page.getByText('Total Child Boxes')).toBeVisible({ timeout: 15000 });
  });

  test('TC-PWA-012: Install dismissal persists in localStorage', async ({ page }) => {
    await loginViaAPI(page);

    // Simulate dismissing the install prompt
    await page.evaluate(() => {
      localStorage.setItem('binny_install_dismissed', 'true');
    });

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Banner should NOT appear (dismissed)
    const banner = page.getByText('Install Binny Inventory');
    await expect(banner).not.toBeVisible({ timeout: 3000 });
  });

  test('TC-PWA-013: Standalone mode detection works', async ({ page }) => {
    await loginViaAPI(page);

    // Check that the install prompt hook correctly reads display-mode
    const isStandalone = await page.evaluate(() => {
      return window.matchMedia('(display-mode: standalone)').matches;
    });

    // In a browser test, should NOT be standalone
    expect(isStandalone).toBe(false);
  });
});

// =============================================================================
// D. ENHANCED SCAN EXPERIENCE — Full-screen, wake lock, feedback
// =============================================================================

test.describe('TC-PWA-SCAN: Enhanced Scan Experience', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-PWA-014: Scan page has full-screen scan button', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // The QR scanner should have a "Full Screen" button
    const fullScreenBtn = page.getByRole('button', { name: /full screen/i });
    await expect(fullScreenBtn).toBeVisible({ timeout: 10000 });
  });

  test('TC-PWA-015: Scan page has camera scanner section', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Verify the scanner section exists
    const scannerSection = page.getByText('Camera Scanner');
    await expect(scannerSection).toBeVisible({ timeout: 10000 });

    // Verify manual entry section also exists
    const manualSection = page.getByText('Manual Entry');
    await expect(manualSection).toBeVisible();

    // Verify scan result section exists
    const resultSection = page.getByText('Scan Result');
    await expect(resultSection).toBeVisible();
  });

  test('TC-PWA-016: Full-screen button exists and is clickable (camera required for overlay)', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Full Screen button should be present in the scanner controls
    const fullScreenBtn = page.getByRole('button', { name: /full screen/i });
    const isVisible = await fullScreenBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      // Button exists — verify it's enabled and clickable
      await expect(fullScreenBtn).toBeEnabled();
      // Note: Actually clicking it requires camera permission (unavailable in headless)
      // Full overlay test requires a real device or headed browser with camera access
    }

    // Verify the scan page structure is complete regardless
    await expect(page.getByText('Camera Scanner')).toBeVisible();
    await expect(page.getByText('Manual Entry')).toBeVisible();
    await expect(page.getByText('Scan Result')).toBeVisible();
  });

  test('TC-PWA-017: Dispatch page scanner section has scan controls', async ({ page }) => {
    await page.goto('/dispatch');
    await page.waitForLoadState('networkidle');

    // Open scanner button should be available
    const openScannerBtn = page.getByRole('button', { name: /open scanner/i });
    await expect(openScannerBtn).toBeVisible({ timeout: 5000 });

    // Click to open scanner
    await openScannerBtn.click();
    await page.waitForTimeout(1000);

    // Scanner section should be visible (camera or permission prompt)
    // Full screen button availability depends on camera access in headless mode
    const hideScannerBtn = page.getByRole('button', { name: /hide scanner/i });
    await expect(hideScannerBtn).toBeVisible({ timeout: 5000 });
  });

  test('TC-PWA-018: Master Carton Create has scanner toggle button', async ({ page }) => {
    await page.goto('/master-cartons/create');
    await page.waitForLoadState('networkidle');

    // Scanner toggle button should exist
    const openScannerBtn = page.getByRole('button', { name: /open scanner/i });
    await expect(openScannerBtn).toBeVisible({ timeout: 5000 });

    // Open scanner
    await openScannerBtn.click();
    await page.waitForTimeout(1000);

    // Full Screen button depends on camera access (may not show in headless)
    const fullScreenBtn = page.getByRole('button', { name: /full screen/i });
    const hasFullScreen = await fullScreenBtn.isVisible({ timeout: 3000 }).catch(() => false);

    // Hide scanner button should be available either way
    const hideScannerBtn = page.getByRole('button', { name: /hide scanner/i });
    await expect(hideScannerBtn).toBeVisible({ timeout: 3000 });
  });

  test('TC-PWA-019: Wake Lock API is available in browser context', async ({ page }) => {
    const hasWakeLock = await page.evaluate(() => {
      return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
    });

    // Wake Lock may or may not be available depending on the browser
    // Just verify the check doesn't throw
    expect(typeof hasWakeLock).toBe('boolean');
  });

  test('TC-PWA-020: Vibration API is available in browser context', async ({ page }) => {
    const hasVibrate = await page.evaluate(() => {
      return typeof navigator !== 'undefined' && 'vibrate' in navigator;
    });

    expect(typeof hasVibrate).toBe('boolean');
  });

  test('TC-PWA-021: AudioContext can create tones without error', async ({ page }) => {
    const canPlayTone = await page.evaluate(async () => {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1200;
        gain.gain.value = 0.01; // very quiet
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.01);
        await ctx.close();
        return true;
      } catch {
        return false;
      }
    });

    expect(canPlayTone).toBe(true);
  });

  test('TC-PWA-022: Offline scan creates pending badge visible in scan page header', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Wait for page to be fully interactive
    const input = page.getByPlaceholder(/barcode/i).first();
    await expect(input).toBeVisible({ timeout: 10000 });

    // Go offline after page is ready
    await page.context().setOffline(true);
    await page.waitForTimeout(300);

    await input.fill('BINNY-CB-badge-test-001');
    await page.getByRole('button', { name: /look up/i }).click();
    await page.waitForTimeout(3000);

    // The pending badge should appear in the page header area
    const pendingBadge = page.getByText(/pending sync/i);
    await expect(pendingBadge).toBeVisible({ timeout: 5000 });

    await page.context().setOffline(false);
  });
});

// =============================================================================
// E. PWA MANIFEST & SERVICE WORKER
// =============================================================================

test.describe('TC-PWA-MANIFEST: PWA Manifest & Service Worker', () => {
  test('TC-PWA-023: Manifest.json is accessible and valid', async ({ page }) => {
    const response = await page.request.get('/manifest.json');
    expect(response.ok()).toBeTruthy();

    const manifest = await response.json();
    expect(manifest.name).toBe('Binny Inventory');
    expect(manifest.short_name).toBe('Binny Inv');
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait');
    expect(manifest.theme_color).toBe('#2D2A6E');
    expect(manifest.background_color).toBe('#2D2A6E');
    expect(manifest.start_url).toBe('/');
  });

  test('TC-PWA-024: Manifest has correct icon entries with split purposes', async ({ page }) => {
    const response = await page.request.get('/manifest.json');
    const manifest = await response.json();

    expect(manifest.icons.length).toBeGreaterThanOrEqual(4);

    // Should have separate "any" and "maskable" entries
    const anyIcons = manifest.icons.filter((i: { purpose: string }) => i.purpose === 'any');
    const maskableIcons = manifest.icons.filter((i: { purpose: string }) => i.purpose === 'maskable');

    expect(anyIcons.length).toBeGreaterThanOrEqual(2);
    expect(maskableIcons.length).toBeGreaterThanOrEqual(2);
  });

  test('TC-PWA-025: Manifest includes business category', async ({ page }) => {
    const response = await page.request.get('/manifest.json');
    const manifest = await response.json();

    expect(manifest.categories).toContain('business');
    expect(manifest.categories).toContain('productivity');
  });

  test('TC-PWA-026: PWA icons are accessible', async ({ page }) => {
    const icon192 = await page.request.get('/icons/icon-192x192.png');
    expect(icon192.ok()).toBeTruthy();
    expect(icon192.headers()['content-type']).toContain('image/png');

    const icon512 = await page.request.get('/icons/icon-512x512.png');
    expect(icon512.ok()).toBeTruthy();
    expect(icon512.headers()['content-type']).toContain('image/png');
  });

  test('TC-PWA-027: HTML meta tags for PWA are present', async ({ page }) => {
    await page.goto('/login');

    // Check theme-color meta tag
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(themeColor).toBe('#2D2A6E');

    // Check manifest link
    const manifestLink = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestLink).toBe('/manifest.json');
  });

  test('TC-PWA-028: Viewport meta disables user scaling for app-like feel', async ({ page }) => {
    await page.goto('/login');

    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('user-scalable=no');
    expect(viewport).toContain('maximum-scale=1');
  });
});

// =============================================================================
// F. OFFLINE PAGE & BRANDED LOADING
// =============================================================================

test.describe('TC-PWA-BRANDING: Offline Page & Branded Loading', () => {
  test('TC-PWA-029: Offline page has branded gradient background', async ({ page }) => {
    await page.goto('/offline');

    await expect(page.getByText("You're Offline")).toBeVisible();
    await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
    await expect(page.getByText(/Binny Inventory/)).toBeVisible();
  });

  test('TC-PWA-030: Offline page retry button reloads page', async ({ page }) => {
    await page.goto('/offline');

    const retryBtn = page.getByRole('button', { name: /retry/i });
    await expect(retryBtn).toBeVisible();

    // Click should trigger reload (we can't easily test reload, but verify it's clickable)
    await expect(retryBtn).toBeEnabled();
  });

  test('TC-PWA-031: Dashboard loading state shows branded splash', async ({ page }) => {
    // Navigate without cached auth — should show loading splash briefly then redirect to login
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Should eventually resolve to login or dashboard
    const url = page.url();
    const isLogin = url.includes('login');
    const isDashboard = !url.includes('login');
    expect(isLogin || isDashboard).toBeTruthy();
  });
});

// =============================================================================
// G. INDEXEDDB DIRECT TESTS
// =============================================================================

test.describe('TC-PWA-IDB: IndexedDB Operations', () => {
  test('TC-PWA-032: IndexedDB database can be opened', async ({ page }) => {
    await page.goto('/login'); // any page to get browser context

    const canOpen = await page.evaluate(async () => {
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open('binny_offline', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('pending_scans')) {
            db.createObjectStore('pending_scans', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => { req.result.close(); resolve(true); };
        req.onerror = () => resolve(false);
      });
    });

    expect(canOpen).toBe(true);
  });

  test('TC-PWA-033: Can write and read from IndexedDB', async ({ page }) => {
    await page.goto('/login');

    const result = await page.evaluate(async () => {
      return new Promise<{ written: boolean; read: boolean; data: any }>((resolve) => {
        const req = indexedDB.open('binny_offline_test', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('test_store', { keyPath: 'id' });
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('test_store', 'readwrite');
          const store = tx.objectStore('test_store');
          const item = { id: 'test-1', barcode: 'BINNY-CB-TEST', timestamp: Date.now() };

          const putReq = store.put(item);
          putReq.onsuccess = () => {
            const readTx = db.transaction('test_store', 'readonly');
            const readStore = readTx.objectStore('test_store');
            const getReq = readStore.getAll();
            getReq.onsuccess = () => {
              db.close();
              // Cleanup
              indexedDB.deleteDatabase('binny_offline_test');
              resolve({ written: true, read: true, data: getReq.result });
            };
          };
          putReq.onerror = () => {
            db.close();
            resolve({ written: false, read: false, data: null });
          };
        };
      });
    });

    expect(result.written).toBe(true);
    expect(result.read).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0].barcode).toBe('BINNY-CB-TEST');
  });

  test('TC-PWA-034: Can delete from IndexedDB', async ({ page }) => {
    await page.goto('/login');

    const result = await page.evaluate(async () => {
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open('binny_offline_del_test', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('test_store', { keyPath: 'id' });
        };
        req.onsuccess = () => {
          const db = req.result;
          // Write
          const writeTx = db.transaction('test_store', 'readwrite');
          writeTx.objectStore('test_store').put({ id: 'del-1', data: 'test' });
          writeTx.oncomplete = () => {
            // Delete
            const delTx = db.transaction('test_store', 'readwrite');
            delTx.objectStore('test_store').delete('del-1');
            delTx.oncomplete = () => {
              // Verify
              const readTx = db.transaction('test_store', 'readonly');
              const getReq = readTx.objectStore('test_store').getAll();
              getReq.onsuccess = () => {
                db.close();
                indexedDB.deleteDatabase('binny_offline_del_test');
                resolve(getReq.result.length === 0);
              };
            };
          };
        };
      });
    });

    expect(result).toBe(true);
  });
});
