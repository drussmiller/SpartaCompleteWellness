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


// Define the interface for content fields
interface ContentField {
  id: string;
  type: 'text' | 'video';
  content: string;
  title?: string;
}

// Function to remove duplicate videos from the last content field only
function removeDuplicateVideosFromLastField(content: string): string {
  if (!content || !content.includes('iframe')) return content;
  
  console.log('Processing content for duplicate videos in last field');
  
  // First, remove any stray ">" symbols that appear around video content
  let processedContent = content.replace(/>\s*>/g, '>');
  
  // Find all YouTube iframes with their surrounding context
  const iframeRegex = /<iframe[^>]*src="[^"]*youtube\.com\/embed\/([a-zA-Z0-9_-]{11})[^"]*"[^>]*><\/iframe>/g;
  const foundIframes = [];
  let match;
  
  // Reset regex lastIndex to ensure we find all matches
  iframeRegex.lastIndex = 0;
  
  while ((match = iframeRegex.exec(processedContent)) !== null) {
    foundIframes.push({
      fullMatch: match[0],
      videoId: match[1],
      index: match.index
    });
  }
  
  console.log(`Found ${foundIframes.length} total iframes in last field`);
  
  if (foundIframes.length <= 1) {
    console.log('No duplicates to process');
    return processedContent;
  }
  
  // Group videos by ID to find actual duplicates
  const videoGroups = new Map();
  foundIframes.forEach(iframe => {
    if (!videoGroups.has(iframe.videoId)) {
      videoGroups.set(iframe.videoId, []);
    }
    videoGroups.get(iframe.videoId).push(iframe);
  });
  
  // Only remove if there are actual duplicates (more than 1 of the same video)
  let hasRemovedDuplicates = false;
  videoGroups.forEach((occurrences, videoId) => {
    if (occurrences.length > 1) {
      console.log(`Found ${occurrences.length} duplicates of video ${videoId}, removing extras`);
      
      // Remove all but the first occurrence
      for (let i = 1; i < occurrences.length; i++) {
        const iframe = occurrences[i];
        // Look for the iframe within a larger context to remove cleanly
        const beforeIframe = processedContent.substring(Math.max(0, iframe.index - 50), iframe.index);
        const afterIframe = processedContent.substring(iframe.index + iframe.fullMatch.length, iframe.index + iframe.fullMatch.length + 50);
        
        // Simple removal of just the iframe
        processedContent = processedContent.replace(iframe.fullMatch, '');
        hasRemovedDuplicates = true;
        console.log(`Removed duplicate iframe for video ${videoId}`);
      }
    }
  });
  
  if (!hasRemovedDuplicates) {
    console.log('No duplicate videos found to remove');
  }
  
  return processedContent;
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
  const [loadedWeeks, setLoadedWeeks] = useState<Set<number>>(new Set());
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Calculate initial weeks to load (current week + previous 4)
  const getInitialWeeks = (currentWeek: number) => {
    const weeks = [];
    for (let i = Math.max(1, currentWeek - 4); i <= currentWeek; i++) {
      weeks.push(i);
    }
    return weeks;
  };

  // Initial load of ONLY current week for fastest loading
  const { isLoading: isActivitiesLoading } = useQuery<Activity[]>({
    queryKey: ["/api/activities", "current", currentProgress?.currentWeek, user?.preferredActivityTypeId],
    queryFn: async () => {
      if (!currentProgress) return [];

      // Load only the current week initially
      const currentWeek = currentProgress.currentWeek;
      const activityTypeParam = user?.preferredActivityTypeId ? `&activityTypeId=${user.preferredActivityTypeId}` : '';
      const response = await fetch(`/api/activities?weeks=${currentWeek}${activityTypeParam}`);

      if (!response.ok) {
        throw new Error('Failed to fetch activities');
      }

      const data = await response.json();
      setActivities(data);
      setLoadedWeeks(new Set([currentWeek]));

      console.log(`Loaded current week: ${currentWeek}${user?.preferredActivityTypeId ? ` with activity type: ${user.preferredActivityTypeId}` : ''}`);
      return data;
    },
    enabled: !!currentProgress && !!user,
  });

  // Function to load additional weeks when needed
  const loadWeek = async (week: number) => {
    if (loadedWeeks.has(week) || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const activityTypeParam = user?.preferredActivityTypeId ? `&activityTypeId=${user.preferredActivityTypeId}` : '';
      const response = await fetch(`/api/activities?weeks=${week}${activityTypeParam}`);
      if (!response.ok) {
        throw new Error('Failed to fetch additional week');
      }

      const newActivities = await response.json();
      setActivities(prev => [...prev, ...newActivities]);
      setLoadedWeeks(prev => new Set([...Array.from(prev), week]));

      console.log(`Lazy loaded week: ${week}${user?.preferredActivityTypeId ? ` with activity type: ${user.preferredActivityTypeId}` : ''}`);
    } catch (error) {
      console.error('Failed to load week:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Load week when user navigates to it
  React.useEffect(() => {
    if (selectedWeek && !loadedWeeks.has(selectedWeek)) {
      loadWeek(selectedWeek);
    }
  }, [selectedWeek, loadedWeeks]);

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

  const navigatePrevDay = async () => {
    if (selectedDay > 1) {
      setSelectedDay(selectedDay - 1);
    } else if (selectedWeek > 1) {
      const prevWeek = selectedWeek - 1;
      
      // Load the previous week if it's not already loaded
      if (!loadedWeeks.has(prevWeek)) {
        await loadWeek(prevWeek);
      }
      
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

      <div className="fixed top-0 left-0 right-0 z-50 h-10 bg-background">
        {/* This div is an empty spacer, which you can style as necessary */}
      </div>
      <header className="fixed top-10 left-0 right-0 z-50 h-16 bg-background border-b border-border">
        <div className="p-4">
          <h1 className="text-xl font-bold pl-0">Daily Activity</h1>
        </div>
      </header>
      <main className="p-4 max-w-[1000px] mx-auto w-full space-y-4 md:px-44 md:pl-56">
        {/* Loading status for current week */}
        {!loadedWeeks.has(selectedWeek) && (
          <div className="text-center p-4 bg-muted/50 rounded-md">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading Week {selectedWeek}...</p>
          </div>
        )}

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

                  // Standard rendering - display all content as-is
                  return relevantFields?.map((field: ContentField, index: number) => (
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
                            __html: field.content 
                          }}
                        />
                      )}
                    </div>
                  ));
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
                  // For daily content, process only the last field to handle duplicates
                  let processedContent = field.content;
                  const isLastField = index === (currentActivity.contentFields?.length ?? 0) - 1;
                  
                  // Only process duplicates for the last content field
                  if (isLastField && field.type === 'text' && processedContent.includes('iframe')) {
                    processedContent = removeDuplicateVideosFromLastField(processedContent);
                  }

                  return (
                    <div key={index} className="mb-8">
                      {field.title && 
                       field.title !== `Week ${selectedWeek} - Day ${selectedDay}` &&
                       !field.title.match(/^Week\s*\d+\s*Day\s*\d+/i) && (
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