import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut, ChevronLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Measurement } from "@shared/schema";
import { Loader2 } from "lucide-react";
import ChangePasswordForm from "@/components/change-password-form";
import { insertMeasurementSchema } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLocation } from "wouter";
import { format } from "date-fns";
import { BottomNav } from "@/components/bottom-nav";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";

interface ProfilePageProps {
  onClose?: () => void;
}

export default function ProfilePage({ onClose }: ProfilePageProps) {
  const { user: authUser, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [uploading, setUploading] = useState(false);

  // Add swipe to close functionality
  useSwipeToClose({
    onClose: () => {
      if (onClose) {
        onClose();
      } else {
        setLocation(-1);
      }
    },
    enabled: true
  });

  const { data: user, refetch: refetchUser } = useQuery({
    queryKey: ["/api/user"],
    staleTime: 0,
    enabled: !!authUser,
  });
  
  // Add user stats query with timezone offset
  const tzOffset = new Date().getTimezoneOffset();
  const { data: userStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/user/stats", tzOffset],
    queryFn: async () => {
      const response = await fetch(`/api/user/stats?tzOffset=${tzOffset}`);
      if (!response.ok) throw new Error('Failed to fetch user stats');
      return response.json();
    },
    staleTime: 60000, // 1 minute
    enabled: !!authUser,
  });

  // Add measurements query
  const { data: measurements, isLoading: measurementsLoading, error: measurementsError } = useQuery<Measurement[]>({
    queryKey: ["/api/measurements", user?.id],
    queryFn: async () => {
      const response = await fetch(`/api/measurements?userId=${user?.id}`);
      if (!response.ok) throw new Error('Failed to fetch measurements');
      return response.json();
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    console.log('Profile page user data updated:', user);
  }, [user]);

  useEffect(() => {
    console.log('Refetching user data');
    refetchUser();
  }, [refetchUser]);

  const handleRefresh = async () => {
    console.log('Manual refresh requested');
    await refetchUser();
    toast({
      title: "Refreshed",
      description: "Profile data has been refreshed"
    });
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Add measurement form
  const form = useForm({
    resolver: zodResolver(insertMeasurementSchema.omit({ userId: true, date: true })),
    defaultValues: {
      weight: '',
      waist: '',
    },
  });

  const addMeasurementMutation = useMutation({
    mutationFn: async (data: { weight?: number | null; waist?: number | null }) => {
      // Ensure we're sending at least one measurement
      if ((data.weight === undefined || data.weight === null || data.weight === '') &&
        (data.waist === undefined || data.waist === null || data.waist === '')) {
        throw new Error("Please enter at least one measurement");
      }

      // Only send fields that have valid values
      const payload = {
        userId: user?.id,
        ...(data.weight && data.weight !== '' && { weight: parseInt(String(data.weight)) }),
        ...(data.waist && data.waist !== '' && { waist: parseInt(String(data.waist)) })
      };

      console.log('Submitting measurement:', payload);

      const res = await apiRequest("POST", "/api/measurements", payload);

      if (!res.ok) {
        const text = await res.text();
        let errorMessage = "Failed to add measurement";

        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          console.error('Error parsing error response:', parseError, text);
        }

        throw new Error(errorMessage);
      }

      try {
        return await res.json();
      } catch (parseError) {
        console.error('Error parsing success response:', parseError);
        throw new Error("Invalid response from server");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/measurements"] });
      form.reset();
      toast({
        title: "Success",
        description: "Measurement added successfully",
      });
    },
    onError: (error: any) => {
      console.error('Error adding measurement:', error);
      toast({
        title: "Unable to Update",
        description: error.message || "There was a problem updating your measurements. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex flex-col h-screen">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border pt-12">
        <div className="p-4 flex items-center">
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="mr-2 scale-125"
            >
              <ChevronLeft className="h-10 w-10 scale-125" />
            </Button>
          )}
          <h1 className="text-xl font-bold">Profile</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pt-24 md:pt-16 pb-80 px-4 space-y-6 max-w-4xl mx-auto w-full">
        <div className="hidden md:block lg:w-64">
          <BottomNav orientation="vertical" />
        </div>
        <div className="flex-1 space-y-4">
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage
                    src={user?.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${user?.username}`}
                    alt={user?.username}
                  />
                  <AvatarFallback>{user?.username?.[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/50 rounded-full">
                  <Input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    disabled={uploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      const formData = new FormData();
                      formData.append('image', file);

                      try {
                        setUploading(true);
                        const res = await fetch('/api/user/image', {
                          method: 'POST',
                          body: formData,
                        });

                        if (!res.ok) {
                          throw new Error('Failed to update profile image');
                        }

                        await refetchUser();
                        // Invalidate all queries to ensure profile image is updated everywhere
                        await queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
                        await queryClient.invalidateQueries({ queryKey: ["/api/posts/comments"] });

                        // Clear the entire cache to make sure everything refreshes
                        queryClient.clear();

                        // Force refresh the home page data
                        await queryClient.refetchQueries({ queryKey: ["/api/posts"] });

                        toast({
                          title: "Success",
                          description: "Profile image updated successfully"
                        });
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Failed to update profile image",
                          variant: "destructive"
                        });
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  ) : (
                    <div className="text-center text-white text-xs">
                      <p>Click to</p>
                      <p>Upload Photo</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-semibold">{user?.username}</h2>
                <p className="text-lg text-muted-foreground">{user?.email}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3 className="text-xl font-semibold mb-4">Program Details</h3>
              <div className="space-y-3">
                {user?.teamId ? (
                  <>
                    {user.programStart ? (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-lg text-muted-foreground">Program Start (Day One)</span>
                          <span className="text-sm font-medium">
                            {format(new Date(user.programStart), 'PPP')}
                          </span>
                        </div>
                        {user.weekInfo && (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="text-lg text-muted-foreground">Current Week</span>
                              <span className="text-lg font-medium">Week {user.weekInfo.week}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-lg text-muted-foreground">Current Day</span>
                              <span className="text-lg font-medium">Day {user.weekInfo.day}</span>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <p className="text-lg text-muted-foreground">
                        Your program will start on the first Monday after joining a team
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-lg text-muted-foreground">
                    Join a team to start your program
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3 className="text-lg font-semibold mb-4">My Stats</h3>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center">
                  <div className="text-base text-muted-foreground">Daily Total</div>
                  <div className="text-2xl font-bold">
                    {statsLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    ) : (
                      userStats?.dailyPoints || 0
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col items-center">
                  <div className="text-base text-muted-foreground">Week Total</div>
                  <div className="text-2xl font-bold">
                    {statsLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    ) : (
                      userStats?.weeklyPoints || 0
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col items-center">
                  <div className="text-base text-muted-foreground">Monthly Avg</div>
                  <div className="text-2xl font-bold">
                    {statsLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    ) : (
                      userStats?.monthlyAvgPoints || 0
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3 className="text-lg font-semibold mb-4">Measurements</h3>

              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => addMeasurementMutation.mutate(data))} className="space-y-4 mb-6">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="weight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg">Weight (lbs)</FormLabel>
                          <FormControl>
                            <Input
                              className="text-base"
                              type="number"
                              placeholder="Enter weight"
                              value={field.value || ''}
                              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : '')}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="waist"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg">Waist (inches)</FormLabel>
                          <FormControl>
                            <Input
                              className="text-base"
                              type="number"
                              placeholder="Enter waist"
                              value={field.value || ''}
                              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : '')}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={addMeasurementMutation.isPending}
                    className="bg-violet-700 text-white hover:bg-violet-800"
                  >
                    {addMeasurementMutation.isPending ? "Adding..." : "Add Measurement"}
                  </Button>
                </form>
              </Form>

              {measurementsLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : measurementsError ? (
                <p className="text-sm text-destructive">Failed to load measurements</p>
              ) : !measurements?.length ? (
                <div className="text-center py-6">
                  <p className="text-base text-muted-foreground">No measurements recorded yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Record your measurements to track your progress</p>
                </div>
              ) : (
                <>
                  <div className="space-y-6 mb-6">
                    <div className="h-[300px]">
                      <h4 className="text-sm font-medium mb-4">Weight Progress</h4>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={measurements
                            .filter(m => m.weight !== null)
                            .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
                          }
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(date) => new Date(date).toLocaleDateString()}
                          />
                          <YAxis unit=" lbs" domain={['auto', 'auto']} />
                          <Tooltip
                            labelFormatter={(date) => new Date(date).toLocaleDateString()}
                            formatter={(value) => [`${value} lbs`, 'Weight']}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="weight" stroke="#2563eb" name="Weight" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="h-[300px]">
                      <h4 className="text-sm font-medium mb-4">Waist Progress</h4>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={measurements
                            .filter(m => m.waist !== null)
                            .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime())
                          }
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(date) => new Date(date).toLocaleDateString()}
                          />
                          <YAxis unit=" in" domain={['auto', 'auto']} />
                          <Tooltip
                            labelFormatter={(date) => new Date(date).toLocaleDateString()}
                            formatter={(value) => [`${value} inches`, 'Waist']}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="waist" stroke="#16a34a" name="Waist" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {measurements.map((measurement) => (
                      <div key={measurement.id} className="p-4 rounded-lg bg-muted/50">
                        <div className="space-y-2">
                          {measurement.weight !== null && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">Weight</span>
                              <span className="text-sm font-medium">{measurement.weight} lbs</span>
                            </div>
                          )}
                          {measurement.waist !== null && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">Waist</span>
                              <span className="text-sm font-medium">{measurement.waist} inches</span>
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                            {measurement.date ? new Date(measurement.date).toLocaleDateString() : 'Date not recorded'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3 className="text-lg font-semibold mb-4">Account Security</h3>
              <div className="mb-4">
                {/* Import and render the change password form */}
                <ChangePasswordForm />
              </div>
            </CardContent>
          </Card>

          <Button variant="destructive" onClick={handleLogout} disabled={logoutMutation.isPending}>
            {logoutMutation.isPending ? "Logging out..." : "Logout"}
            <LogOut className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 lg:left-16 right-0 z-50 bg-background">
        <BottomNav />
      </div>
    </div>
  );
}