import { createMediaUrl, createThumbnailUrl } from './media-utils';

/**
 * Production server URL for cross-environment access
 */
export const PROD_URL = "https://sparta.replit.app";

/**
 * Get an image URL with direct Object Storage access
 * This is used for most media files in the app
 * @param originalUrl The original URL of the image
 * @returns A URL that works with Object Storage
 */
export function getImageUrl(originalUrl: string | null): string {
  return createMediaUrl(originalUrl);
}

/**
 * Get a thumbnail URL for an image or video
 * @param originalUrl The original URL of the media file
 * @param size Optional size parameter (ignored for now, kept for compatibility)
 * @returns A thumbnail URL
 */
export function getThumbnailUrl(originalUrl: string | null, size?: string): string {
  // For images, try the thumbnail first, but fallback to original if needed
  if (!originalUrl) return '';
  
  // If this is already a serve-file URL, return as-is
  if (originalUrl.includes('/api/serve-file')) {
    return originalUrl;
  }
  
  // Check if this is an image file
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(originalUrl);
  
  if (isImage) {
    // For images, try to use the original file directly via serve-file
    const filename = originalUrl.split('/').pop() || '';
    const timestamp = Date.now();
    return `/api/serve-file?filename=${encodeURIComponent(filename)}&v=${timestamp}`;
  }
  
  // For videos, use the thumbnail creation logic
  return createThumbnailUrl(originalUrl);
}

/**
 * Get a fallback image URL - returns empty string since we only use real media
 * @param originalUrl The original URL (unused)
 * @returns Empty string - no fallback images per data integrity policy
 */
export function getFallbackImageUrl(originalUrl: string | null): string {
  return '';
}

/**
 * Check if an image exists - simplified for clean media handling
 * @param imageUrl The URL to check
 * @returns Promise<boolean> Always returns true to avoid complexity
 */
export async function checkImageExists(imageUrl: string): Promise<boolean> {
  // Simplified - let the browser handle loading errors naturally
  return true;
}