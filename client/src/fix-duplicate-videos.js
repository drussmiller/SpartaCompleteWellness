/**
 * Fix Duplicate Videos Script
 * 
 * This script targets and removes duplicate YouTube videos, particularly 
 * the Week 3 warmup video that appears in both the weekly overview and daily content.
 * 
 * It runs immediately when the page loads to keep the DOM clean.
 */

// Make the function available globally so React can call it
window.fixDuplicateVideos = fixDuplicateVideos;

// Wait for the DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  // Give the React app a moment to render fully
  setTimeout(fixDuplicateVideos, 500);

  // Also fix after any scrolling or collapsible interactions
  document.addEventListener('scroll', () => {
    setTimeout(fixDuplicateVideos, 200);
  });
  
  document.addEventListener('click', (e) => {
    // If clicking a collapsible trigger, wait for it to open
    if (e.target.closest('[data-state="closed"]')) {
      setTimeout(fixDuplicateVideos, 300);
    }
  });
});

// The main fix function
function fixDuplicateVideos() {
  // Specifically target Week 3 warmup video 
  const warmupVideoSelector = 'iframe[src*="JT49h1zSD6I"]';
  
  // Get all instances of the warmup video
  const warmupVideos = document.querySelectorAll(warmupVideoSelector);
  
  // If we found multiple instances, keep only the first one
  if (warmupVideos.length > 1) {
    console.log(`Found ${warmupVideos.length} instances of the Week 3 warmup video - hiding duplicates`);
    
    // Keep a record of the first one we found
    let firstFoundVideo = null;
    
    // Examine each video
    warmupVideos.forEach((video, index) => {
      // Store the first video we find
      if (index === 0) {
        firstFoundVideo = video;
        video.parentElement.classList.add('primary-video-instance');
      } else {
        // For all others, hide their container
        const container = findVideoContainer(video);
        if (container) {
          container.style.display = 'none';
          container.setAttribute('data-duplicate', 'true');
        }
      }
    });
  }

  // Look for other duplicate videos too
  findAndHideDuplicateVideos();
}

// Find the closest video container
function findVideoContainer(videoElement) {
  // Try to find .video-wrapper parent
  let container = videoElement.closest('.video-wrapper');
  if (container) return container;
  
  // If no direct wrapper, walk up the DOM looking for a container
  let current = videoElement.parentElement;
  while (current && current !== document.body) {
    if (current.classList.contains('video-wrapper') || 
        current.tagName === 'DIV' && current.querySelector('iframe')) {
      return current;
    }
    current = current.parentElement;
  }
  
  // If we can't find a proper container, return the parent
  return videoElement.parentElement;
}

// More general function to find and hide duplicate videos by src
function findAndHideDuplicateVideos() {
  // Get all iframes that look like YouTube embeds
  const allVideos = document.querySelectorAll('iframe[src*="youtube.com/embed/"]');
  
  // Create a map to track seen videos by their YouTube ID
  const seenVideos = new Map();
  
  // Process each video
  allVideos.forEach(video => {
    // Extract YouTube ID from src
    const src = video.getAttribute('src');
    const match = /embed\/([a-zA-Z0-9_-]{11})/.exec(src);
    
    if (match && match[1]) {
      const videoId = match[1];
      
      // If we've seen this ID before, hide this instance
      if (seenVideos.has(videoId)) {
        // Only hide if it's in the weekly content section
        const inWeeklyContent = !!video.closest('.weekly-content');
        if (inWeeklyContent) {
          const container = findVideoContainer(video);
          if (container) {
            container.style.display = 'none';
            container.setAttribute('data-duplicate', 'true');
          }
        }
      } else {
        // First time seeing this ID, record it
        seenVideos.set(videoId, video);
      }
    }
  });
}