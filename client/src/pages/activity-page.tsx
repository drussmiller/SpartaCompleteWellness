import React, { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BottomNav } from "@/components/bottom-nav";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  ChevronDown, 
  ChevronUp,
  CalendarDays,
  BookText,
  Target
} from "lucide-react";
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { YouTubePlayer, removeDuplicateVideos } from "@/components/ui/youtube-player";
import { Activity } from "@shared/schema";
import "@/components/ui/activity-content.css";
import { DuplicateVideoDetector, FixWeek3WarmupVideo, FixWeek9WarmupVideo } from "@/components/ui/duplicate-video-detector";
import "@/components/ui/fix-duplicate-video.css"; // Special CSS to handle duplicates

// Define the interface for content fields
interface ContentField {
  id: string;
  type: 'text' | 'video';
  content: string;
  title?: string;
}

// Function to extract YouTube video IDs from HTML content, but only for plain URLs
// (not already embedded videos)
function extractYouTubeIdFromContent(content: string): { id: string | null, url: string | null } {
  if (!content) return { id: null, url: null };
  
  // Check if content already has embedded YouTube iframes
  const hasEmbeddedVideos = content.includes('<iframe src="https://www.youtube.com/embed/');
  
  // If the content already has embedded videos, don't extract additional videos
  if (hasEmbeddedVideos) {
    return { id: null, url: null };
  }
  
  // More comprehensive regex to find YouTube URLs in various formats
  const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  
  // Extract all matches and use the first valid one
  const matches = content.match(youtubeRegex);
  if (matches && matches[1]) {
    console.log('Found YouTube URL in content:', matches[0]);
    return { id: matches[1], url: matches[0] };
  }
  
  // Also look for bare YouTube IDs surrounded by non-URL text
  // Check if there's any text that might be a YouTube ID but not part of a biblical reference or other text
  const youtubeSpecificIdPattern = /\b([A-Za-z0-9_-]{11})\b/;
  const bareMatches = content.match(youtubeSpecificIdPattern);
  
  if (bareMatches && bareMatches[1]) {
    const possibleId = bareMatches[1];
    // Make sure it's not a biblical reference or other common text
    const notYouTubeIdPatterns = /(Corinthians|Testament|Scripture|Genesis|Exodus|Matthew|Chapter)/i;
    
    if (possibleId.length === 11 && !notYouTubeIdPatterns.test(possibleId) && /[0-9]/.test(possibleId)) {
      console.log('Found possible YouTube ID in content:', possibleId);
      return { id: possibleId, url: null };
    }
  }
  
  return { id: null, url: null };
}

// Define progress interface
interface ActivityProgress {
  currentWeek: number;
  currentDay: number;
  daysSinceStart: number;
  progressDays: number;
  debug?: {
    timezone: string;
    localTime: string;
  };
}

