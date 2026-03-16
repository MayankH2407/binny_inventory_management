import QRCode from 'qrcode';
import { env } from '../config/env';
import { logger } from './logger';

interface QROptions {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

const DEFAULT_OPTIONS: QROptions = {
  width: 300,
  margin: 2,
  errorCorrectionLevel: 'M',
};

function buildChildBoxPayload(childBoxId: string, qrBaseUrl?: string): string {
  const baseUrl = qrBaseUrl || env.QR_BASE_URL;
  if (baseUrl && baseUrl.length > 0) {
    return `${baseUrl}/cb/${childBoxId}`;
  }
  return `BINNY-CB-${childBoxId}`;
}

function buildMasterCartonPayload(cartonId: string): string {
  return `BINNY-MC-${cartonId}`;
}

async function generateQRDataUri(payload: string, options: QROptions = {}): Promise<string> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  try {
    const dataUri = await QRCode.toDataURL(payload, {
      width: mergedOptions.width,
      margin: mergedOptions.margin,
      errorCorrectionLevel: mergedOptions.errorCorrectionLevel,
      type: 'image/png',
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
    return dataUri;
  } catch (error) {
    logger.error(`Failed to generate QR code for payload: ${payload}`, error);
    throw error;
  }
}

async function generateQRBuffer(payload: string, options: QROptions = {}): Promise<Buffer> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  try {
    const buffer = await QRCode.toBuffer(payload, {
      width: mergedOptions.width,
      margin: mergedOptions.margin,
      errorCorrectionLevel: mergedOptions.errorCorrectionLevel,
      type: 'png',
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });
    return buffer;
  } catch (error) {
    logger.error(`Failed to generate QR buffer for payload: ${payload}`, error);
    throw error;
  }
}

export async function generateChildBoxQR(
  childBoxId: string,
  qrBaseUrl?: string,
  options?: QROptions
): Promise<string> {
  const payload = buildChildBoxPayload(childBoxId, qrBaseUrl);
  logger.debug(`Generating child box QR for: ${payload}`);
  return generateQRDataUri(payload, options);
}

export async function generateMasterCartonQR(
  cartonId: string,
  options?: QROptions
): Promise<string> {
  const payload = buildMasterCartonPayload(cartonId);
  logger.debug(`Generating master carton QR for: ${payload}`);
  return generateQRDataUri(payload, options);
}

export async function generateChildBoxQRBuffer(
  childBoxId: string,
  qrBaseUrl?: string,
  options?: QROptions
): Promise<Buffer> {
  const payload = buildChildBoxPayload(childBoxId, qrBaseUrl);
  return generateQRBuffer(payload, options);
}

export async function generateMasterCartonQRBuffer(
  cartonId: string,
  options?: QROptions
): Promise<Buffer> {
  const payload = buildMasterCartonPayload(cartonId);
  return generateQRBuffer(payload, options);
}
