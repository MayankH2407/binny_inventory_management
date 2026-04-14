import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth.types';
import * as sectionService from '../services/section.service';
import { sendSuccess } from '../utils/response';

export async function createSection(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const section = await sectionService.createSection(req.body, req.user!.userId);
    sendSuccess(res, section, 'Section created successfully', 201);
  } catch (error) {
    next(error);
  }
}

export async function getSections(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const sections = await sectionService.getSections(includeInactive);
    sendSuccess(res, sections, 'Sections retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function getSectionById(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const section = await sectionService.getSectionById(req.params.id);
    sendSuccess(res, section, 'Section retrieved successfully');
  } catch (error) {
    next(error);
  }
}

export async function updateSection(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const section = await sectionService.updateSection(req.params.id, req.body, req.user!.userId);
    sendSuccess(res, section, 'Section updated successfully');
  } catch (error) {
    next(error);
  }
}

export async function deleteSection(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await sectionService.deleteSection(req.params.id, req.user!.userId);
    sendSuccess(res, null, 'Section deactivated successfully');
  } catch (error) {
    next(error);
  }
}
