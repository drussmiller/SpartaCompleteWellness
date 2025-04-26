import mammoth from 'mammoth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Router } from 'express';
import { authenticate } from './auth';
import { logger } from './logger';

// Create a dedicated router for document processing
export const docRouter = Router();

// Set up file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${timestamp}-${safeName}`);
  }
});

// Create multer instance
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Add route for document upload
docRouter.post('/api/activities/upload-doc', authenticate, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Get file path
    const filePath = req.file.path;
    logger.info(`Processing document: ${filePath}`);
    
    // Check if it's a Word document
    if (!req.file.originalname.endsWith('.docx')) {
      return res.status(400).json({
        success: false,
        message: 'Only .docx files are supported'
      });
    }
    
    // Process Word document
    const result = await mammoth.convertToHtml({ path: filePath });
    
    // Return the processed content
    return res.status(200).json({
      success: true,
      content: result.value,
      filename: req.file.originalname
    });
  } catch (error) {
    logger.error(`Document processing error: ${error}`);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to process document'
    });
  }
});