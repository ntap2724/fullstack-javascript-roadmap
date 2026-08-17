import { WorkshopListResponseSchema } from '@workshop/contracts';
import { Router } from 'express';

export const workshopsRouter: ReturnType<typeof Router> = Router();

workshopsRouter.get('/', (_request, response) => {
  response.json(WorkshopListResponseSchema.parse({ items: [] }));
});
