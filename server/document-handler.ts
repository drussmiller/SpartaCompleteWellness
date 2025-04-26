/**
 * Document Processing Handler
 * This file contains functions for processing Word documents and other file types
 */

import * as mammoth from 'mammoth';
import { logger } from './logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Express, Request, Response, NextFunction } from 'express';

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'documents');
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Create a unique filename with original name and timestamp
    const timestamp = Date.now();
    const originalName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${timestamp}-${originalName}`);
  },
});

// Filter function to only allow specific file types
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Only accept Word documents
  if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    cb(null, true);
  } else {
    cb(new Error('Only .docx files are allowed'));
  }
};

// Create the multer upload instance
export const documentUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/**
 * Process a Word document and extract its content as HTML
 * @param filePath Path to the uploaded document file
 * @returns Promise that resolves to the processed HTML content
 */
export async function processWordDocument(filePath: string): Promise<string> {
  try {
    logger.info(`Processing Word document: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Use mammoth to convert docx to HTML
    const result = await mammoth.convertToHtml({ path: filePath });
    const html = result.value;
    
    // Log any warnings
    if (result.messages.length > 0) {
      logger.debug(`Conversion warnings: ${JSON.stringify(result.messages)}`);
    }
    
    return html;
  } catch (error) {
    logger.error(`Error processing Word document: ${error}`);
    throw error;
  } finally {
    // Optional: Clean up the uploaded file to save space
    // Uncomment if you want to delete the file after processing
    // try {
    //   fs.unlinkSync(filePath);
    // } catch (cleanupError) {
    //   logger.error(`Error cleaning up file: ${cleanupError}`);
    // }
  }
}

/**
 * Handle Word document upload and processing
 * This is the middleware function to be used in route handlers
 */
export async function handleDocumentUpload(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded or file type not supported' 
      });
    }
    
    const filePath = req.file.path;
    const html = await processWordDocument(filePath);
    
    // Return the processed HTML content
    return res.status(200).json({
      success: true,
      content: html,
      filename: req.file.originalname
    });
    
  } catch (error) {
    logger.error(`Document upload handler error: ${error}`);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to process document'
    });
  }
}