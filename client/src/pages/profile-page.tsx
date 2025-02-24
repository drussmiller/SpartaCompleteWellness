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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogOut, Plus, Scale, Ruler, Camera, Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { z } from "zod";

// Add password change schema
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

export default function ProfilePage() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

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
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const chartData = sortedMeasurements?.map(m => ({
    date: new Date(m.date).toLocaleDateString(),
    weight: m.weight,
    waist: m.waist
  }));

  console.log('Chart Data:', chartData);

  const changePasswordForm = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: Omit<ChangePasswordForm, "confirmPassword">) => {
      const res = await apiRequest("POST", "/api/user/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to change password");
      }
      return res;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Password changed successfully",
      });
      setChangePasswordOpen(false);
      changePasswordForm.reset();
    },
    onError: (error: Error) => {
      console.error('Password change error:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

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
              {user?.teamName && (
                <div className="mt-1">Team: {user?.teamName}</div>
              )}
            </div>
          </CardContent>
          <CardContent className="pt-0">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setChangePasswordOpen(true)}
            >
              <Lock className="w-4 h-4 mr-2" />
              Change Password
            </Button>
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
              <Scale className="h-5 w-5" />
              Weight History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData && chartData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis
                      domain={[
                        (dataMin: number) => Math.floor((dataMin || 0) - 10),
                        (dataMax: number) => Math.ceil((dataMax || 0) + 10)
                      ]}
                      label={{ value: 'Weight (lbs)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip
                      formatter={(value: number) => `${value} lbs`}
                    />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="hsl(var(--primary))"
                      name="Weight"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No weight measurements recorded yet
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5" />
              Waist History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData && chartData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis
                      domain={[
                        (dataMin: number) => Math.floor((dataMin || 0) - 2),
                        (dataMax: number) => Math.ceil((dataMax || 0) + 2)
                      ]}
                      label={{ value: 'Waist (inches)', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip
                      formatter={(value: number) => `${value} inches`}
                    />
                    <Line
                      type="monotone"
                      dataKey="waist"
                      stroke="hsl(var(--secondary))"
                      name="Waist"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No waist measurements recorded yet
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

      <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <Form {...changePasswordForm}>
            <form
              onSubmit={changePasswordForm.handleSubmit((data) => {
                const { confirmPassword, ...rest } = data;
                changePasswordMutation.mutate(rest);
              })}
              className="space-y-4"
            >
              <FormField
                control={changePasswordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={changePasswordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={changePasswordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? "Changing Password..." : "Change Password"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}