import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';
import { randomUUID } from 'crypto';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Generate unique request ID
  const requestId = randomUUID();
  req.requestId = requestId;

  // Log request start
  logger.info('Request started', {
    requestId,
    userId: req.user?.id,
    route: `${req.method} ${req.path}`,
    query: req.query,
    headers: req.headers,
  });

  // Record start time
  const startTime = Date.now();

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? 'error' : 'info';
    
    const logData = {
      requestId,
      userId: req.user?.id,
      route: `${req.method} ${req.path}`,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    };

    if (level === 'error') {
      logger.error('Request failed', new Error(`HTTP ${res.statusCode}`), logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}
