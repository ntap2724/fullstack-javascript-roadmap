import { Router } from 'express';

export const healthRouter: ReturnType<typeof Router> = Router();

healthRouter.get('/', (_request, response) => {
  response.json({ status: 'ok' });
});
