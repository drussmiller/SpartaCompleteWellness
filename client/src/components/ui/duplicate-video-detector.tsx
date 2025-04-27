import React, { useEffect } from 'react';

/**
 * DuplicateVideoDetector - A component that finds and hides duplicate YouTube videos
 * Specifically designed to fix the issue with Week 3 warmup videos appearing twice in weekly content
 */
export function DuplicateVideoDetector() {
  useEffect(() => {
    // Function to mark duplicate videos with a data attribute
    const detectAndMarkDuplicates = () => {
      console.log('Running duplicate video detector...');
      
      // Get all weekly-content containers
      const weeklyContents = document.querySelectorAll('.weekly-content');
      
      weeklyContents.forEach(container => {
        // Get all iframes within this container
        const iframes = container.querySelectorAll('iframe[src*="youtube.com/embed/"]');
        
        if (iframes.length > 1) {
          console.log(`Found ${iframes.length} YouTube videos in weekly content`);
          
          // Map of video IDs to their iframe elements
          const videoMap = new Map();
          // Find duplicates
          const duplicates = new Set();
          
          // First pass - identify duplicates
          iframes.forEach(iframe => {
            const src = iframe.getAttribute('src') || '';
            const match = src.match(/embed\/([a-zA-Z0-9_-]{11})/);
            
            if (match && match[1]) {
              const videoId = match[1];
              
              if (videoMap.has(videoId)) {
                duplicates.add(videoId);
              } else {
                videoMap.set(videoId, iframe);
              }
            }
          });
          
          if (duplicates.size > 0) {
            console.log(`Found ${duplicates.size} duplicate video IDs: ${Array.from(duplicates).join(', ')}`);
            
            // Second pass - mark duplicates
            iframes.forEach(iframe => {
              const src = iframe.getAttribute('src') || '';
              const match = src.match(/embed\/([a-zA-Z0-9_-]{11})/);
              
              if (match && match[1]) {
                const videoId = match[1];
                
                if (duplicates.has(videoId)) {
                  // Find the parent video-wrapper div
                  let parent = iframe.parentElement;
                  while (parent && !parent.classList.contains('video-wrapper')) {
                    parent = parent.parentElement;
                  }
                  
                  if (parent && parent !== videoMap.get(videoId).parentElement) {
                    console.log(`Marking duplicate of ${videoId} as duplicate`);
                    parent.setAttribute('data-duplicate', 'true');
                  }
                }
              }
            });
          }
        }
      });
    };
    
    // Run immediately
    detectAndMarkDuplicates();
    
    // Also run when we click on week sections (which might open collapsible content) 
    const weekTriggers = document.querySelectorAll('.collapsible-trigger');
    weekTriggers.forEach(trigger => {
      trigger.addEventListener('click', () => {
        // Wait for content to be rendered
        setTimeout(detectAndMarkDuplicates, 100);
      });
    });
    
    // Run again after a short delay to handle initial render
    const timerId = setTimeout(detectAndMarkDuplicates, 500);
    
    return () => {
      clearTimeout(timerId);
      // Clean up event listeners
      weekTriggers.forEach(trigger => {
        trigger.removeEventListener('click', detectAndMarkDuplicates);
      });
    };
  }, []);
  
  // This component doesn't render anything visible
  return null;
}

// Special function just for Week 3 warmup video
export function FixWeek3WarmupVideo() {
  useEffect(() => {
    const timerId = setTimeout(() => {
      // Target specifically the Week 3 warmup video that's causing issues
      const warmupIframes = document.querySelectorAll('iframe[src*="JT49h1zSD6I"]');
      
      if (warmupIframes.length > 1) {
        console.log(`Found ${warmupIframes.length} instances of Week 3 warmup video`);
        
        // Keep only the first instance
        for (let i = 1; i < warmupIframes.length; i++) {
          const iframe = warmupIframes[i];
          // Find the parent video-wrapper div
          let parent = iframe.parentElement;
          while (parent && !parent.classList.contains('video-wrapper')) {
            parent = parent.parentElement;
          }
          
          if (parent) {
            console.log('Hiding duplicate Week 3 warmup video');
            parent.style.display = 'none';
          }
        }
      }
    }, 500);
    
    return () => clearTimeout(timerId);
  }, []);
  
  return null;
}