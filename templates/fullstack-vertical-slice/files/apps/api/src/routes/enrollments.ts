import { ApiErrorSchema } from '@workshop/contracts';
import { Router } from 'express';

export const enrollmentsRouter: ReturnType<typeof Router> = Router();

enrollmentsRouter.post('/:id/enrollments', (_request, response) => {
  const requestId = response.getHeader('x-request-id');

  response.status(501).json(
    ApiErrorSchema.parse({
      code: 'ENROLLMENT_NOT_IMPLEMENTED',
      message: 'Complete the authenticated transactional enrollment workflow',
      requestId,
    }),
  );
});
