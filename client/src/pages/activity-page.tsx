import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Activity } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/app-layout";
import { YouTubePlayer } from "@/components/ui/youtube-player";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function ActivityPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [weekContentOpen, setWeekContentOpen] = useState(true); // Week content defaults to open
  const [weekDayContentOpen, setWeekDayContentOpen] = useState(true); // Week and Day content defaults to open
  const [reengageOpen, setReengageOpen] = useState(false);
  const [reengageWeek, setReengageWeek] = useState<string>("");

  const { data: activityStatus } = useQuery({
    queryKey: ["/api/activities/current"],
    queryFn: async () => {
      const response = await fetch(`/api/activities/current?tzOffset=${new Date().getTimezoneOffset()}`);
      if (!response.ok) throw new Error("Failed to fetch activity status");
      return response.json();
    },
    enabled: !!user?.teamId,
  });

  // Check if user's team is in a competitive group
  const { data: competitiveStatus } = useQuery({
    queryKey: ["/api/teams", user?.teamId, "competitive"],
    queryFn: async () => {
      if (!user?.teamId) return { competitive: false };
      const response = await fetch(`/api/teams/${user.teamId}/competitive`);
      if (!response.ok) throw new Error("Failed to fetch competitive status");
      return response.json();
    },
    enabled: !!user?.teamId,
  });

  // Get all activities including Bible verses (activityTypeId = 0)
  const { data: allActivities, isLoading: activitiesLoading, error: activitiesError } = useQuery<Activity[]>({
    queryKey: ["/api/activities"],
    queryFn: async () => {
      const response = await fetch(`/api/activities`);
      if (!response.ok) throw new Error("Failed to fetch activities");
      return response.json();
    },
    enabled: !!user?.teamId,
  });

  // Separate Bible verses from workout activities
  const bibleVerses = React.useMemo(() => 
    allActivities?.filter(activity => activity.activityTypeId === 0) || [], 
    [allActivities]
  );

  const activities = React.useMemo(() => 
    allActivities?.filter(activity => 
      activity.activityTypeId === (user?.preferredActivityTypeId || 1)
    ) || [], 
    [allActivities, user?.preferredActivityTypeId]
  );

  // Set initial values based on current week/day
  React.useEffect(() => {
    if (activityStatus?.currentWeek && selectedWeek === 1) {
      setSelectedWeek(activityStatus.currentWeek);
    }
    if (activityStatus?.currentDay && selectedDay === 1) {
      setSelectedDay(activityStatus.currentDay);
    }
  }, [activityStatus]);

  // Navigation functions for week content
  const goToPreviousWeek = () => {
    if (selectedWeek > 1) {
      setSelectedWeek(selectedWeek - 1);
    }
  };

  const goToNextWeek = () => {
    const currentWeek = activityStatus?.currentWeek || 1;
    // Don't allow going beyond current week
    if (selectedWeek < currentWeek) {
      setSelectedWeek(selectedWeek + 1);
    }
  };

  // Navigation functions for daily content
  const goToPreviousDay = () => {
    if (selectedDay === 1) {
      // Go to previous week's day 7
      const prevWeek = selectedWeek - 1;
      if (prevWeek >= 1) {
        setSelectedWeek(prevWeek);
        setSelectedDay(7);
      }
    } else {
      setSelectedDay(selectedDay - 1);
    }
  };

  const goToNextDay = () => {
    const currentWeek = activityStatus?.currentWeek || 1;
    const currentDay = activityStatus?.currentDay || 1;

    // Don't allow going beyond current day
    if (selectedWeek === currentWeek && selectedDay >= currentDay) {
      return;
    }

    if (selectedDay === 7) {
      // Go to next week's day 1
      setSelectedWeek(selectedWeek + 1);
      setSelectedDay(1);
    } else {
      setSelectedDay(selectedDay + 1);
    }
  };

  // Check if we can navigate for week content
  const canGoToPreviousWeek = selectedWeek > 1;
  const canGoToNextWeek = () => {
    const currentWeek = activityStatus?.currentWeek || 1;
    return selectedWeek < currentWeek;
  };

  // Check if we can navigate for daily content
  const canGoToPrevious = selectedWeek > 1 || selectedDay > 1;
  const canGoToNext = () => {
    const currentWeek = activityStatus?.currentWeek || 1;
    const currentDay = activityStatus?.currentDay || 1;
    return !(selectedWeek === currentWeek && selectedDay >= currentDay);
  };

  // Re-engage mutation
  const reengageMutation = useMutation({
    mutationFn: async (targetWeek: number) => {
      const response = await apiRequest("POST", "/api/users/reengage", {
        targetWeek,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to re-engage");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Program successfully reset. Your posts have been updated.",
      });
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/activities/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      setReengageWeek("");
      setReengageOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleReengage = () => {
    if (!reengageWeek) {
      toast({
        title: "Error",
        description: "Please select a week to restart from",
        variant: "destructive",
      });
      return;
    }

    const targetWeek = parseInt(reengageWeek);
    if (targetWeek < 1 || targetWeek > (activityStatus?.currentWeek || 1)) {
      toast({
        title: "Error",
        description: "Invalid week selection",
        variant: "destructive",
      });
      return;
    }

    reengageMutation.mutate(targetWeek);
  };

  if (activitiesLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p>Loading activities...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (activitiesError) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-red-500 mb-2">Error Loading Activities</h2>
              <p className="text-gray-600">{activitiesError instanceof Error ? activitiesError.message : 'An error occurred'}</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Find week content (day 0)
  const weekContent = activities?.find(activity => 
    activity.week === selectedWeek && activity.day === 0
  );

  // Find selected daily activity
  const selectedActivity = activities?.find(activity => 
    activity.week === selectedWeek && activity.day === selectedDay
  );

  // Find Bible verse for the selected day based on absolute day number
  // Calculate the absolute day: (week - 1) * 7 + day
  const absoluteDay = (selectedWeek - 1) * 7 + selectedDay;

  // Find the Bible verse that matches this absolute day
  // Bible verses are stored with their absolute day calculated as (week - 1) * 7 + day
  const selectedBibleVerse = bibleVerses?.find(verse => {
    const verseAbsoluteDay = (verse.week - 1) * 7 + verse.day;
    return verseAbsoluteDay === absoluteDay;
  });

  return (
    <AppLayout>
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border pt-14">
        <div className="max-w-2xl mx-auto p-4">
          <h1 className="text-xl font-bold">Daily Activity</h1>
        </div>
      </div>

      <main className="pb-24 space-y-4 max-w-2xl mx-auto w-full pl-8 pr-4 py-6 text-lg mt-[96px]">
        {/* Week Content Dropdown - Defaults to Closed */}
        <Collapsible open={weekContentOpen} onOpenChange={setWeekContentOpen}>
          <Card className="mb-6">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle>Week Content</CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${weekContentOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToPreviousWeek}
                    disabled={!canGoToPreviousWeek}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h3 className="text-lg font-semibold">Week {selectedWeek}</h3>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToNextWeek}
                    disabled={!canGoToNextWeek()}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Week Content Display */}
                {weekContent ? (
                  <div className="mt-4">
                    <div className="space-y-4">
                      {weekContent.contentFields?.map((item: any, index: number) => (
                        <div key={index}>
                          {item.type === 'text' && (
                            <div>
                              <div 
                                className="rich-text-content daily-content"
                                style={{
                                  wordBreak: 'break-word',
                                  overflowWrap: 'break-word'
                                }}
                                dangerouslySetInnerHTML={{ 
                                  __html: (item.content || '')
                                    .replace(/(<\/div>)\\?">/g, '$1') // Remove \"> after closing div tags specifically
                                }} 
                              />
                            </div>
                          )}
                          {item.type === 'video' && (
                            <div>
                              <h4 className="text-md font-medium mb-2">{item.title}</h4>
                              <YouTubePlayer videoId={item.content} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-gray-600 mt-4">
                    No week information available for Week {selectedWeek}.
                  </p>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Week and Day Content Dropdown - Defaults to Open */}
        <Collapsible open={weekDayContentOpen} onOpenChange={setWeekDayContentOpen}>
          <Card className="mb-6">
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle>Week and Day Content</CardTitle>
                  <ChevronDown className={`h-4 w-4 transition-transform ${weekDayContentOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToPreviousDay}
                    disabled={!canGoToPrevious}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h3 className="text-lg font-semibold">Week {selectedWeek} - Day {selectedDay}</h3>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToNextDay}
                    disabled={!canGoToNext()}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Daily Activity Content Display */}
                {selectedActivity || selectedBibleVerse ? (
                  <div className="mt-4">
                    <div className="space-y-6">
                      {/* Display Bible verse first if it exists */}
                      {selectedBibleVerse && (
                        <div className="bible-verse-section">
                          {selectedBibleVerse.contentFields?.map((item: any, index: number) => {
                            if (item.type === 'text') {
                              let content = item.content || '';

                              // Check if this content already has links from server-side processing
                              const hasLinks = content.includes('<a href=');

                              if (!hasLinks) {
                                // Match Bible verses - prioritize comma-separated chapters, then ranges, then single chapters/verses
                                const bibleVerseRegex = /\b(?:(?:1|2|3)\s+)?(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|(?:1|2)\s*Samuel|(?:1|2)\s*Kings|(?:1|2)\s*Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song\s+of\s+Songs?|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|(?:1|2)\s*Corinthians|Galatians?|Galation|Ephesians|Philippians|Colossians|(?:1|2)\s*Thessalonians|(?:1|2)\s*Timothy|Titus|Philemon|Hebrews|James|(?:1|2)\s*Peter|(?:1|2|3)\s*John|Jude|Revelation)\s+(?:\d+(?:\s*,\s*\d+)+|\d+(?:-\d+)?(?:\s*:\s*(?:Verses?\s+)?\d+(?:-\d+)?(?:,\s*\d+(?:-\d+)?)?)*)\b/gi;

                                content = content.replace(bibleVerseRegex, (match) => {
                                  const bookMap: { [key: string]: string } = {
                                    'Genesis': 'GEN', 'Exodus': 'EXO', 'Leviticus': 'LEV', 'Numbers': 'NUM', 'Deuteronomy': 'DEU',
                                    'Joshua': 'JOS', 'Judges': 'JDG', 'Ruth': 'RUT', '1 Samuel': '1SA', '2 Samuel': '2SA',
                                    '1 Kings': '1KI', '2 Kings': '2KI', '1 Chronicles': '1CH', '2 Chronicles': '2CH',
                                    'Ezra': 'EZR', 'Nehemiah': 'NEH', 'Esther': 'EST', 'Job': 'JOB', 'Psalm': 'PSA', 'Psalms': 'PSA',
                                    'Proverbs': 'PRO', 'Ecclesiastes': 'ECC', 'Song of Songs': 'SNG', 'Isaiah': 'ISA',
                                    'Jeremiah': 'JER', 'Lamentations': 'LAM', 'Ezekiel': 'EZK', 'Daniel': 'DAN',
                                    'Hosea': 'HOS', 'Joel': 'JOL', 'Amos': 'AMO', 'Obadiah': 'OBA', 'Jonah': 'JON',
                                    'Micah': 'MIC', 'Nahum': 'NAM', 'Habakkuk': 'HAB', 'Zephaniah': 'ZEP', 'Haggai': 'HAG',
                                    'Zechariah': 'ZEC', 'Malachi': 'MAL', 'Matthew': 'MAT', 'Mark': 'MRK', 'Luke': 'LUK',
                                    'John': 'JHN', 'Acts': 'ACT', 'Romans': 'ROM', '1 Corinthians': '1CO', '2 Corinthians': '2CO',
                                    'Galatians': 'GAL', 'Galation': 'GAL', 'Ephesians': 'EPH', 'Philippians': 'PHP', 'Colossians': 'COL',
                                    '1 Thessalonians': '1TH', '2 Thessalonians': '2TH', '1 Timothy': '1TI', '2 Timothy': '2TI',
                                    'Titus': 'TIT', 'Philemon': 'PHM', 'Hebrews': 'HEB', 'James': 'JAS', '1 Peter': '1PE',
                                    '2 Peter': '2PE', '1 John': '1JN', '2 John': '2JN', '3 John': '3JN', 'Jude': 'JUD', 'Revelation': 'REV'
                                  };

                                  // Extract book name and reference
                                  const parts = match.match(/^(.+?)\s+(\d+.*)$/);
                                  if (parts) {
                                    const bookName = parts[1].trim();
                                    const reference = parts[2].trim();
                                    const bookAbbr = bookMap[bookName] || bookName;

                                    // Check for comma-separated chapters: "30, 60, 90, 120"
                                    if (reference.includes(',') && !reference.includes(':')) {
                                      const chapters = reference.split(',').map(ch => ch.trim()).filter(ch => /^\d+$/.test(ch));

                                      if (chapters.length > 1) {
                                        const links = chapters.map(chapter => {
                                          const url = `https://www.bible.com/bible/111/${bookAbbr}.${chapter}.NIV`;
                                          return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline;">${chapter}</a>`;
                                        });
                                        return `${bookName} ${links.join(', ')}`;
                                      }
                                    }

                                    // Check for chapter range: "33-34"
                                    const chapterRangeMatch = reference.match(/^(\d+)-(\d+)$/);
                                    if (chapterRangeMatch) {
                                      const chapter1 = chapterRangeMatch[1];
                                      const chapter2 = chapterRangeMatch[2];
                                      const url1 = `https://www.bible.com/bible/111/${bookAbbr}.${chapter1}.NIV`;
                                      const url2 = `https://www.bible.com/bible/111/${bookAbbr}.${chapter2}.NIV`;
                                      return `${bookName} <a href="${url1}" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline;">${chapter1}</a>-<a href="${url2}" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline;">${chapter2}</a>`;
                                    }

                                    // Single chapter or verse reference
                                    const formattedRef = reference.replace(/:/g, '.');
                                    const bibleUrl = `https://www.bible.com/bible/111/${bookAbbr}.${formattedRef}.NIV`;
                                    return `<a href="${bibleUrl}" target="_blank" rel="noopener noreferrer" style="color: #007bff; text-decoration: underline;">${match}</a>`;
                                  }

                                  return match;
                                });
                              }

                              return (
                                <div key={`bible-${index}`}>
                                  <div 
                                    className="rich-text-content daily-content prose prose-sm max-w-none"
                                    style={{
                                      wordBreak: 'break-word',
                                      overflowWrap: 'break-word'
                                    }}
                                    dangerouslySetInnerHTML={{ 
                                      __html: content
                                    }} 
                                  />
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}

                      {/* Display workout activity content below Bible verse */}
                      {selectedActivity && (
                        <div className="workout-activity-section">
                          {selectedActivity.contentFields?.map((item: any, index: number) => (
                            <div key={`activity-${index}`}>
                              {item.type === 'text' && (
                                <div>
                                  <div 
                                    className="rich-text-content daily-content prose prose-sm max-w-none"
                                    style={{
                                      wordBreak: 'break-word',
                                      overflowWrap: 'break-word'
                                    }}
                                    dangerouslySetInnerHTML={{ 
                                      __html: (item.content || '')
                                    }} 
                                  />
                                </div>
                              )}
                              {item.type === 'video' && (
                                <div>
                                  <h4 className="text-md font-medium mb-2">{item.title}</h4>
                                  <YouTubePlayer videoId={item.content} />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Show message if only Bible verse exists but no workout */}
                      {selectedBibleVerse && !selectedActivity && (
                        <div className="text-center text-gray-600 mt-4 p-4 bg-muted/30 rounded-lg">
                          <p>
                            No workout activity available for Week {selectedWeek}, Day {selectedDay}.
                            <br />
                            Check with your coach if you think this is an error.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : activityStatus?.programHasStarted === false ? (
                  <div className="text-center mt-4">
                    <h3 className="text-xl font-semibold mb-2">Program Starting Soon</h3>
                    <p className="text-gray-600 mb-4">
                      Your program will start on {activityStatus?.programStartDate ? 
                        new Date(activityStatus.programStartDate).toLocaleDateString() : 'soon'
                      }
                    </p>
                    {activityStatus?.daysToProgramStart && (
                      <p className="text-sm text-gray-500">
                        {activityStatus.daysToProgramStart} days until your program begins
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-gray-600 mt-4">
                    No activity available for Week {selectedWeek}, Day {selectedDay}.
                    <br />
                    Check with your coach if you think this is an error.
                  </p>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Re-engage Section - Hidden for competitive groups */}
        {!competitiveStatus?.competitive && (
          <Collapsible open={reengageOpen} onOpenChange={setReengageOpen} className="mt-6">
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Re-engage</CardTitle>
                    <ChevronDown
                      className={`h-5 w-5 transition-transform ${
                        reengageOpen ? "transform rotate-180" : ""
                      }`}
                    />
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-4">
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>Select a week to restart the program today.</p>
                      <p>(Resetting the current week to a previous week will clear all posts and points for that Week/Day and after.)</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Select Week</label>
                      <Select value={reengageWeek} onValueChange={setReengageWeek}>
                        <SelectTrigger data-testid="select-reengage-week">
                          <SelectValue placeholder="Choose a week" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: activityStatus?.currentWeek || 1 }, (_, i) => i + 1).map((week) => (
                            <SelectItem key={week} value={week.toString()}>
                              Week {week}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button 
                      onClick={handleReengage} 
                      disabled={reengageMutation.isPending || !reengageWeek}
                      className="w-full"
                      data-testid="button-reengage-reset"
                    >
                      {reengageMutation.isPending ? "Resetting..." : "Reset Program"}
                    </Button>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}
      </main>
    </AppLayout>
  );
}