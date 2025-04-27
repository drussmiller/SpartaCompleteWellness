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

// Track if we're in Week 3
let isWeek3Page = false;

// Get the current week from the page
function getCurrentWeek() {
  // Try to get the week from URL params first
  const urlParams = new URLSearchParams(window.location.search);
  const weekParam = urlParams.get('week');
  
  if (weekParam) {
    return parseInt(weekParam, 10);
  }
  
  // Otherwise check for data-week attributes
  const weekElements = document.querySelectorAll('[data-week]');
  if (weekElements.length > 0) {
    const weekValue = weekElements[0].getAttribute('data-week');
    if (weekValue) {
      return parseInt(weekValue, 10);
    }
  }
  
  // Or try to extract from the page title/content
  const weekText = document.body.innerText.match(/Week\s+(\d+)/i);
  if (weekText && weekText[1]) {
    return parseInt(weekText[1], 10);
  }
  
  return null;
}

// Watch for route changes and detect problematic weeks
function checkForWeek3() {
  // Any week can have duplicate videos
  const currentWeek = getCurrentWeek();
  
  // Check URL for week=3 or if any element has data-week="3"
  isWeek3Page = window.location.search.includes('week=3') || 
                document.querySelector('[data-week="3"]') !== null;
  
  if (currentWeek) {
    console.log(`Week ${currentWeek} detected - applying video fix`);
    
    // Run multiple times for reliability, especially on problematic weeks (3, 9)
    setTimeout(fixDuplicateVideos, 100);
    setTimeout(fixDuplicateVideos, 500);
    setTimeout(fixDuplicateVideos, 1000);
    
    // For very problematic weeks (3, 9), run more targeted fixing
    if (currentWeek === 3 || currentWeek === 9) {
      console.log(`Week ${currentWeek} known to have duplicate video issues - applying targeted fix`);
      setTimeout(() => {
        // Week 3 specific fix
        if (currentWeek === 3) {
          const warmupVideos = document.querySelectorAll('iframe[src*="JT49h1zSD6I"]');
          if (warmupVideos.length > 1) {
            // Keep only the first one
            for (let i = 1; i < warmupVideos.length; i++) {
              const container = findVideoContainer(warmupVideos[i]);
              if (container) {
                container.style.display = 'none';
                container.setAttribute('data-duplicate', 'true');
              }
            }
          }
        }
        
        // Week 9 specific fix - more targeted approach
        if (currentWeek === 9) {
          // Only target the weekly content section
          const weeklyContent = document.querySelector('[data-week="9"] .weekly-content');
          if (weeklyContent) {
            const videos = weeklyContent.querySelectorAll('.video-wrapper');
            // If there's more than one video, keep only the first one
            if (videos.length > 1) {
              for (let i = 1; i < videos.length; i++) {
                videos[i].style.display = 'none';
                videos[i].setAttribute('data-duplicate', 'true');
              }
            }
          }
        }
      }, 1200);
    }
  }
}

// Wait for the DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  // Give the React app a moment to render fully
  setTimeout(fixDuplicateVideos, 300);
  setTimeout(checkForWeek3, 500);

  // Also fix after any scrolling or collapsible interactions
  document.addEventListener('scroll', () => {
    setTimeout(fixDuplicateVideos, 200);
  });
  
  // Monitor clicks, especially on collapsible triggers
  document.addEventListener('click', (e) => {
    // If clicking a collapsible trigger, wait for it to open
    const trigger = e.target.closest('[data-state]');
    if (trigger && trigger.getAttribute('data-state') === 'closed') {
      setTimeout(fixDuplicateVideos, 300);
      setTimeout(checkForWeek3, 400);
    }
  });
  
  // Set up a mutation observer to watch for content changes
  const observer = new MutationObserver((mutations) => {
    setTimeout(fixDuplicateVideos, 200);
    setTimeout(checkForWeek3, 300);
  });
  
  // Start observing the document body for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
});

