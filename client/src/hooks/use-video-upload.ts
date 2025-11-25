import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { shouldUseChunkedUpload, uploadFileInChunks } from '@/lib/chunked-upload';

export interface VideoUploadResult {
  mediaUrl: string;
  thumbnailUrl?: string;
  filename: string;
  isVideo: boolean;
}

export interface VideoUploadState {
  file: File | null;
  thumbnail: string | null;
  isUploading: boolean;
  uploadProgress: number;
  uploadResult: VideoUploadResult | null;
  error: string | null;
}

export interface UseVideoUploadOptions {
  maxSizeMB?: number;
  onProgress?: (progress: number) => void;
  onSuccess?: (result: VideoUploadResult) => void;
  onError?: (error: Error) => void;
  autoGenerateThumbnail?: boolean;
}

export function useVideoUpload(options: UseVideoUploadOptions = {}) {
  const {
    maxSizeMB = 100,
    onProgress,
    onSuccess,
    onError,
    autoGenerateThumbnail = true,
  } = options;

  const { toast } = useToast();
  const [state, setState] = useState<VideoUploadState>({
    file: null,
    thumbnail: null,
    isUploading: false,
    uploadProgress: 0,
    uploadResult: null,
    error: null,
  });

  const generateThumbnail = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.src = url;
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        video.currentTime = 0.1;
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
          URL.revokeObjectURL(url);
          resolve(thumbnailUrl);
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load video'));
      };

      video.load();
    });
  }, []);

  const selectFile = useCallback(async (file: File) => {
    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      const errorMsg = `File is too large. Maximum size is ${maxSizeMB}MB.`;
      setState(prev => ({ ...prev, error: errorMsg }));
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      });
      if (onError) onError(new Error(errorMsg));
      return;
    }

    // Validate file type
    if (!file.type.startsWith('video/')) {
      const errorMsg = 'Please select a valid video file.';
      setState(prev => ({ ...prev, error: errorMsg }));
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      });
      if (onError) onError(new Error(errorMsg));
      return;
    }

    setState(prev => ({ ...prev, file, error: null }));

    // Generate thumbnail if enabled
    if (autoGenerateThumbnail) {
      try {
        const thumbnailUrl = await generateThumbnail(file);
        setState(prev => ({ ...prev, thumbnail: thumbnailUrl }));
        console.log('Generated video thumbnail');
      } catch (error) {
        console.error('Error generating thumbnail:', error);
        // Don't fail the whole process if thumbnail generation fails
      }
    }

    toast({
      description: `Selected: ${file.name} (${fileSizeMB.toFixed(2)}MB)`,
      duration: 2000,
    });
  }, [maxSizeMB, autoGenerateThumbnail, generateThumbnail, toast, onError]);

  const uploadVideo = useCallback(async (postType: string = 'video'): Promise<VideoUploadResult | null> => {
    if (!state.file) {
      const errorMsg = 'No file selected';
      setState(prev => ({ ...prev, error: errorMsg }));
      if (onError) onError(new Error(errorMsg));
      return null;
    }

    setState(prev => ({ ...prev, isUploading: true, uploadProgress: 0, error: null }));

    try {
      // Check if we should use chunked upload
      const useChunked = shouldUseChunkedUpload(state.file);
      
      if (useChunked) {
        console.log(`File ${state.file.size} bytes exceeds threshold, using chunked upload`);
        
        const result = await uploadFileInChunks(state.file, {
          onProgress: (progress) => {
            setState(prev => ({ ...prev, uploadProgress: progress }));
            if (onProgress) onProgress(progress);
          },
          finalizePayload: {
            postType: postType
          }
        });

        const uploadResult: VideoUploadResult = {
          mediaUrl: result.mediaUrl,
          thumbnailUrl: result.thumbnailUrl,
          filename: result.filename,
          isVideo: result.isVideo
        };

        setState(prev => ({ 
          ...prev, 
          isUploading: false, 
          uploadProgress: 100,
          uploadResult 
        }));

        if (onSuccess) onSuccess(uploadResult);
        
        return uploadResult;
      } else {
        // For small files, return file info without uploading
        // The caller will handle the upload via FormData
        console.log('File is small enough for direct upload');
        setState(prev => ({ ...prev, isUploading: false }));
        return null;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      setState(prev => ({ 
        ...prev, 
        isUploading: false, 
        uploadProgress: 0,
        error: errorMsg 
      }));
      toast({
        title: "Upload Failed",
        description: errorMsg,
        variant: "destructive",
      });
      if (onError) onError(error instanceof Error ? error : new Error(errorMsg));
      return null;
    }
  }, [state.file, onProgress, onSuccess, onError, toast]);

  const clear = useCallback(() => {
    setState({
      file: null,
      thumbnail: null,
      isUploading: false,
      uploadProgress: 0,
      uploadResult: null,
      error: null,
    });
  }, []);

  const prepareFormData = useCallback((formData: FormData, videoFile?: File) => {
    const fileToUse = videoFile || state.file;
    
    if (!fileToUse) {
      console.warn('No video file to prepare');
      return formData;
    }

    // If we have an upload result from chunked upload, add that info
    if (state.uploadResult) {
      formData.append('chunkedUploadMediaUrl', state.uploadResult.mediaUrl);
      if (state.uploadResult.thumbnailUrl) {
        formData.append('chunkedUploadThumbnailUrl', state.uploadResult.thumbnailUrl);
      }
      formData.append('chunkedUploadFilename', state.uploadResult.filename);
      formData.append('chunkedUploadIsVideo', String(state.uploadResult.isVideo));
    } else {
      // For direct upload, add the video file
      formData.append('image', fileToUse);
    }

    // Add video flag
    formData.append('is_video', 'true');
    formData.append('selected_media_type', 'video');

    // Add thumbnail if available and not using chunked upload
    if (state.thumbnail && !state.uploadResult) {
      const thumbnailBlob = dataURLToBlob(state.thumbnail);
      const cleanFilename = fileToUse.name.replace(/[^a-zA-Z0-9.]/g, '-');
      
      formData.append('thumbnail', thumbnailBlob, `${cleanFilename}.poster.jpg`);
      formData.append('thumbnail_alt', thumbnailBlob, `thumb-${cleanFilename}`);
      
      const baseFilename = cleanFilename.replace(/\.mov$/i, '.jpg');
      formData.append('thumbnail_jpg', thumbnailBlob, baseFilename);
    }

    return formData;
  }, [state.file, state.thumbnail, state.uploadResult]);

  return {
    state,
    selectFile,
    uploadVideo,
    clear,
    prepareFormData,
    generateThumbnail,
  };
}

// Helper function to convert data URL to Blob
function dataURLToBlob(dataURL: string): Blob {
  const parts = dataURL.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  return new Blob([u8arr], { type: mime });
}
