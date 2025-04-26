/**
 * Document Routes
 * Handles all API endpoints for document processing (upload, conversion, etc.)
 */

import express, { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mammoth from 'mammoth';
import { authenticate } from './auth';
import { logger } from './logger';

// Create router
const router = express.Router();

// Configure multer for file uploads
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
  }
});

// Configure file filter
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Only accept Word documents (.docx)
  if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    cb(null, true);
  } else {
    cb(null, false);
  }
};

// Create upload middleware
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Document upload route for activity content
router.post('/api/activities/upload-doc', authenticate, upload.single('document'), async (req, res) => {
  try {
    // Check if file was uploaded successfully
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded or file type not supported'
      });
    }

    // Get file path
    const filePath = req.file.path;
    logger.info(`Processing uploaded Word document: ${filePath}`);

    // Process the Word document
    const result = await mammoth.convertToHtml({ path: filePath });
    const html = result.value;

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
});

export { router as documentRoutes };