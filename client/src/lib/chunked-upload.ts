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

export interface ChunkedUploadOptions {
  chunkSize?: number;
  onProgress?: (progress: number) => void;
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => void;
}

const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
const FILE_SIZE_THRESHOLD = 30 * 1024 * 1024; // 30MB

/**
 * Check if a file should use chunked upload
 */
export function shouldUseChunkedUpload(file: File): boolean {
  return file.size > FILE_SIZE_THRESHOLD;
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
    onChunkComplete
  } = options;
  
  const totalChunks = Math.ceil(file.size / chunkSize);
  
  console.log(`[Chunked Upload] Starting for ${file.name}`);
  console.log(`[Chunked Upload] File size: ${file.size} bytes (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`[Chunked Upload] Total chunks: ${totalChunks}`);
  
  // Step 1: Initialize upload session
  const sessionResponse = await fetch('/api/uploads/sessions', {
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
  
  if (!sessionResponse.ok) {
    const errorText = await sessionResponse.text();
    console.error('[Chunked Upload] Failed to initialize session:', errorText);
    throw new Error('Failed to initialize upload session');
  }
  
  const { sessionId } = await sessionResponse.json();
  console.log(`[Chunked Upload] Session created: ${sessionId}`);
  
  // Step 2: Upload chunks sequentially
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    
    console.log(`[Chunked Upload] Uploading chunk ${chunkIndex + 1}/${totalChunks}`);
    console.log(`[Chunked Upload] Chunk bytes: ${start}-${end} (${chunk.size} bytes)`);
    
    const chunkResponse = await fetch(
      `/api/uploads/sessions/${sessionId}/chunk?chunkIndex=${chunkIndex}`,
      {
        method: 'PATCH',
        credentials: 'include',
        body: chunk,
      }
    );
    
    if (!chunkResponse.ok) {
      const errorText = await chunkResponse.text();
      console.error(`[Chunked Upload] Failed to upload chunk ${chunkIndex}:`, errorText);
      throw new Error(`Failed to upload chunk ${chunkIndex}`);
    }
    
    const { progress } = await chunkResponse.json();
    
    if (onProgress) {
      onProgress(progress);
    }
    
    if (onChunkComplete) {
      onChunkComplete(chunkIndex, totalChunks);
    }
    
    console.log(`[Chunked Upload] Chunk ${chunkIndex + 1}/${totalChunks} complete - ${progress}%`);
  }
  
  // Step 3: Finalize upload
  console.log('[Chunked Upload] All chunks uploaded, finalizing...');
  
  const finalizeResponse = await fetch(`/api/uploads/sessions/${sessionId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ postType: 'video' }),
  });
  
  if (!finalizeResponse.ok) {
    const errorText = await finalizeResponse.text();
    console.error('[Chunked Upload] Failed to finalize:', errorText);
    throw new Error('Failed to finalize upload');
  }
  
  const result = await finalizeResponse.json();
  console.log('[Chunked Upload] Upload complete!', result);
  
  return result;
}

/**
 * Upload a file - automatically uses chunked upload for large files
 */
export async function uploadFile(
  file: File,
  options: ChunkedUploadOptions = {}
): Promise<ChunkedUploadResult | null> {
  if (!file) {
    return null;
  }
  
  if (shouldUseChunkedUpload(file)) {
    console.log(`[Upload] File ${file.name} is large, using chunked upload`);
    return uploadFileInChunks(file, options);
  }
  
  console.log(`[Upload] File ${file.name} is small, use standard upload`);
  return null; // Caller should use standard upload
}
