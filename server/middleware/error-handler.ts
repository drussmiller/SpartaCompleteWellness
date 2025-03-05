import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  // Get error details
  const statusCode = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  // Log error with context
  logger.error('Unhandled error', err, {
    requestId: req.requestId,
    userId: req.user?.id,
    route: `${req.method} ${req.path}`,
    statusCode,
  });

  // Don't expose internal error details in production
  const errorResponse = {
    message,
    ...(process.env.NODE_ENV !== 'production' && {
      stack: err.stack,
      details: err.details || err
    })
  };

  // Send error response
  res.status(statusCode).json(errorResponse);
}