export default function ActivityPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get timezone offset for the current user (in minutes)
  const tzOffset = new Date().getTimezoneOffset();

  // Debug timezone information
  useEffect(() => {
    console.log('Timezone:', {
      name: Intl.DateTimeFormat().resolvedOptions().timeZone,
      offset: -tzOffset/60
    });
  }, [tzOffset]);

  // Get current week and day from the server
  const { data: currentProgress, isLoading: isProgressLoading } = useQuery<ActivityProgress>({
    queryKey: ["/api/activities/current", { tzOffset }],
    queryFn: async () => {
      const response = await fetch(`/api/activities/current?tzOffset=${tzOffset}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch current progress');
      }
      return response.json();
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (currentProgress) {
      setSelectedWeek(currentProgress.currentWeek);
      setSelectedDay(currentProgress.currentDay);
    }
  }, [currentProgress]);

  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedDay, setSelectedDay] = useState(1);


  const { data: activities, isLoading: isActivitiesLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activities"]
  });

  // Get current activity for selected day
  const currentActivity = activities?.find(
    (a: Activity) => a.week === selectedWeek && a.day === selectedDay
  );
  
  // Get week activities - all activities for the selected week
  const weekActivities = activities?.filter(
    (a: Activity) => a.week === selectedWeek
  );
  
  // Find the first activity of the week to use as the week overview
  const weekOverviewActivity = weekActivities?.[0];
  
  // State for collapsible section
  const [isWeekOverviewOpen, setIsWeekOverviewOpen] = useState(false);

  const navigatePrevDay = () => {
    if (selectedDay > 1) {
      setSelectedDay(selectedDay - 1);
    } else if (selectedWeek > 1) {
      const prevWeek = selectedWeek - 1;
      setSelectedWeek(prevWeek);
      const maxDay = 7;
      setSelectedDay(maxDay);
    }
  };

  const navigateNextDay = () => {
    // Only allow navigating up to current calculated day
    if (!currentProgress) return;

    const isLastDayOfWeek = selectedDay >= 7;

    if (!isLastDayOfWeek) {
      setSelectedDay(selectedDay + 1);
    } else if (selectedWeek < currentProgress.currentWeek) {
      setSelectedWeek(selectedWeek + 1);
      setSelectedDay(1);
    }
  };

  if (isProgressLoading || isActivitiesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading activities...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0 pt-28">
      {/* Add our duplicate video detection components */}
      <DuplicateVideoDetector />
      {selectedWeek === 3 && <FixWeek3WarmupVideo />}
      {selectedWeek === 9 && <FixWeek9WarmupVideo />}
      
      <div className="fixed top-0 left-0 right-0 z-50 h-10 bg-background">
        {/* This div is an empty spacer, which you can style as necessary */}
      </div>
      <header className="fixed top-10 left-0 right-0 z-50 h-16 bg-background border-b border-border">
        <div className="p-4">
          <h1 className="text-xl font-bold pl-0">Daily Activity</h1>
        </div>
      </header>
      <main className="p-4 max-w-3xl mx-auto w-full space-y-4">
        {/* Week Content Collapsible Section */}
        <Collapsible 
          open={isWeekOverviewOpen} 
          onOpenChange={setIsWeekOverviewOpen}
          className="border rounded-md">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="flex w-full justify-between p-4">
              <div className="flex items-center gap-2">
                <BookText className="h-4 w-4" />
                <span className="font-medium">Week {selectedWeek} Content</span>
              </div>
              {isWeekOverviewOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="p-4 bg-muted/20">
            {weekOverviewActivity ? (
              <div className="prose max-w-none">
                {/* Process the content to eliminate duplicate videos in weekly content */}
                {(() => {
                  // Filter relevant content fields
                  const relevantFields = weekOverviewActivity.contentFields?.filter((field: ContentField) => 
                    // For week 0 entries or entries where day is 0, include them
                    (field.title?.includes(`Week ${selectedWeek}`) || weekOverviewActivity.day === 0) && 
                    !field.title?.includes('Day')
                  );
                  
                  // Special handling for Week 3 warmup video
                  if (selectedWeek === 3 && weekOverviewActivity.week === 3 && weekOverviewActivity.day === 0) {
                    // Process each field to render only once
                    return relevantFields.map((field: ContentField, index: number) => {
                      // Clean embedded content of duplicate videos
                      let processedContent = field.content;
                      
                      // Special fix for week 3 warmup video - comprehensive fix to remove duplicates
                      if (processedContent && processedContent.includes('youtube.com/embed/JT49h1zSD6I')) {
                        // First, extract all video iframes
                        const iframeRegex = /<iframe[^>]*src="[^"]*JT49h1zSD6I[^"]*"[^>]*><\/iframe>/g;
                        const matches = processedContent.match(iframeRegex);
                        
                        if (matches && matches.length > 1) {
                          // We have multiple videos with the same ID
                          console.log(`Found ${matches.length} instances of Week 3 warmup video`);
                          
                          // Remove all video wrappers
                          processedContent = processedContent.replace(
                            /<div class="video-wrapper"><iframe[^>]*src="[^"]*JT49h1zSD6I[^"]*"[^>]*><\/iframe><\/div>/g,
                            ''
                          );
                          
                          // Add back just one video after "WARM UP VIDEO" text
                          if (processedContent.includes('WARM UP VIDEO')) {
                            processedContent = processedContent.replace(
                              'WARM UP VIDEO',
                              `WARM UP VIDEO</p><div class="video-wrapper">${matches[0]}</div><p>`
                            );
                          } else {
                            // If no "WARM UP VIDEO" text, just add at the beginning
                            processedContent = `<div class="video-wrapper">${matches[0]}</div>${processedContent}`;
                          }
                        }
                      }
                      
                      // Create unique rendered element
                      return (
                        <div key={index} className="mb-4">
                          {field.title && (
                            <h3 className="text-lg font-semibold mb-2">{field.title}</h3>
                          )}
                          {field.type === 'video' ? (
                            <div className="mt-4 mb-4">
                              <YouTubePlayer videoId={field.content} />
                            </div>
                          ) : (
                            <div 
                              className="rich-text-content prose-sm text-base overflow-hidden weekly-content" 
                              style={{ 
                                wordWrap: 'break-word',
                                overflowWrap: 'break-word'
                              }}
                              dangerouslySetInnerHTML={{ 
                                __html: processedContent 
                              }}
                            />
                          )}
                        </div>
                      );
                    });
                  }
                  
                  // Standard rendering for other weeks
                  return relevantFields.map((field: ContentField, index: number) => {
                    // Process content for all weeks to prevent duplicate videos
                    let processedContent = field.content;
                    
                    // General solution to prevent duplicate videos in any week's content
                    if (processedContent && processedContent.includes('class="video-wrapper"')) {
                      // Make sure we don't have duplicate video wrappers
                      const uniqueVideos = new Set();
                      // Extract all video IDs using a regex pattern
                      const videoRegex = /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/g;
                      let match;
                      const videoIds = [];
                      
                      while ((match = videoRegex.exec(processedContent)) !== null) {
                        videoIds.push(match[1]);
                      }
                      
                      // For any duplicated videos, keep only the first instance
                      videoIds.forEach(videoId => {
                        if (uniqueVideos.has(videoId)) {
                          // This is a duplicate - remove all instances after the first
                          const videoPattern = new RegExp(
                            `<p>(<em>)?.*?<div class="video-wrapper"><iframe.*?${videoId}.*?<\\/iframe><\\/div><\\/p>`, 
                            'g'
                          );
                          let replacement = '';
                          let found = false;
                          
                          // Replace the processedContent with each match replaced properly
                          processedContent = processedContent.replace(videoPattern, (match) => {
                            if (!found) {
                              found = true;
                              return match; // Keep the first instance
                            }
                            return ''; // Remove duplicates
                          });
                        } else {
                          uniqueVideos.add(videoId);
                        }
                      });
                    }
                    
                    return (
                      <div key={index} className="mb-4">
                        {field.title && (
                          <h3 className="text-lg font-semibold mb-2">{field.title}</h3>
                        )}
                        {field.type === 'video' ? (
                          <div className="mt-4 mb-4">
                            <YouTubePlayer videoId={field.content} />
                          </div>
                        ) : (
                          <div 
                            className="rich-text-content prose-sm text-base overflow-hidden weekly-content" 
                            style={{ 
                              wordWrap: 'break-word',
                              overflowWrap: 'break-word'
                            }}
                            dangerouslySetInnerHTML={{ 
                              __html: processedContent 
                            }}
                          />
                        )}
                      </div>
                    );
                  });
                })()}
                {weekOverviewActivity.contentFields?.filter((field: ContentField) => 
                  (field.title?.includes(`Week ${selectedWeek}`) || 
                   weekOverviewActivity.day === 0) && 
                  !field.title?.includes('Day')).length === 0 && (
                  <p className="text-muted-foreground text-center py-2">No week content available</p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-2">No week content available</p>
            )}
          </CollapsibleContent>
        </Collapsible>
        
        {/* Day Navigation */}
        <div className="flex items-center justify-center gap-4 mt-2">
          <Button
            variant="outline"
            size="icon"
            onClick={navigatePrevDay}
            disabled={selectedWeek === 1 && selectedDay === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium text-lg">
            Week {selectedWeek} - Day {selectedDay}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={navigateNextDay}
            disabled={
              !currentProgress ||
              (selectedWeek === currentProgress.currentWeek && 
               selectedDay >= currentProgress.currentDay)
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Daily Content Card */}
        {currentActivity ? (
          <Card>
            <CardContent className="p-6">
              <div className="prose max-w-none">
                {currentActivity.contentFields?.map((field: ContentField, index: number) => {
                  // Process daily content to remove duplicate videos
                  let processedContent = field.content;
                  
                  // Only process content with embedded videos
                  if (processedContent && processedContent.includes('class="video-wrapper"')) {
                    // Make sure we don't have duplicate video wrappers
                    const uniqueVideos = new Set();
                    // Extract all video IDs using a regex pattern
                    const videoRegex = /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/g;
                    let match;
                    const videoIds = [];
                    
                    while ((match = videoRegex.exec(processedContent)) !== null) {
                      videoIds.push(match[1]);
                    }
                    
                    // Process each unique video ID
                    videoIds.forEach(videoId => {
                      if (uniqueVideos.has(videoId)) {
                        // This is a duplicate - remove all instances after the first
                        const videoPattern = new RegExp(
                          `<p>(<em>)?.*?<div class="video-wrapper"><iframe.*?${videoId}.*?<\\/iframe><\\/div><\\/p>`, 
                          'g'
                        );
                        let found = false;
                        
                        // Replace content keeping only the first instance
                        processedContent = processedContent.replace(videoPattern, (match) => {
                          if (!found) {
                            found = true;
                            return match; // Keep the first instance
                          }
                          return ''; // Remove duplicates
                        });
                      } else {
                        uniqueVideos.add(videoId);
                      }
                    });
                  }
                  
                  return (
                    <div key={index} className="mb-8">
                      {field.title && field.title !== `Week ${selectedWeek} - Day ${selectedDay}` && (
                        <h2 className="text-xl font-bold mb-4">{field.title}</h2>
                      )}
                      {field.type === 'video' ? (
                        <div className="mt-4 mb-6">
                          <YouTubePlayer videoId={field.content} />
                        </div>
                      ) : (
                        <>
                          <div 
                            className="rich-text-content prose-sm text-lg overflow-hidden daily-content" 
                            style={{ 
                              wordWrap: 'break-word',
                              overflowWrap: 'break-word'
                            }}
                            dangerouslySetInnerHTML={{ 
                              __html: processedContent 
                            }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No activity found for this day
            </CardContent>
          </Card>
        )}
      </main>
      <div className="md:hidden">
        <BottomNav orientation="horizontal" />
      </div>
    </div>
  );
}