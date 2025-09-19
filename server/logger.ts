
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
  [key: string]: any; // Allow additional metadata properties
}

class Logger {
  private static instance: Logger;
  private logBuffer: string[] = [];
  private bufferTimeout: NodeJS.Timeout | null = null;
  private consoleOutputEnabled: boolean = true;

  private constructor() {
    this.setupLogRotation();
    // Check environment variable to enable/disable console output
    this.consoleOutputEnabled = process.env.ENABLE_CONSOLE_LOGGING !== 'false';
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
      if (this.consoleOutputEnabled) {
        console.error('Error rotating log files:', err);
      }
    }
  }

  private setupLogRotation(): void {
    // Check log sizes every hour
    setInterval(() => {
      this.rotateLog(errorLogPath).catch(err => {
        if (this.consoleOutputEnabled) {
          console.error(err);
        }
      });
      this.rotateLog(accessLogPath).catch(err => {
        if (this.consoleOutputEnabled) {
          console.error(err);
        }
      });
    }, 3600000);
  }

  private formatLogEntry(message: string, metadata: LogMetadata, error?: Error | unknown): string {
    let errorObj = null;
    if (error) {
      if (error instanceof Error) {
        errorObj = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        errorObj = {
          message: String(error)
        };
      }
    }
    
    const logEntry = {
      message,
      ...metadata,
      ...(errorObj ? { error: errorObj } : {})
    };
    return JSON.stringify(logEntry) + '\n';
  }

  private async writeLog(entry: string, logPath: string): Promise<void> {
    try {
      await appendFile(logPath, entry);
    } catch (err) {
      if (this.consoleOutputEnabled) {
        console.error('Failed to write to log file:', err);
      }
    }
  }

  private flushBuffer(): void {
    if (this.logBuffer.length > 0) {
      const buffer = this.logBuffer.join('');
      this.logBuffer = [];
      this.writeLog(buffer, accessLogPath).catch(err => {
        if (this.consoleOutputEnabled) {
          console.error(err);
        }
      });
    }
    this.bufferTimeout = null;
  }

  public info(message: string, metadata: Partial<LogMetadata> = {}): void {
    const entry = this.formatLogEntry(message, {
      ...metadata,
      timestamp: new Date().toISOString(),
      level: 'INFO',
    });
    
    // Only log to console if explicitly enabled
    if (this.consoleOutputEnabled) {
      const skipConsoleOutput = 
        (metadata.route && (
          metadata.route.includes('/api/posts/counts') || 
          metadata.route.includes('/api/posts')
        )) ||
        (message && (
          message.includes('Post count') || 
          message.includes('GET /api/posts/counts') ||
          message.includes('Deserializing user')
        ));
        
      if (!skipConsoleOutput) {
        console.log(entry);
      }
    }

    // Always write to file logs
    this.logBuffer.push(entry);
    if (!this.bufferTimeout) {
      this.bufferTimeout = setTimeout(() => this.flushBuffer(), 10000);
    }
  }

  public error(message: string, error?: Error | unknown, metadata: Partial<LogMetadata> = {}): void {
    const entry = this.formatLogEntry(message, {
      ...metadata,
      timestamp: new Date().toISOString(),
      level: 'ERROR',
    }, error);
    
    // Only critical errors to console
    if (this.consoleOutputEnabled) {
      console.error(entry);
    }

    // Write errors immediately to file
    this.writeLog(entry, errorLogPath).catch(err => {
      if (this.consoleOutputEnabled) {
        console.error(err);
      }
    });
  }

  public debug(message: string, metadata: Partial<LogMetadata> = {}): void {
    if (process.env.NODE_ENV !== 'production') {
      const entry = this.formatLogEntry(message, {
        ...metadata,
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
      });
      
      // Debug logs only to file, not console
      this.logBuffer.push(entry);
      if (!this.bufferTimeout) {
        this.bufferTimeout = setTimeout(() => this.flushBuffer(), 5000);
      }
    }
  }

  public warn(message: string, metadata: Partial<LogMetadata> = {}): void {
    const entry = this.formatLogEntry(message, {
      ...metadata,
      timestamp: new Date().toISOString(),
      level: 'WARN',
    });
    
    if (this.consoleOutputEnabled) {
      console.warn(entry);
    }

    this.logBuffer.push(entry);
    if (!this.bufferTimeout) {
      this.bufferTimeout = setTimeout(() => this.flushBuffer(), 1000);
    }
  }

  // Method to enable/disable console output at runtime
  public setConsoleOutputEnabled(enabled: boolean): void {
    this.consoleOutputEnabled = enabled;
  }
}

export const logger = Logger.getInstance();
