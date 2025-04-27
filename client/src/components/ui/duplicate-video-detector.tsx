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
      
      // First check if we're on Week 9
      const weekHeader = document.querySelector('span.font-medium');
      if (weekHeader && weekHeader.textContent && weekHeader.textContent.includes('Week 9')) {
        console.log('Week 9 detected - applying video fix');
        
        // Get all weekly-content containers
        const weeklyContentDivs = document.querySelectorAll('.weekly-content');
        if (weeklyContentDivs.length > 0) {
          console.log('Week 9 known to have duplicate video issues - applying targeted fix');
          
          // Get all iframes
          const warmupIframes = document.querySelectorAll('iframe[src*="JT49h1zSD6I"]');
          if (warmupIframes.length > 1) {
            console.log(`Found ${warmupIframes.length} instances of the Week 3 warmup video`);
            
            // Map all YouTube videos to count duplicates
            const allYoutubeIframes = document.querySelectorAll('iframe[src*="youtube.com/embed"]');
            console.log(`Found ${allYoutubeIframes.length} total YouTube videos on page`);
            
            // Find duplicates
            const videoMap = new Map();
            const duplicateIds = new Set();
            
            allYoutubeIframes.forEach(iframe => {
              const src = iframe.getAttribute('src') || '';
              const match = src.match(/embed\/([a-zA-Z0-9_-]{11})/);
              
              if (match && match[1]) {
                const videoId = match[1];
                if (videoMap.has(videoId)) {
                  duplicateIds.add(videoId);
                } else {
                  videoMap.set(videoId, iframe);
                }
              }
            });
            
            if (duplicateIds.size > 0) {
              console.log(`Found ${duplicateIds.size} duplicate video IDs: ${Array.from(duplicateIds).join(', ')}`);
              
              // Keep first instance, hide others
              duplicateIds.forEach(videoId => {
                let foundFirst = false;
                allYoutubeIframes.forEach(iframe => {
                  const src = iframe.getAttribute('src') || '';
                  // Make sure we're working with string values
                  const videoIdStr = String(videoId);
                  if (src.includes(videoIdStr)) {
                    if (!foundFirst) {
                      foundFirst = true;
                    } else {
                      console.log(`Hiding previous instance of ${videoIdStr}`);
                      let parent = iframe.parentElement;
                      while (parent && !parent.classList.contains('video-wrapper')) {
                        parent = parent.parentElement;
                      }
                      if (parent) {
                        // Use HTMLElement type to ensure style property access is valid
                        const htmlElement = parent as HTMLElement;
                        htmlElement.style.display = 'none';
                      }
                    }
                  }
                });
              });
            }
          }
        }
      }
      
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
            (parent as HTMLElement).style.display = 'none';
          }
        }
      }
    }, 500);
    
    return () => clearTimeout(timerId);
  }, []);
  
  return null;
}

// Special function just for Week 9 video fix
export function FixWeek9WarmupVideo() {
  useEffect(() => {
    const timerId = setTimeout(() => {
      console.log('Checking for Week 9 video duplication issues');
      
      // Target specifically the Week 9 warmup video that's causing issues
      const warmupIframes = document.querySelectorAll('iframe[src*="JT49h1zSD6I"]');
      
      if (warmupIframes.length > 1) {
        console.log(`Found ${warmupIframes.length} instances of warmup video in Week 9`);
        
        // Keep only the first instance
        for (let i = 1; i < warmupIframes.length; i++) {
          const iframe = warmupIframes[i];
          // Find the parent video-wrapper div
          let parent = iframe.parentElement;
          while (parent && !parent.classList.contains('video-wrapper')) {
            parent = parent.parentElement;
          }
          
          if (parent) {
            console.log('Hiding duplicate Week 9 warmup video');
            (parent as HTMLElement).style.display = 'none';
            // If we want to be more aggressive, we can also remove the element
            if (parent.parentElement) {
              parent.parentElement.removeChild(parent);
            }
          } else {
            // If we can't find parent, try hiding the iframe directly
            (iframe as HTMLIFrameElement).style.display = 'none';
          }
        }
      }
      
      // Also target any anchor tags that might be wrapping videos
      const anchorVideos = document.querySelectorAll('a:has(iframe[src*="youtube.com/embed"])');
      if (anchorVideos.length > 0) {
        console.log(`Found ${anchorVideos.length} videos wrapped in anchor tags - fixing those`);
        
        anchorVideos.forEach(anchor => {
          // Create a clone of the iframe
          const iframe = anchor.querySelector('iframe');
          if (iframe) {
            const parent = anchor.parentElement;
            if (parent) {
              // Replace the anchor with just the iframe's div
              const videoWrapper = iframe.closest('.video-wrapper');
              if (videoWrapper) {
                parent.replaceChild(videoWrapper, anchor);
              }
            }
          }
        });
      }
    }, 500);
    
    return () => clearTimeout(timerId);
  }, []);
  
  return null;
}