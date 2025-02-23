import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Measurement, insertMeasurementSchema } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BottomNav } from "@/components/bottom-nav";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LogOut, Plus, Scale, Ruler } from "lucide-react";
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

  const form = useForm({
    resolver: zodResolver(insertMeasurementSchema),
    defaultValues: {
      weight: undefined,
      waist: undefined,
    },
  });

  const addMeasurementMutation = useMutation({
    mutationFn: async (data: { weight: number | undefined; waist: number | undefined }) => {
      // Convert the form data to integers
      const payload = {
        weight: data.weight ? parseInt(data.weight.toString()) : undefined,
        waist: data.waist ? parseInt(data.waist.toString()) : undefined
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
        title: "Measurements updated",
        description: "Your measurements have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
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
            <Avatar className="h-20 w-20">
              <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${user?.username}`} />
              <AvatarFallback>{user?.username?.[0].toUpperCase()}</AvatarFallback>
            </Avatar>
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
                onSubmit={form.handleSubmit((data) => 
                  addMeasurementMutation.mutate(data)
                )} 
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
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
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
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
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
                    <YAxis yAxisId="weight" />
                    <YAxis yAxisId="waist" orientation="right" />
                    <Tooltip
                      labelFormatter={(date) => new Date(date || '').toLocaleDateString()}
                      formatter={(value, name) => [
                        value,
                        name === "weight" ? "Weight (lbs)" : "Waist (inches)"
                      ]}
                    />
                    <Line
                      yAxisId="weight"
                      type="monotone"
                      dataKey="weight"
                      stroke="hsl(var(--primary))"
                      name="Weight"
                      dot
                    />
                    <Line
                      yAxisId="waist"
                      type="monotone"
                      dataKey="waist"
                      stroke="hsl(var(--secondary))"
                      name="Waist"
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