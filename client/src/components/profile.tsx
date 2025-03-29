import React, { useState, useMemo } from 'react';
import { User, Team, Post } from '@shared/schema';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProfileProps {
  user: User;
}

// Define point values for different post types
const POST_POINT_VALUES = {
  food: 3,
  workout: 3,
  scripture: 3,
  memory_verse: 10,
  miscellaneous: 2
};

// Custom colors for the charts
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A569BD'];

function UserProfile({ user }: ProfileProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTab, setSelectedTab] = useState('daily');
  
  // Calculate the current week's start and end dates
  const startDate = startOfWeek(currentDate, { weekStartsOn: 0 }); // Start on Sunday
  const endDate = endOfWeek(currentDate, { weekStartsOn: 0 });
  
  // Format dates for API requests
  const formattedStartDate = startDate.toISOString().split('T')[0];
  const formattedEndDate = endDate.toISOString().split('T')[0];

  // Query to get user profile info (teams)
  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  // Generate post type distribution data for pie chart
  interface ChartDataPoint {
    name: string;
    value: number;
  }
  
  // Query for post type distribution (pie chart)
  const { data: serverPostTypeData, isLoading: isLoadingPostTypes, error: postTypesError } = useQuery<ChartDataPoint[]>({
    queryKey: ["/api/debug/posts/type-distribution", user.id, formattedStartDate, formattedEndDate],
    queryFn: async () => {
      console.log(`Fetching post type distribution for user ${user.id} from ${formattedStartDate} to ${formattedEndDate}`);
      const response = await apiRequest(
        "GET", 
        `/api/debug/posts/type-distribution?userId=${user.id}&startDate=${formattedStartDate}&endDate=${formattedEndDate}`
      );
      if (!response.ok) {
        console.error('Failed to fetch post type distribution:', await response.text());
        throw new Error('Failed to fetch post type distribution');
      }
      const data = await response.json();
      console.log(`Received post type distribution data:`, data);
      return data;
    }
  });
  
  // Query to get weekly stats and aggregated data
  const { data: weeklyStatsData, isLoading: isLoadingWeeklyStats, error: weeklyStatsError } = useQuery({
    queryKey: ["/api/debug/posts/weekly-stats", user.id, formattedStartDate, formattedEndDate],
    queryFn: async () => {
      const fourWeeksAgo = subWeeks(startDate, 3).toISOString().split('T')[0];
      console.log(`Fetching weekly stats for user ${user.id} from ${fourWeeksAgo} to ${formattedEndDate}`);
      const response = await apiRequest(
        "GET", 
        `/api/debug/posts/weekly-stats?userId=${user.id}&startDate=${fourWeeksAgo}&endDate=${formattedEndDate}`
      );
      if (!response.ok) {
        console.error('Failed to fetch weekly stats:', await response.text());
        throw new Error('Failed to fetch weekly stats');
      }
      const data = await response.json();
      console.log(`Received weekly stats data:`, data);
      return data;
    }
  });
  
  // For backward compatibility with the rest of the component
  // We still need userPosts and monthlyPosts for some calculations
  // When we have weekly stats, we can derive some data from it
  const userPosts = useMemo(() => {
    if (!weeklyStatsData || !weeklyStatsData.weeklyStats) return [];
    
    // Filter down to just the current week's data if needed
    const currentWeekStats = weeklyStatsData.weeklyStats.filter(week => {
      const weekDate = new Date(week.week_label);
      return weekDate >= startDate && weekDate <= endDate;
    });
    
    // Create synthetic post data with just enough info for the charts
    const posts: (Post & { author: User })[] = [];
    
    currentWeekStats.forEach(week => {
      // Add food posts
      for (let i = 0; i < parseInt(week.food_points) / POST_POINT_VALUES.food; i++) {
        posts.push({
          id: 0, // ID doesn't matter for our analysis
          type: 'food',
          points: POST_POINT_VALUES.food,
          createdAt: week.week_label,
          author: user,
          userId: user.id
        } as Post & { author: User });
      }
      
      // Add workout posts
      for (let i = 0; i < parseInt(week.workout_points) / POST_POINT_VALUES.workout; i++) {
        posts.push({
          id: 0,
          type: 'workout',
          points: POST_POINT_VALUES.workout,
          createdAt: week.week_label,
          author: user,
          userId: user.id
        } as Post & { author: User });
      }
      
      // Add scripture posts
      for (let i = 0; i < parseInt(week.scripture_points) / POST_POINT_VALUES.scripture; i++) {
        posts.push({
          id: 0,
          type: 'scripture',
          points: POST_POINT_VALUES.scripture,
          createdAt: week.week_label,
          author: user,
          userId: user.id
        } as Post & { author: User });
      }
      
      // Add memory verse posts
      for (let i = 0; i < parseInt(week.memory_verse_points) / POST_POINT_VALUES.memory_verse; i++) {
        posts.push({
          id: 0,
          type: 'memory_verse',
          points: POST_POINT_VALUES.memory_verse,
          createdAt: week.week_label,
          author: user,
          userId: user.id
        } as Post & { author: User });
      }
      
      // Add miscellaneous posts
      for (let i = 0; i < parseInt(week.misc_points) / POST_POINT_VALUES.miscellaneous; i++) {
        posts.push({
          id: 0,
          type: 'miscellaneous',
          points: POST_POINT_VALUES.miscellaneous,
          createdAt: week.week_label,
          author: user,
          userId: user.id
        } as Post & { author: User });
      }
    });
    
    return posts;
  }, [weeklyStatsData, startDate, endDate, user]);
  
  // Use week stats data for monthly posts
  const monthlyPosts = useMemo(() => {
    if (!weeklyStatsData || !weeklyStatsData.weeklyStats) return [];
    
    // Create synthetic post data with just enough info for the charts
    const posts: (Post & { author: User })[] = [];
    
    weeklyStatsData.weeklyStats.forEach(week => {
      // Add food posts
      for (let i = 0; i < parseInt(week.food_points) / POST_POINT_VALUES.food; i++) {
        posts.push({
          id: 0,
          type: 'food',
          points: POST_POINT_VALUES.food,
          createdAt: week.week_label,
          author: user,
          userId: user.id
        } as Post & { author: User });
      }
      
      // Add workout posts
      for (let i = 0; i < parseInt(week.workout_points) / POST_POINT_VALUES.workout; i++) {
        posts.push({
          id: 0,
          type: 'workout',
          points: POST_POINT_VALUES.workout,
          createdAt: week.week_label,
          author: user,
          userId: user.id
        } as Post & { author: User });
      }
      
      // Add scripture posts
      for (let i = 0; i < parseInt(week.scripture_points) / POST_POINT_VALUES.scripture; i++) {
        posts.push({
          id: 0,
          type: 'scripture',
          points: POST_POINT_VALUES.scripture,
          createdAt: week.week_label,
          author: user,
          userId: user.id
        } as Post & { author: User });
      }
      
      // Add memory verse posts
      for (let i = 0; i < parseInt(week.memory_verse_points) / POST_POINT_VALUES.memory_verse; i++) {
        posts.push({
          id: 0,
          type: 'memory_verse',
          points: POST_POINT_VALUES.memory_verse,
          createdAt: week.week_label,
          author: user,
          userId: user.id
        } as Post & { author: User });
      }
      
      // Add miscellaneous posts
      for (let i = 0; i < parseInt(week.misc_points) / POST_POINT_VALUES.miscellaneous; i++) {
        posts.push({
          id: 0,
          type: 'miscellaneous',
          points: POST_POINT_VALUES.miscellaneous,
          createdAt: week.week_label,
          author: user,
          userId: user.id
        } as Post & { author: User });
      }
    });
    
    return posts;
  }, [weeklyStatsData, user]);
  
  // Calculate loading state for backwards compatibility
  const isLoadingPosts = isLoadingWeeklyStats;
  const isLoadingMonthly = isLoadingWeeklyStats;
  
  // Log any errors
  if (weeklyStatsError) {
    console.error('Error fetching weekly stats:', weeklyStatsError);
  }
  
  if (postTypesError) {
    console.error('Error fetching post type distribution:', postTypesError);
  }

  const userTeam = teams?.find(t => t.id === user.teamId);

  // Generate daily data for the selected week
  const dailyData = useMemo(() => {
    if (!userPosts) return [];
    
    // Create an array of all days in the current week
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    
    // Map each day to a data object
    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayPosts = userPosts.filter(post => {
        const postDate = new Date(post.createdAt || '');
        return format(postDate, 'yyyy-MM-dd') === dateStr;
      });
      
      // Count posts by type
      const foodCount = dayPosts.filter(post => post.type === 'food').length;
      const workoutCount = dayPosts.filter(post => post.type === 'workout').length;
      const scriptureCount = dayPosts.filter(post => post.type === 'scripture').length;
      const memoryVerseCount = dayPosts.filter(post => post.type === 'memory_verse').length;
      const miscCount = dayPosts.filter(post => post.type === 'miscellaneous').length;
      
      // Calculate points by type
      const foodPoints = foodCount * POST_POINT_VALUES.food;
      const workoutPoints = workoutCount * POST_POINT_VALUES.workout;
      const scripturePoints = scriptureCount * POST_POINT_VALUES.scripture;
      const memoryVersePoints = memoryVerseCount * POST_POINT_VALUES.memory_verse;
      const miscPoints = miscCount * POST_POINT_VALUES.miscellaneous;
      
      // Calculate total points for the day
      const totalPoints = foodPoints + workoutPoints + scripturePoints + memoryVersePoints + miscPoints;
      
      return {
        day: format(day, 'EEE'),
        date: dateStr,
        foodPoints,
        workoutPoints,
        scripturePoints,
        memoryVersePoints,
        miscPoints,
        totalPoints
      };
    });
  }, [userPosts, startDate, endDate]);

  // Generate weekly data for trend analysis
  const weeklyData = useMemo(() => {
    if (!monthlyPosts) return [];
    
    // Create weekly intervals
    const weeks = [];
    for (let i = 0; i < 4; i++) {
      const weekStart = subWeeks(startDate, i);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });
      weeks.push({
        start: weekStart,
        end: weekEnd,
        label: `Week ${4-i}`
      });
    }
    
    // Map each week to a data object
    return weeks.map(week => {
      const weekPosts = monthlyPosts.filter(post => {
        const postDate = new Date(post.createdAt || '');
        return postDate >= week.start && postDate <= week.end;
      });
      
      // Count posts by type
      const foodCount = weekPosts.filter(post => post.type === 'food').length;
      const workoutCount = weekPosts.filter(post => post.type === 'workout').length;
      const scriptureCount = weekPosts.filter(post => post.type === 'scripture').length;
      const memoryVerseCount = weekPosts.filter(post => post.type === 'memory_verse').length;
      const miscCount = weekPosts.filter(post => post.type === 'miscellaneous').length;
      
      // Calculate points by type
      const foodPoints = foodCount * POST_POINT_VALUES.food;
      const workoutPoints = workoutCount * POST_POINT_VALUES.workout;
      const scripturePoints = scriptureCount * POST_POINT_VALUES.scripture;
      const memoryVersePoints = memoryVerseCount * POST_POINT_VALUES.memory_verse;
      const miscPoints = miscCount * POST_POINT_VALUES.miscellaneous;
      
      // Calculate total points for the week
      const totalPoints = foodPoints + workoutPoints + scripturePoints + memoryVersePoints + miscPoints;
      
      return {
        week: week.label,
        range: `${format(week.start, 'MM/dd')} - ${format(week.end, 'MM/dd')}`,
        foodPoints,
        workoutPoints,
        scripturePoints,
        memoryVersePoints,
        miscPoints,
        totalPoints
      };
    });
  }, [monthlyPosts, startDate]);

  // Use server type distribution data when available, or calculate from userPosts as fallback
  const postTypeData = useMemo<ChartDataPoint[]>(() => {
    // First try to use server data
    if (serverPostTypeData && serverPostTypeData.length > 0) {
      return serverPostTypeData;
    }
    
    // Fall back to calculating from userPosts
    if (!userPosts) return [];
    
    const foodCount = userPosts.filter(post => post.type === 'food').length;
    const workoutCount = userPosts.filter(post => post.type === 'workout').length;
    const scriptureCount = userPosts.filter(post => post.type === 'scripture').length;
    const memoryVerseCount = userPosts.filter(post => post.type === 'memory_verse').length;
    const miscCount = userPosts.filter(post => post.type === 'miscellaneous').length;
    
    return [
      { name: 'Food', value: foodCount },
      { name: 'Workout', value: workoutCount },
      { name: 'Scripture', value: scriptureCount },
      { name: 'Memory Verse', value: memoryVerseCount },
      { name: 'Miscellaneous', value: miscCount }
    ].filter(item => item.value > 0);
  }, [serverPostTypeData, userPosts]);

  // Calculate current week's total points - use server-calculated data when available
  const currentWeekPoints = useMemo(() => {
    // If we have the weekly stats data from the server, use it
    if (weeklyStatsData && weeklyStatsData.weeklyStats && weeklyStatsData.weeklyStats.length > 0) {
      // Find the current week (should be the first week in the array as it's sorted DESC)
      const currentWeekStat = weeklyStatsData.weeklyStats[0];
      if (currentWeekStat) {
        return parseInt(currentWeekStat.total_points);
      }
    }
    // Fallback to client-side calculation
    return dailyData.reduce((sum, day) => sum + day.totalPoints, 0);
  }, [weeklyStatsData, dailyData]);

  // Use server-calculated average when available
  const averageWeeklyPoints = useMemo(() => {
    if (weeklyStatsData && typeof weeklyStatsData.averageWeeklyPoints === 'number') {
      return weeklyStatsData.averageWeeklyPoints;
    }
    // Fallback to client-side calculation
    if (!weeklyData || weeklyData.length === 0) return 0;
    const total = weeklyData.reduce((sum, week) => sum + week.totalPoints, 0);
    return Math.round(total / weeklyData.length);
  }, [weeklyStatsData, weeklyData]);

  // Handle week navigation
  const goToPreviousWeek = () => {
    setCurrentDate(prevDate => subWeeks(prevDate, 1));
  };
  
  const goToNextWeek = () => {
    const nextWeek = addWeeks(currentDate, 1);
    if (nextWeek <= new Date()) {
      setCurrentDate(nextWeek);
    }
  };

  // Check if we can go to next week (shouldn't go to future weeks)
  const canGoToNextWeek = useMemo(() => {
    const nextWeek = addWeeks(currentDate, 1);
    return nextWeek <= new Date();
  }, [currentDate]);

  return (
    <div className="space-y-6 pt-4 pb-8 px-2"> {/* Added padding here */}
      <div className="flex flex-col space-y-2">
        <div className="text-sm text-muted-foreground">Email</div>
        <div className="text-sm font-medium">{user.email}</div>
      </div>

      <div className="flex flex-col space-y-2">
        <div className="text-sm text-muted-foreground">Team</div>
        <div className="text-sm font-medium">
          {userTeam?.name || 'No Team Assigned'}
        </div>
      </div>

      {/* Points Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Current Week</CardTitle>
            <CardDescription>Total points earned this week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{currentWeekPoints}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Weekly Average</CardTitle>
            <CardDescription>Average points per week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{averageWeeklyPoints}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Post Types</CardTitle>
            <CardDescription>Distribution by category</CardDescription>
          </CardHeader>
          <CardContent className="h-32">
            {postTypeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={postTypeData}
                    cx="50%"
                    cy="50%"
                    outerRadius={50}
                    fill="#8884d8"
                    dataKey="value"
                    label={({name}: {name: string}) => name}
                  >
                    {postTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No posts this week
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Points Analytics</CardTitle>
            {selectedTab === 'daily' && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={goToPreviousWeek}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {format(startDate, 'MMM d')} - {format(endDate, 'MMM d, yyyy')}
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={goToNextWeek} 
                  disabled={!canGoToNextWeek}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="daily" onValueChange={setSelectedTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly Trend</TabsTrigger>
              <TabsTrigger value="by-type">By Post Type</TabsTrigger>
            </TabsList>
            
            <TabsContent value="daily" className="h-80">
              {isLoadingPosts ? (
                <div className="h-full flex items-center justify-center">Loading data...</div>
              ) : dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dailyData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="totalPoints" name="Total Points" fill="#8884d8" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available for this period
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="weekly" className="h-80">
              {isLoadingMonthly ? (
                <div className="h-full flex items-center justify-center">Loading data...</div>
              ) : weeklyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={weeklyData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="totalPoints" 
                      name="Total Points" 
                      stroke="#8884d8" 
                      activeDot={{ r: 8 }} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available for this period
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="by-type" className="h-80">
              {isLoadingPosts ? (
                <div className="h-full flex items-center justify-center">Loading data...</div>
              ) : dailyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dailyData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="foodPoints" name="Food" fill="#0088FE" stackId="a" />
                    <Bar dataKey="workoutPoints" name="Workout" fill="#00C49F" stackId="a" />
                    <Bar dataKey="scripturePoints" name="Scripture" fill="#FFBB28" stackId="a" />
                    <Bar dataKey="memoryVersePoints" name="Memory Verse" fill="#FF8042" stackId="a" />
                    <Bar dataKey="miscPoints" name="Miscellaneous" fill="#A569BD" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No data available for this period
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default UserProfile;