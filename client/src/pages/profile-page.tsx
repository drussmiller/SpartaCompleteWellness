import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Measurement } from "@shared/schema";
import { Loader2 } from "lucide-react";
import { insertMeasurementSchema } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLocation } from "wouter";

export default function ProfilePage() {
  const { user: authUser, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: user, refetch: refetchUser } = useQuery({
    queryKey: ["/api/user"],
    staleTime: 0,
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
      weight: undefined,
      waist: undefined,
    },
  });

  const addMeasurementMutation = useMutation({
    mutationFn: async (data: { weight?: number | null; waist?: number | null }) => {
      // Ensure we're sending at least one measurement
      if (data.weight === undefined && data.waist === undefined) {
        throw new Error("Please enter at least one measurement");
      }

      // Only send fields that have values
      const payload = {
        ...(data.weight !== undefined && { weight: data.weight }),
        ...(data.waist !== undefined && { waist: data.waist })
      };

      console.log('Submitting measurement:', payload);
      const res = await apiRequest("POST", "/api/measurements", payload);

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add measurement");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/measurements"] });
      form.reset();
      toast({
        title: "Success",
        description: "Measurement added successfully",
      });
    },
    onError: (error: Error) => {
      console.error('Error adding measurement:', error);
      toast({
        title: "Unable to Update",
        description: "There was a problem updating your measurements. Please try again.",
        variant: "default",
        className: "bg-orange-100 text-orange-900 border-orange-200",
      });
    },
  });

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="p-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setLocation("/")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">Profile</h1>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
          >
            Refresh Data
          </Button>
        </div>
      </header>
      <main className="p-4 space-y-6">
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
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const formData = new FormData();
                    formData.append('image', file);

                    try {
                      const res = await fetch('/api/user/image', {
                        method: 'POST',
                        body: formData,
                      });

                      if (!res.ok) {
                        throw new Error('Failed to update profile image');
                      }

                      await refetchUser();
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
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold">{user?.username}</h2>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h3 className="text-lg font-semibold mb-4">My Stats</h3>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">Points</p>
              <p className="text-xl font-semibold">{user?.points || 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <h3 className="text-lg font-semibold mb-4">Measurements</h3>

            {/* Add measurement form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => addMeasurementMutation.mutate(data))} className="space-y-4 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="weight"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weight (lbs)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Enter weight" 
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
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
                        <FormLabel>Waist (inches)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Enter waist" 
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" disabled={addMeasurementMutation.isPending}>
                  {addMeasurementMutation.isPending ? "Adding..." : "Add Measurement"}
                </Button>
              </form>
            </Form>

            {/* Existing measurements display */}
            {measurementsLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : measurementsError ? (
              <p className="text-sm text-destructive">Failed to load measurements</p>
            ) : !measurements?.length ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">No measurements recorded yet</p>
                <p className="text-xs text-muted-foreground mt-1">Record your measurements to track your progress</p>
              </div>
            ) : (
              <>
                {/* Measurement Graphs */}
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

                {/* Measurement History List */}
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

        <Button variant="destructive" onClick={handleLogout} disabled={logoutMutation.isPending}>
          {logoutMutation.isPending ? "Logging out..." : "Logout"}
          <LogOut className="ml-2 h-4 w-4"/>
        </Button>
      </main>
    </div>
  );
}