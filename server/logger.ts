
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const logFilePath = path.join(logsDir, 'app.log');
const appendFile = promisify(fs.appendFile);

export const logger = {
  info: (message: string) => {
    const logEntry = `[INFO] [${new Date().toISOString()}] ${message}\n`;
    console.log(logEntry);
    appendFile(logFilePath, logEntry).catch(err => {
      console.error('Failed to write to log file:', err);
    });
  },
  
  error: (message: string, error?: any) => {
    const errorDetails = error ? `\n${JSON.stringify(error, null, 2)}` : '';
    const logEntry = `[ERROR] [${new Date().toISOString()}] ${message}${errorDetails}\n`;
    console.error(logEntry);
    appendFile(logFilePath, logEntry).catch(err => {
      console.error('Failed to write to log file:', err);
    });
  },
  
  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV !== 'production') {
      const dataDetails = data ? `\n${JSON.stringify(data, null, 2)}` : '';
      const logEntry = `[DEBUG] [${new Date().toISOString()}] ${message}${dataDetails}\n`;
      console.log(logEntry);
      appendFile(logFilePath, logEntry).catch(err => {
        console.error('Failed to write to log file:', err);
      });
    }
  }
};
