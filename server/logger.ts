import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create separate log files for different levels
const errorLogPath = path.join(logsDir, 'error.log');
const accessLogPath = path.join(logsDir, 'access.log');
const appendFile = promisify(fs.appendFile);

// Log rotation settings
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_LOG_FILES = 5;

interface LogMetadata {
  requestId?: string;
  userId?: string | number;
  route?: string;
  timestamp: string;
  level: string;
}

class Logger {
  private static instance: Logger;
  private logBuffer: string[] = [];
  private bufferTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    this.setupLogRotation();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private async rotateLog(logPath: string): Promise<void> {
    try {
      const stats = await fs.promises.stat(logPath);
      if (stats.size >= MAX_LOG_SIZE) {
        // Rotate existing log files
        for (let i = MAX_LOG_FILES - 1; i > 0; i--) {
          const oldPath = `${logPath}.${i}`;
          const newPath = `${logPath}.${i + 1}`;
          if (fs.existsSync(oldPath)) {
            await fs.promises.rename(oldPath, newPath);
          }
        }
        await fs.promises.rename(logPath, `${logPath}.1`);
        await fs.promises.writeFile(logPath, '');
      }
    } catch (err) {
      console.error('Error rotating log files:', err);
    }
  }

  private setupLogRotation(): void {
    // Check log sizes every hour
    setInterval(() => {
      this.rotateLog(errorLogPath).catch(console.error);
      this.rotateLog(accessLogPath).catch(console.error);
    }, 3600000);
  }

  private formatLogEntry(message: string, metadata: LogMetadata, error?: Error): string {
    const logEntry = {
      message,
      ...metadata,
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }),
    };
    return JSON.stringify(logEntry) + '\n';
  }

  private async writeLog(entry: string, logPath: string): Promise<void> {
    try {
      await appendFile(logPath, entry);
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  private flushBuffer(): void {
    if (this.logBuffer.length > 0) {
      const buffer = this.logBuffer.join('');
      this.logBuffer = [];
      this.writeLog(buffer, accessLogPath).catch(console.error);
    }
    this.bufferTimeout = null;
  }

  public info(message: string, metadata: Partial<LogMetadata> = {}): void {
    // Skip console logging for API endpoints that are called frequently
    const skipConsoleOutput = 
      (metadata.route && metadata.route.includes('/api/posts/counts')) ||
      (message && message.includes('Post count'));
    
    const entry = this.formatLogEntry(message, {
      ...metadata,
      timestamp: new Date().toISOString(),
      level: 'INFO',
    });
    
    if (!skipConsoleOutput) {
      console.log(entry);
    }

    // Buffer non-error logs
    this.logBuffer.push(entry);
    if (!this.bufferTimeout) {
      this.bufferTimeout = setTimeout(() => this.flushBuffer(), 5000); // Increased to 5 seconds
    }
  }

  public error(message: string, error?: Error, metadata: Partial<LogMetadata> = {}): void {
    const entry = this.formatLogEntry(message, {
      ...metadata,
      timestamp: new Date().toISOString(),
      level: 'ERROR',
    }, error);
    console.error(entry);

    // Write errors immediately
    this.writeLog(entry, errorLogPath).catch(console.error);
  }

  public debug(message: string, metadata: Partial<LogMetadata> = {}): void {
    if (process.env.NODE_ENV !== 'production') {
      const entry = this.formatLogEntry(message, {
        ...metadata,
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
      });
      // Skip console output for debug logs (still saved to file)
      
      this.logBuffer.push(entry);
      if (!this.bufferTimeout) {
        this.bufferTimeout = setTimeout(() => this.flushBuffer(), 5000); // Increased to 5 seconds
      }
    }
  }

  public warn(message: string, metadata: Partial<LogMetadata> = {}): void {
    const entry = this.formatLogEntry(message, {
      ...metadata,
      timestamp: new Date().toISOString(),
      level: 'WARN',
    });
    console.warn(entry);

    this.logBuffer.push(entry);
    if (!this.bufferTimeout) {
      this.bufferTimeout = setTimeout(() => this.flushBuffer(), 1000);
    }
  }
}

export const logger = Logger.getInstance();