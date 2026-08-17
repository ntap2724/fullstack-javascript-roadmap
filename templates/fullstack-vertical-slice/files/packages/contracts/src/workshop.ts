import { z } from 'zod';

export const WorkshopSummarySchema = z
  .object({
    id: z.uuid(),
    title: z.string().min(1).max(120),
    startsAt: z.iso.datetime({ offset: true }),
    capacity: z.number().int().positive(),
    enrollmentCount: z.number().int().nonnegative(),
    registrationOpen: z.boolean(),
  })
  .strict();

export const WorkshopListResponseSchema = z
  .object({
    items: z.array(WorkshopSummarySchema),
  })
  .strict();

export const ApiErrorSchema = z
  .object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    message: z.string().min(1),
    requestId: z.uuid(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type WorkshopSummary = z.infer<typeof WorkshopSummarySchema>;
export type WorkshopListResponse = z.infer<typeof WorkshopListResponseSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