// The main fix function
function fixDuplicateVideos() {
  // CRITICAL FIX: Directly target Week 3 warmup video by ID
  const WEEK3_WARMUP_VIDEO_ID = 'JT49h1zSD6I';
  const warmupVideoSelector = `iframe[src*="${WEEK3_WARMUP_VIDEO_ID}"]`;
  
  // Get all instances of the Week 3 warmup video
  const warmupVideos = document.querySelectorAll(warmupVideoSelector);
  
  // If we found any instances of the Week 3 warmup video
  if (warmupVideos.length > 0) {
    console.log(`Found ${warmupVideos.length} instances of the Week 3 warmup video`);
    
    // Week 3 - SPECIAL HANDLING - BRUTE FORCE APPROACH
    // This video appears in both weekly and daily content and causes duplication
    
    // First determine if we're on the Week 3 page
    const isWeek3 = isWeek3Page || document.querySelector('[data-week="3"]') !== null;
    
    if (isWeek3) {
      console.log('Confirmed Week 3 page - applying strong duplicate removal');
      
      // Strategy: Keep only the one in the weekly section (the first one),
      // and completely hide all others
      
      // Find the first video in the weekly section (prioritize it)
      let weeklyVideo = null;
      let dailyVideo = null;
      
      // First pass - categorize videos by section
      warmupVideos.forEach(video => {
        const isInWeekly = !!video.closest('.weekly-content');
        if (isInWeekly && !weeklyVideo) {
          weeklyVideo = video;
        } else if (!isInWeekly && !dailyVideo) {
          dailyVideo = video;
        }
      });
      
      // Decide which one to keep (prefer weekly)
      const videoToKeep = weeklyVideo || warmupVideos[0];
      
      // Second pass - hide all except the one to keep
      warmupVideos.forEach(video => {
        if (video !== videoToKeep) {
          const container = findVideoContainer(video);
          if (container) {
            console.log('Hiding duplicate Week 3 warmup video');
            container.style.display = 'none';
            container.setAttribute('data-duplicate', 'true');
            // Completely remove from DOM for problematic cases
            container.innerHTML = '';
          }
        } else {
          // Keep and mark this one as the primary instance
          const container = findVideoContainer(video);
          if (container) {
            container.classList.add('primary-video-instance');
            // Make sure it's visible
            container.style.display = 'block';
          }
        }
      });
    } else {
      // Standard approach for other weeks
      warmupVideos.forEach((video, index) => {
        if (index > 0) {
          const container = findVideoContainer(video);
          if (container) {
            container.style.display = 'none';
            container.setAttribute('data-duplicate', 'true');
          }
        }
      });
    }
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
  console.log(`Found ${allVideos.length} total YouTube videos on page`);
  
  // Create a map to track seen videos by their YouTube ID
  const seenVideos = new Map();
  const duplicateIds = new Set();
  
  // First pass - identify which videos are duplicated
  allVideos.forEach(video => {
    // Extract YouTube ID from src
    const src = video.getAttribute('src');
    const match = /embed\/([a-zA-Z0-9_-]{11})/.exec(src);
    
    if (match && match[1]) {
      const videoId = match[1];
      
      // If we've seen this ID before, mark it as a duplicate
      if (seenVideos.has(videoId)) {
        duplicateIds.add(videoId);
      } else {
        // First time seeing this ID
        seenVideos.set(videoId, video);
      }
    }
  });
  
  // If we found duplicates, log them
  if (duplicateIds.size > 0) {
    console.log(`Found ${duplicateIds.size} duplicate video IDs: ${[...duplicateIds].join(', ')}`);
    
    // Reset our tracking map
    seenVideos.clear();
    
    // Second pass - keep one instance of each video, prioritizing weekly content
    allVideos.forEach(video => {
      const src = video.getAttribute('src');
      const match = /embed\/([a-zA-Z0-9_-]{11})/.exec(src);
      
      if (match && match[1]) {
        const videoId = match[1];
        
        // Only process videos that were identified as duplicates
        if (duplicateIds.has(videoId)) {
          // Get container and check where it appears
          const container = findVideoContainer(video);
          const inWeeklyContent = !!video.closest('.weekly-content');
          
          // If we haven't seen this ID yet or it's in weekly content
          // (prioritize weekly content versions)
          if (!seenVideos.has(videoId) || inWeeklyContent) {
            // If we already recorded a version but this one is in weekly content,
            // hide the previous one
            if (seenVideos.has(videoId) && inWeeklyContent) {
              const prevVideo = seenVideos.get(videoId);
              const prevContainer = findVideoContainer(prevVideo);
              if (prevContainer) {
                console.log(`Hiding previous instance of ${videoId}`);
                prevContainer.style.display = 'none';
                prevContainer.setAttribute('data-duplicate', 'true');
              }
            }
            
            // Record this video (replacing any previous non-weekly version)
            seenVideos.set(videoId, video);
            
            // Mark this as the primary instance
            if (container) {
              container.classList.add('primary-video-instance');
              container.style.display = 'block';
            }
          } else {
            // We've already found an instance of this video, hide this one
            if (container) {
              console.log(`Hiding duplicate of ${videoId}`);
              container.style.display = 'none';
              container.setAttribute('data-duplicate', 'true');
            }
          }
        }
      }
    });
  }
}