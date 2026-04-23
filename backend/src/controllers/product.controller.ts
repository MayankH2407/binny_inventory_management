import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as productService from '../services/product.service';
import { sendSuccess, sendPaginated } from '../utils/response';

export async function createProduct(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const product = await productService.createProduct(req.body, req.user!.userId);
    sendSuccess(res, product, 'Product created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getProducts(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit, article_code, search, is_active, category, section, location, colour, size, article_name, article_group } = req.query as {
      page?: number; limit?: number; article_code?: string; search?: string; is_active?: boolean;
      category?: string; section?: string; location?: string; colour?: string; size?: string;
      article_name?: string; article_group?: string;
    };
    const result = await productService.getProducts(
      { article_code, search, is_active, category, section, location, colour, size, article_name, article_group },
      page || 1,
      limit || 25
    );
    sendPaginated(res, result.data, result.total, page || 1, limit || 25, 'Products retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getProductById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const product = await productService.getProductById(req.params.id);
    sendSuccess(res, product, 'Product retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function updateProduct(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const product = await productService.updateProduct(req.params.id, req.body, req.user!.userId);
    sendSuccess(res, product, 'Product updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteProduct(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await productService.deleteProduct(req.params.id, req.user!.userId);
    sendSuccess(res, null, 'Product deactivated successfully');
  } catch (error) {
    next(error);
  }
}

export async function getProductColours(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const colours = await productService.getColoursByProduct(req.params.id);
    sendSuccess(res, colours, 'Product colours retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getProductSizes(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const products = await productService.getSiblingProducts(req.params.id);
    sendSuccess(res, products, 'Product sizes retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function uploadProductImage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const file = (req as AuthenticatedRequest & { file?: { filename: string } }).file;
    if (!file) {
      res.status(400).json({ success: false, message: 'No image file provided' });
      return;
    }

    const imageUrl = `/uploads/product-images/${file.filename}`;
    await productService.updateProductImage(id, imageUrl, req.user!.userId);

    res.json({
      success: true,
      message: 'Product image uploaded successfully',
      data: { image_url: imageUrl },
    });
  } catch (error) {
    next(error);
  }
}

export async function bulkCreateBySizeRange(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const products = await productService.bulkCreateProductsBySizeRange(req.body, req.user!.userId);
    sendSuccess(res, products, `${products.length} product(s) created successfully`, 201);
  } catch (error) {
    next(error);
  }
}

export async function bulkUploadProducts(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const file = (req as AuthenticatedRequest & { file?: { buffer: Buffer } }).file;
    if (!file) {
      res.status(400).json({ success: false, message: 'No CSV file provided' });
      return;
    }

    const result = await productService.bulkCreateProducts(file.buffer, req.user!.userId);
    sendSuccess(res, result, `Bulk upload complete: ${result.created} products created${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`, 201);
  } catch (error) {
    next(error);
  }
}

export function downloadSampleCsv(
  _req: AuthenticatedRequest,
  res: Response,
): void {
  const headers = [
    'article_code', 'article_name', 'colour', 'size', 'mrp',
    'section', 'category', 'location', 'description',
    'article_group', 'hsn_code', 'size_from', 'size_to',
  ];
  const sampleRows = [
    ['ART-001', 'Classic Hawaii Slipper', 'Black', '8', '749', 'Hawaii', 'Gents', 'VKIA', 'Premium hawaii slipper', 'Premium', '6402', '6', '10'],
    ['ART-001', 'Classic Hawaii Slipper', 'Black', '9', '749', 'Hawaii', 'Gents', 'VKIA', 'Premium hawaii slipper', 'Premium', '6402', '6', '10'],
    ['ART-002', 'Ladies PU Sandal', 'Red', '6', '999', 'PU', 'Ladies', 'MIA', 'Comfortable PU sandal', 'Standard', '6402', '4', '8'],
  ];
  const csv = [headers.join(','), ...sampleRows.map((r) => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=product_upload_sample.csv');
  res.send(csv);
}
