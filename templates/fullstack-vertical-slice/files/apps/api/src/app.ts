import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import { enrollmentsRouter } from './routes/enrollments.js';
import { healthRouter } from './routes/health.js';
import { workshopsRouter } from './routes/workshops.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use((_request, response, next) => {
    const requestId = randomUUID();
    response.setHeader('x-request-id', requestId);
    next();
  });
  app.use('/health', healthRouter);
  app.use('/api/workshops', workshopsRouter);
  app.use('/api/workshops', enrollmentsRouter);
  return app;
}
