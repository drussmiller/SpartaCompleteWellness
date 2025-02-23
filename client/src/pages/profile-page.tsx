import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Measurement, insertMeasurementSchema } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LogOut, Plus, Scale, Ruler, Camera } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();

  const { data: measurements } = useQuery<Measurement[]>({
    queryKey: ["/api/measurements"],
  });

  const updateProfileImageMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await apiRequest('POST', '/api/user/image', formData);
      if (!res.ok) {
        throw new Error('Failed to update profile picture');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Success",
        description: "Profile picture updated successfully"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const form = useForm({
    resolver: zodResolver(insertMeasurementSchema.omit({ userId: true })),
    defaultValues: {
      weight: undefined,
      waist: undefined,
    },
  });

  const addMeasurementMutation = useMutation({
    mutationFn: async (data: { weight?: number; waist?: number }) => {
      if (!user) throw new Error("Not authenticated");
      const payload = {
        userId: user.id,
        weight: data.weight || null,
        waist: data.waist || null,
        date: new Date()
      };
      const res = await apiRequest("POST", "/api/measurements", payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to add measurement');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/measurements"] });
      form.reset();
      toast({
        title: "Success",
        description: "Measurement added successfully"
      });
    },
    onError: (error: Error) => {
      console.error('Measurement mutation error:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const sortedMeasurements = measurements?.sort(
    (a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime()
  );

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <header className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="p-4">
          <h1 className="text-xl font-bold">Profile</h1>
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

                      const updatedUser = await res.json();
                      queryClient.setQueryData(["/api/user"], updatedUser);
                      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                    } catch (error) {
                      console.error('Error updating profile image:', error);
                    }
                  }}
                />
                <Camera className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold">{user?.username}</h2>
              <p className="text-muted-foreground">{user?.points} points</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Add New Measurements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form 
                onSubmit={form.handleSubmit((data) => {
                  const measurements = {
                    weight: data.weight,
                    waist: data.waist
                  };
                  if (!measurements.weight && !measurements.waist) {
                    toast({
                      title: "Error",
                      description: "Please enter at least one measurement",
                      variant: "destructive"
                    });
                    return;
                  }
                  addMeasurementMutation.mutate(measurements);
                })} 
                className="space-y-4"
              >
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
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
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
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={addMeasurementMutation.isPending}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {addMeasurementMutation.isPending ? "Adding..." : "Add Measurements"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Measurement History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sortedMeasurements && sortedMeasurements.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sortedMeasurements}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date) => new Date(date || '').toLocaleDateString()}
                    />
                    <YAxis 
                      yAxisId="weight"
                      label={{ value: 'Weight (lbs)', angle: -90, position: 'insideLeft' }} 
                    />
                    <YAxis 
                      yAxisId="waist" 
                      orientation="right"
                      label={{ value: 'Waist (inches)', angle: 90, position: 'insideRight' }}
                    />
                    <Tooltip
                      labelFormatter={(date) => new Date(date || '').toLocaleDateString()}
                      formatter={(value, name) => [value, name]}
                    />
                    <Line
                      yAxisId="weight"
                      type="monotone"
                      dataKey="weight"
                      stroke="hsl(var(--primary))"
                      name="Weight (lbs)"
                      dot
                    />
                    <Line
                      yAxisId="waist"
                      type="monotone"
                      dataKey="waist"
                      stroke="hsl(var(--secondary))"
                      name="Waist (inches)"
                      dot
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No measurements recorded yet
              </p>
            )}
          </CardContent>
        </Card>

        <Button 
          variant="destructive" 
          className="w-full" 
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="w-4 h-4 mr-2" />
          {logoutMutation.isPending ? "Logging out..." : "Logout"}
        </Button>
      </main>

      <BottomNav />
    </div>
  );
}