/**
 * Document Processing Module
 * 
 * This module provides functionality for processing uploaded documents,
 * particularly Word (.docx) files, and converting them to HTML content
 * that can be used within the application.
 */

import express, { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { logger } from './logger';
import { authenticate } from './auth';

// Set up storage for uploaded documents
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'documents');
    
    // Create the directory if it doesn't exist
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter to only allow .docx files
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    cb(null, true);
  } else {
    cb(new Error('Only Word documents (.docx) are allowed'));
  }
};

// Initialize multer upload
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

/**
 * Process a Word document and extract its content as HTML
 * @param filePath Path to the uploaded document file
 * @returns Promise that resolves to the processed HTML content
 */
async function processDocument(filePath: string): Promise<string> {
  try {
    const result = await mammoth.convertToHtml({ path: filePath });
    
    // Clean up the generated HTML to work better with our editor
    let html = result.value;
    
    // Add custom processing here if needed
    // For example, you might want to:
    // - Convert certain elements to different formats
    // - Handle special cases for images or tables
    // - Add specific classes for styling
    
    logger.info(`Document processed successfully: ${path.basename(filePath)}`);
    return html;
  } catch (error) {
    logger.error(`Error processing document: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
    throw new Error('Failed to process document');
  }
}

// Create router for document-related endpoints
export const docRouter = Router();

// Process a document upload (no authentication for testing)
docRouter.post('/api/process', upload.single('document'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No document uploaded' });
    }
    
    const filePath = req.file.path;
    const content = await processDocument(filePath);
    
    // Optionally, you could delete the file after processing if you don't need to keep it
    // fs.unlinkSync(filePath);
    
    res.json({ 
      success: true, 
      content,
      filename: req.file.originalname
    });
  } catch (error) {
    logger.error(`Error in document processing endpoint: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
    res.status(500).json({ 
      error: 'Document processing failed', 
      message: error instanceof Error ? error.message : 'An unexpected error occurred'
    });
  }
});

// Create document processing router
export default docRouter;