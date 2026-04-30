import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Post } from "@shared/schema";
import { PostCard } from "@/components/post-card";
import { CreatePostDialog } from "@/components/create-post-dialog";
import { Loader2, Filter, RefreshCw, ChevronDown, Check, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePostLimits } from "@/hooks/use-post-limits";
import { AppLayout } from "@/components/app-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useIsMobile } from "@/hooks/use-mobile";
import { MessageSlideCard } from "@/components/messaging/message-slide-card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { usePrayerRequests } from "@/hooks/use-prayer-requests";
import { useRestoreScroll } from "@/hooks/use-restore-scroll";
import { useScrollDirection } from "@/hooks/use-scroll-direction";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

type FilterMode = "team" | "all_users" | "new_users" | "specific_team";

const MOBILE_BREAKPOINT = 768;
const PAGE_SIZE = 50;


export default function HomePage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { remaining, counts, refetch: refetchLimits } = usePostLimits();
  const loadingRef = useRef<HTMLDivElement>(null);
  const [_, navigate] = useLocation();
  const [filterMode, setFilterMode] = useState<FilterMode>(() => {
    const saved = sessionStorage.getItem("homePageFilterMode");
    return (saved as FilterMode) || "team";
  });
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(() => {
    const saved = sessionStorage.getItem("homePageSelectedTeamId");
    return saved ? parseInt(saved) : null;
  });
  const [selectedTeamName, setSelectedTeamName] = useState<string>(() => {
    return sessionStorage.getItem("homePageSelectedTeamName") || "";
  });
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [teamSearchOpen, setTeamSearchOpen] = useState(false);

  const canFilterByTeam = !!(user?.isOrganizationAdmin || user?.isGroupAdmin || user?.isAdmin);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    sessionStorage.setItem("homePageFilterMode", filterMode);
  }, [filterMode]);

  useEffect(() => {
    if (selectedTeamId !== null) {
      sessionStorage.setItem("homePageSelectedTeamId", selectedTeamId.toString());
    } else {
      sessionStorage.removeItem("homePageSelectedTeamId");
    }
    sessionStorage.setItem("homePageSelectedTeamName", selectedTeamName);
  }, [selectedTeamId, selectedTeamName]);

  const { data: availableTeams = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/teams/for-filter"],
    queryFn: async () => {
      if (user?.isAdmin) {
        const res = await apiRequest("GET", "/api/teams");
        if (!res.ok) return [];
        return res.json();
      }
      if (user?.isOrganizationAdmin) {
        const res = await apiRequest("GET", "/api/org-admin/teams");
        if (!res.ok) return [];
        return res.json();
      }
      if (user?.isGroupAdmin) {
        const res = await apiRequest("GET", "/api/group-admin/teams");
        if (!res.ok) return [];
        return res.json();
      }
      return [];
    },
    enabled: canFilterByTeam,
    staleTime: 60000,
  });
  
  const { isHeaderVisible, isBottomNavVisible, scrollY } = useScrollDirection({
    scrollContainerRef,
    threshold: 50,
    velocityThreshold: 1.5
  });
  
  const [pullStartY, setPullStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullThreshold = 80;
  
  useRestoreScroll(scrollContainerRef);
  
  useEffect(() => {
    const cacheCleared = localStorage.getItem("postsv2CacheCleared");
    if (!cacheCleared) {
      console.log("[CACHE CLEAR] Removing posts cache to force refetch with thumbnailUrl field");
      queryClient.removeQueries({ queryKey: ["/api/posts"] });
      localStorage.setItem("postsv2CacheCleared", "true");
    }
  }, []);

  useEffect(() => {
    if (user) {
      const lastRefetchTime = localStorage.getItem("lastPostLimitsRefetch");
      const now = Date.now();
      if (!lastRefetchTime || now - parseInt(lastRefetchTime) > 1800000) {
        refetchLimits();
        localStorage.setItem("lastPostLimitsRefetch", now.toString());
      }
    }
  }, [user, refetchLimits]);

  const buildPostsUrl = useCallback((page: number) => {
    if (filterMode === "specific_team" && selectedTeamId && (user?.isAdmin || user?.isOrganizationAdmin || user?.isGroupAdmin)) {
      return `/api/posts?page=${page}&limit=${PAGE_SIZE}&exclude=prayer&specificTeamId=${selectedTeamId}`;
    }
    if (filterMode === "new_users" && (user?.isAdmin || user?.isGroupAdmin || user?.isOrganizationAdmin || user?.isTeamLead)) {
      return `/api/posts?page=${page}&limit=${PAGE_SIZE}&teamlessIntroOnly=true`;
    }
    if (filterMode === "all_users" && user?.isAdmin) {
      return `/api/posts?page=${page}&limit=${PAGE_SIZE}&exclude=prayer&allUsers=true`;
    }
    if (filterMode === "all_users" && user?.isOrganizationAdmin) {
      return `/api/posts?page=${page}&limit=${PAGE_SIZE}&exclude=prayer&orgAllUsers=true`;
    }
    if (filterMode === "all_users" && user?.isGroupAdmin) {
      return `/api/posts?page=${page}&limit=${PAGE_SIZE}&exclude=prayer&groupAllUsers=true`;
    }
    if (filterMode === "all_users" && user?.isTeamLead) {
      return `/api/posts?page=${page}&limit=${PAGE_SIZE}&exclude=prayer&teamOnly=true`;
    }
    if (!user?.teamId && user?.isAdmin) {
      return `/api/posts?page=${page}&limit=${PAGE_SIZE}&exclude=prayer&teamOnly=true`;
    }
    if (!user?.teamId) {
      return `/api/posts?page=${page}&limit=${PAGE_SIZE}&type=introductory_video&userId=${user?.id}`;
    }
    return `/api/posts?page=${page}&limit=${PAGE_SIZE}&exclude=prayer&teamOnly=true`;
  }, [filterMode, selectedTeamId, user]);

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["/api/posts", "v2", user?.teamId, user?.id, filterMode, selectedTeamId] as const,
    queryFn: async ({ pageParam = 1 }) => {
      const url = buildPostsUrl(pageParam as number);
      const response = await apiRequest("GET", url);
      if (!response.ok) {
        throw new Error(`Failed to fetch posts: ${response.status}`);
      }
      const posts = await response.json();
      const filtered = posts.filter((post: any) => post.type !== "prayer");
      return filtered as Post[];
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined;
      return allPages.length + 1;
    },
    enabled: !!user,
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  const allPosts = useMemo(() => {
    if (!data) return [];
    return data.pages.flat();
  }, [data]);

  const handlePostDeleted = useCallback((postId: number) => {
    queryClient.setQueryData(
      ["/api/posts", "v2", user?.teamId, user?.id, filterMode, selectedTeamId],
      (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: Post[]) =>
            page.filter((post) => post.id !== postId)
          ),
        };
      }
    );
  }, [user?.teamId, user?.id, filterMode, selectedTeamId]);

  const rowVirtualizer = useVirtualizer({
    count: allPosts.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 500,
    overscan: 20,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage && !isLoading && allPosts.length > 0) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loadingRef.current) {
      observer.observe(loadingRef.current);
    }

    return () => {
      if (loadingRef.current) {
        observer.unobserve(loadingRef.current);
      }
    };
  }, [hasNextPage, isFetchingNextPage, isLoading, allPosts.length, fetchNextPage]);

  const { markAsViewed, unreadCount: communityBoardCount } = usePrayerRequests();

  const handleCommunityBoardClick = () => {
    markAsViewed();
    navigate("/community-board");
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    if (scrollTop === 0) {
      setPullStartY(e.touches[0].clientY);
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling) return;
    
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    if (scrollTop > 0) {
      setIsPulling(false);
      setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const distance = currentY - pullStartY;
    
    if (distance > 0) {
      const resistedDistance = Math.min(distance * 0.5, pullThreshold * 1.5);
      setPullDistance(resistedDistance);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    
    setIsPulling(false);
    
    if (pullDistance >= pullThreshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await refetch();
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 500);
      }
    } else {
      setPullDistance(0);
    }
  };

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center text-destructive">
            <h2 className="text-xl font-bold mb-2">Error loading posts</h2>
            <p>{error instanceof Error ? error.message : "Unknown error"}</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout 
      isBottomNavVisible={isBottomNavVisible}
      scrollContainerRef={scrollContainerRef}
    >
      <div className="min-h-screen bg-background">
        {/* Border wrapper for desktop */}
        <div className={`${!isMobile ? 'max-w-[1000px] mx-auto px-6 md:px-44 md:pl-56' : 'w-full'}`}>
          <div className={`${!isMobile ? 'border-x border-border min-h-screen' : ''}`}>
            {/* Fixed Header */}
            <div
              className="fixed top-0 z-[50] bg-background"
              style={{
                transform: isHeaderVisible ? "translateY(0)" : "translateY(-100%)",
                transition: "transform 0.3s ease-out",
                pointerEvents: "auto",
                left: !isMobile ? '80px' : '0',
                right: !isMobile ? 'auto' : '0',
                width: !isMobile ? 'calc(100vw - 80px)' : '100%',
              }}
            >
              <div className={`w-full mx-auto ${!isMobile ? 'max-w-[1000px] px-6 md:px-44 md:pl-56' : 'px-4'}`}>
                <div className={`border-b border-border ${!isMobile ? 'border-x px-4' : ''}`}>
              <div className="flex items-center justify-between pt-12">
                <div className="flex-1 flex justify-center">
                  <div className="dark:bg-gray-900 rounded-lg px-4 py-2">
                    <img
                      src="/sparta_circle_red.png"
                      alt="Sparta Complete Wellness Logo"
                      className="w-36 h-auto mx-auto dark:brightness-0 dark:invert"
                      onError={(e) => {
                        console.error("Error loading logo:", e);
                        e.currentTarget.src = "/Spartans_LOGO.png";
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <CreatePostDialog remaining={remaining} initialType="food" />
                    {user?.teamId && <MessageSlideCard />}
                  </div>
                  {/* Admin/Org Admin/Group Admin/Team Lead filter popup */}
                  {(user?.isAdmin || user?.isOrganizationAdmin || user?.isGroupAdmin || user?.isTeamLead) && (
                    <Popover open={filterPopoverOpen} onOpenChange={(open) => { setFilterPopoverOpen(open); if (!open) setTeamSearchOpen(false); }}>
                      <PopoverTrigger asChild>
                        <Button
                          variant={filterMode !== "team" ? "default" : "outline"}
                          size="sm"
                          className="text-xs h-7 max-w-[160px]"
                          data-testid="button-filter-posts"
                        >
                          <Filter className="h-3 w-3 mr-1 shrink-0" />
                          <span className="truncate">
                            {filterMode === "team" ? "Team" : filterMode === "all_users" ? "All Users" : filterMode === "new_users" ? "New Users" : selectedTeamName || "Select Team"}
                          </span>
                          <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-60 p-3" align="end">
                        <RadioGroup
                          value={filterMode === "specific_team" ? "specific_team" : filterMode}
                          onValueChange={(value: string) => {
                            if (value !== "specific_team") {
                              setFilterMode(value as FilterMode);
                              setTeamSearchOpen(false);
                              setFilterPopoverOpen(false);
                            } else {
                              setTeamSearchOpen(true);
                            }
                          }}
                          className="space-y-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="team" id="filter-team" data-testid="radio-filter-team" />
                            <Label htmlFor="filter-team" className="text-sm cursor-pointer">My Team</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="all_users" id="filter-all-users" data-testid="radio-filter-all-users" />
                            <Label htmlFor="filter-all-users" className="text-sm cursor-pointer">All Users</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="new_users" id="filter-new-users" data-testid="radio-filter-new-users" />
                            <Label htmlFor="filter-new-users" className="text-sm cursor-pointer">New Users</Label>
                          </div>
                          {canFilterByTeam && (
                            <>
                              <Separator className="my-1" />
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="specific_team" id="filter-specific-team" />
                                <Label htmlFor="filter-specific-team" className="text-sm cursor-pointer flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  Select a Team
                                </Label>
                              </div>
                            </>
                          )}
                        </RadioGroup>

                        {/* Team search - shown when "Select a Team" is chosen */}
                        {canFilterByTeam && (filterMode === "specific_team" || teamSearchOpen) && (
                          <div className="mt-3">
                            <Command className="border rounded-md">
                              <CommandInput placeholder="Search teams..." className="h-8 text-sm" />
                              <CommandList className="max-h-48">
                                <CommandEmpty>No teams found.</CommandEmpty>
                                <CommandGroup>
                                  {[...availableTeams].sort((a, b) => a.name.localeCompare(b.name)).map((team) => (
                                    <CommandItem
                                      key={team.id}
                                      value={team.name}
                                      onSelect={() => {
                                        setSelectedTeamId(team.id);
                                        setSelectedTeamName(team.name);
                                        setFilterMode("specific_team");
                                        setTeamSearchOpen(false);
                                        setFilterPopoverOpen(false);
                                      }}
                                      className="text-sm cursor-pointer"
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-3 w-3 shrink-0",
                                          selectedTeamId === team.id ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {team.name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex justify-between mt-1 mb-2 px-6">
                <Button
                  variant="default"
                  className="flex-1 mr-2 bg-violet-700 text-white hover:bg-violet-800 h-10 text-sm font-medium"
                >
                  Team
                </Button>
                <Button
                  variant="outline"
                  className={`flex-1 ml-2 h-10 text-sm font-medium ${!user?.teamId ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={!user?.teamId}
                  onClick={handleCommunityBoardClick}
                >
                  <div className="relative">
                    Community Board
                    {user?.teamId && communityBoardCount > 0 && (
                      <div className="absolute -top-2 -right-8 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {communityBoardCount > 99 ? "99+" : communityBoardCount}
                      </div>
                    )}
                  </div>
                </Button>
              </div>
            </div>
          </div>
        </div>

            {/* Main content layout */}
            <div
              className={!isMobile ? "pt-32" : ""}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Pull-to-refresh indicator */}
              <div 
                className="fixed top-0 left-0 right-0 flex justify-center items-center z-40 pointer-events-none"
                style={{
                  transform: `translateY(${Math.min(pullDistance - 20, 60)}px)`,
                  opacity: pullDistance > 20 ? Math.min(pullDistance / pullThreshold, 1) : 0,
                  transition: isPulling ? 'none' : 'all 0.3s ease-out',
                }}
              >
                <div className="bg-background rounded-full p-3 shadow-lg border border-border">
                  <RefreshCw 
                    className={`h-5 w-5 text-primary ${isRefreshing || pullDistance >= pullThreshold ? 'animate-spin' : ''}`}
                    data-testid="icon-refresh"
                  />
                </div>
              </div>

              <main className="p-4">
            {/* Header */}
            <div className="mb-6">
              <div style={{ height: "75px" }}></div>
            </div>

              <div>
                {allPosts?.length > 0 ? (
                  <div
                    style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                      const post = allPosts[virtualItem.index];
                      return (
                        <div
                          key={post.id}
                          data-index={virtualItem.index}
                          ref={rowVirtualizer.measureElement}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                        >
                          <div className="pb-2">
                            <ErrorBoundary>
                              <PostCard post={post} onPostUpdated={() => refetch()} onPostDeleted={handlePostDeleted} />
                            </ErrorBoundary>
                            {virtualItem.index < allPosts.length - 1 && (
                              <div className="h-[6px] bg-border mt-2 -mx-4" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : !isLoading ? (
                  <div className="text-center text-muted-foreground py-8">
                    {!user?.teamId ? (
                      <div>
                        <p className="text-lg font-medium mb-2">Welcome to Sparta Complete Wellness!</p>
                        <p className="text-sm">Post your introductory video to let others get to know you.</p>
                        <p className="text-sm mt-2">Once you join a team, your video will appear on the team page!</p>
                      </div>
                    ) : (
                      "No posts yet. Be the first to share!"
                    )}
                  </div>
                ) : null}

                {/* Infinite scroll trigger + loading indicator */}
                <div ref={loadingRef} className="flex justify-center py-4">
                  {(isLoading || isFetchingNextPage) && <Loader2 className="h-8 w-8 animate-spin" />}
                </div>
              </div>
              </main>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
