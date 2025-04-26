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
import { YouTubePlayer } from "@/components/ui/youtube-player";
import { Activity } from "@shared/schema";
import "@/components/ui/activity-content.css";

// Define the interface for content fields
interface ContentField {
  id: string;
  type: 'text' | 'video';
  content: string;
  title?: string;
}

// Function to extract YouTube video IDs from HTML content
function extractYouTubeIdFromContent(content: string): { id: string | null, url: string | null } {
  if (!content) return { id: null, url: null };
  
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
                {weekOverviewActivity.contentFields?.filter((field: ContentField) => 
                  // For week 0 entries or entries where day is 0, include them
                  (field.title?.includes(`Week ${selectedWeek}`) || 
                   weekOverviewActivity.day === 0) && 
                  !field.title?.includes('Day')
                ).map((field: ContentField, index: number) => (
                  <div key={index} className="mb-4">
                    {field.title && (
                      <h3 className="text-lg font-semibold mb-2">{field.title}</h3>
                    )}
                    {field.type === 'video' ? (
                      <div className="mt-4 mb-4">
                        <YouTubePlayer videoId={field.content} />
                      </div>
                    ) : (
                      <>
                        {/* Process content to hide YouTube links when they're embedded */}
                        {(() => {
                          const { id, url } = extractYouTubeIdFromContent(field.content);
                          let contentToDisplay = field.content;
                          
                          // If a YouTube URL was found, remove it from the content before displaying
                          if (id && url) {
                            // Replace the URL with empty string
                            contentToDisplay = contentToDisplay.replace(url, '');
                            
                            // Also remove any empty paragraphs that might be left behind
                            contentToDisplay = contentToDisplay
                              .replace(/<p>\s*<\/p>/g, '')
                              .replace(/<p>WARM UP VIDEO<\/p>\s*<p>\s*<\/p>/g, '<p>WARM UP VIDEO</p>');
                          }
                          
                          return (
                            <div 
                              className="rich-text-content prose-sm text-base overflow-hidden" 
                              style={{ 
                                wordWrap: 'break-word',
                                overflowWrap: 'break-word'
                              }}
                              dangerouslySetInnerHTML={{ 
                                __html: contentToDisplay 
                              }}
                            />
                          );
                        })()}
                        
                        {/* Check for YouTube URLs in the text content and embed them */}
                        {(() => {
                          const { id } = extractYouTubeIdFromContent(field.content);
                          if (id) {
                            return (
                              <div className="mt-4 mb-4">
                                <YouTubePlayer videoId={id} />
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </>
                    )}
                  </div>
                ))}
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
                {currentActivity.contentFields?.map((field: ContentField, index: number) => (
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
                        {/* Process content to hide YouTube links when they're embedded */}
                        {(() => {
                          const { id, url } = extractYouTubeIdFromContent(field.content);
                          let contentToDisplay = field.content;
                          
                          // If a YouTube URL was found, remove it from the content before displaying
                          if (id && url) {
                            // Replace the URL with empty string
                            contentToDisplay = contentToDisplay.replace(url, '');
                            
                            // Also remove any empty paragraphs that might be left behind
                            contentToDisplay = contentToDisplay
                              .replace(/<p>\s*<\/p>/g, '')
                              .replace(/<p>WARM UP VIDEO<\/p>\s*<p>\s*<\/p>/g, '<p>WARM UP VIDEO</p>');
                          }
                          
                          return (
                            <div 
                              className="rich-text-content prose-sm text-lg overflow-hidden" 
                              style={{ 
                                wordWrap: 'break-word',
                                overflowWrap: 'break-word'
                              }}
                              dangerouslySetInnerHTML={{ 
                                __html: contentToDisplay 
                              }}
                            />
                          );
                        })()}
                        
                        {/* Check for YouTube URLs in the text content and embed them */}
                        {(() => {
                          const { id } = extractYouTubeIdFromContent(field.content);
                          if (id) {
                            return (
                              <div className="mt-4 mb-6">
                                <YouTubePlayer videoId={id} />
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </>
                    )}
                  </div>
                ))}
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