/**
 * Chunked Upload Utility
 * 
 * Handles large file uploads by splitting them into smaller chunks
 * to bypass Replit's ~50MB proxy limit.
 */

export interface ChunkedUploadResult {
  mediaUrl: string;
  thumbnailUrl?: string;
  filename: string;
  isVideo: boolean;
}

export type UploadStatus = 'uploading' | 'processing' | 'complete';

export interface UploadProgressInfo {
  progress: number;
  status: UploadStatus;
  statusMessage: string;
}

export interface ChunkedUploadOptions {
  chunkSize?: number;
  sizeThreshold?: number;
  onProgress?: (info: UploadProgressInfo) => void;
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => void;
  onAbort?: () => void;
  maxRetries?: number;
  retryDelay?: number;
  finalizePayload?: Record<string, any>;
  standardUploadFn?: (file: File) => Promise<ChunkedUploadResult>;
}

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_FILE_SIZE_THRESHOLD = 30 * 1024 * 1024; // 30MB
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

/**
 * Check if a file should use chunked upload
 */
export function shouldUseChunkedUpload(file: File, threshold = DEFAULT_FILE_SIZE_THRESHOLD): boolean {
  return file.size > threshold;
}

/**
 * Retry a function with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  retryDelay: number
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt);
        console.log(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Operation failed after retries');
}

/**
 * Upload a file in chunks to bypass proxy size limits
 */
export async function uploadFileInChunks(
  file: File,
  options: ChunkedUploadOptions = {}
): Promise<ChunkedUploadResult> {
  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    onProgress,
    onChunkComplete,
    onAbort,
    maxRetries = DEFAULT_MAX_RETRIES,
    retryDelay = DEFAULT_RETRY_DELAY,
    finalizePayload = { postType: 'video' }
  } = options;
  
  const totalChunks = Math.ceil(file.size / chunkSize);
  let aborted = false;
  
  console.log(`[Chunked Upload] Starting for ${file.name}`);
  console.log(`[Chunked Upload] File size: ${file.size} bytes (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`[Chunked Upload] Total chunks: ${totalChunks}`);
  
  // Create abort handler
  const checkAbort = () => {
    if (aborted) {
      throw new Error('Upload aborted by user');
    }
  };
  
  try {
    // Step 1: Initialize upload session
    checkAbort();
    const sessionResponse = await retryWithBackoff(
      async () => {
        checkAbort();
        const response = await fetch('/api/uploads/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type,
            totalSize: file.size,
            chunkSize: chunkSize,
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Chunked Upload] Failed to initialize session:', errorText);
          throw new Error('Failed to initialize upload session');
        }
        
        return response;
      },
      maxRetries,
      retryDelay
    );
    
    const { sessionId } = await sessionResponse.json();
    console.log(`[Chunked Upload] Session created: ${sessionId}`);
    
    // Step 2: Upload chunks sequentially with retry
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      checkAbort();
      
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);
      
      console.log(`[Chunked Upload] Uploading chunk ${chunkIndex + 1}/${totalChunks}`);
      console.log(`[Chunked Upload] Chunk bytes: ${start}-${end} (${chunk.size} bytes)`);
      
      const chunkResponse = await retryWithBackoff(
        async () => {
          checkAbort();
          const response = await fetch(
            `/api/uploads/sessions/${sessionId}/chunk?chunkIndex=${chunkIndex}`,
            {
              method: 'PATCH',
              credentials: 'include',
              body: chunk,
            }
          );
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Chunked Upload] Failed to upload chunk ${chunkIndex}:`, errorText);
            throw new Error(`Failed to upload chunk ${chunkIndex}`);
          }
          
          return response;
        },
        maxRetries,
        retryDelay
      );
      
      const { progress } = await chunkResponse.json();
      
      // Cap upload progress at 90% to reserve 90-100% for processing
      const cappedProgress = Math.min(90, progress);
      
      if (onProgress) {
        onProgress({
          progress: cappedProgress,
          status: 'uploading',
          statusMessage: `Uploading... ${chunkIndex + 1}/${totalChunks} chunks`
        });
      }
      
      if (onChunkComplete) {
        onChunkComplete(chunkIndex, totalChunks);
      }
      
      console.log(`[Chunked Upload] Chunk ${chunkIndex + 1}/${totalChunks} complete - ${cappedProgress}%`);
    }
    
    // Step 3: Finalize upload
    checkAbort();
    console.log('[Chunked Upload] All chunks uploaded, processing video...');
    
    // Show processing state
    if (onProgress) {
      onProgress({
        progress: 90,
        status: 'processing',
        statusMessage: 'Processing video...'
      });
    }
    
    const finalizeResponse = await retryWithBackoff(
      async () => {
        checkAbort();
        const response = await fetch(`/api/uploads/sessions/${sessionId}/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(finalizePayload),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Chunked Upload] Failed to finalize:', errorText);
          throw new Error('Failed to finalize upload');
        }
        
        return response;
      },
      maxRetries,
      retryDelay
    );
    
    const result = await finalizeResponse.json();
    console.log('[Chunked Upload] Upload complete!', result);
    
    // Show completion
    if (onProgress) {
      onProgress({
        progress: 100,
        status: 'complete',
        statusMessage: 'Complete!'
      });
    }
    
    return result;
  } catch (error) {
    if (onAbort && (error as Error).message === 'Upload aborted by user') {
      onAbort();
    }
    throw error;
  }
}

/**
 * Upload a file - automatically uses chunked upload for large files or standard upload for small files
 * Provides a unified interface for all file uploads
 */
export async function uploadFile(
  file: File,
  options: ChunkedUploadOptions = {}
): Promise<ChunkedUploadResult> {
  if (!file) {
    throw new Error('No file provided');
  }
  
  const threshold = options.sizeThreshold ?? DEFAULT_FILE_SIZE_THRESHOLD;
  
  if (shouldUseChunkedUpload(file, threshold)) {
    console.log(`[Upload] File ${file.name} is large (${(file.size / 1024 / 1024).toFixed(2)} MB), using chunked upload`);
    return uploadFileInChunks(file, options);
  }
  
  // For small files, use the provided standardUploadFn
  if (options.standardUploadFn) {
    console.log(`[Upload] File ${file.name} is small, using standard upload`);
    return options.standardUploadFn(file);
  }
  
  throw new Error('Standard upload function not provided for small files');
}
