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

  // Query to get user posts for the current week
  const { data: userPosts, isLoading: isLoadingPosts, error: postsError } = useQuery<(Post & { author: User })[]>({
    queryKey: ["/api/posts", user.id, formattedStartDate, formattedEndDate],
    queryFn: async () => {
      console.log(`Fetching posts for user ${user.id} from ${formattedStartDate} to ${formattedEndDate}`);
      // Use the debug endpoint that doesn't require authentication for direct API calls
      const response = await apiRequest(
        "GET", 
        `/api/debug/posts?userId=${user.id}&startDate=${formattedStartDate}&endDate=${formattedEndDate}&type=all`
      );
      if (!response.ok) {
        console.error('Failed to fetch user posts:', await response.text());
        throw new Error('Failed to fetch user posts');
      }
      const data = await response.json();
      console.log(`Received ${data.length} posts for profile charts`);
      return data;
    }
  });
  
  // Log any errors
  if (postsError) {
    console.error('Error fetching user posts:', postsError);
  }

  // Query to get the last 4 weeks of data for trends
  const { data: monthlyPosts, isLoading: isLoadingMonthly, error: monthlyError } = useQuery<(Post & { author: User })[]>({
    queryKey: ["/api/posts/monthly", user.id],
    queryFn: async () => {
      const fourWeeksAgo = subWeeks(startDate, 3).toISOString().split('T')[0];
      console.log(`Fetching monthly posts for user ${user.id} from ${fourWeeksAgo} to ${formattedEndDate}`);
      // Use debug endpoint for API testing
      const response = await apiRequest(
        "GET", 
        `/api/debug/posts?userId=${user.id}&startDate=${fourWeeksAgo}&endDate=${formattedEndDate}&type=all`
      );
      if (!response.ok) {
        console.error('Failed to fetch monthly posts:', await response.text());
        throw new Error('Failed to fetch monthly posts');
      }
      const data = await response.json();
      console.log(`Received ${data.length} posts for monthly trends`);
      return data;
    }
  });
  
  // Log any errors with monthly data
  if (monthlyError) {
    console.error('Error fetching monthly posts:', monthlyError);
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

  // Generate post type distribution data for pie chart
  interface ChartDataPoint {
    name: string;
    value: number;
  }
  
  const postTypeData = useMemo<ChartDataPoint[]>(() => {
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
  }, [userPosts]);

  // Calculate current week's total points
  const currentWeekPoints = useMemo(() => {
    return dailyData.reduce((sum, day) => sum + day.totalPoints, 0);
  }, [dailyData]);

  // Calculate average points per week
  const averageWeeklyPoints = useMemo(() => {
    if (!weeklyData || weeklyData.length === 0) return 0;
    const total = weeklyData.reduce((sum, week) => sum + week.totalPoints, 0);
    return Math.round(total / weeklyData.length);
  }, [weeklyData]);

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