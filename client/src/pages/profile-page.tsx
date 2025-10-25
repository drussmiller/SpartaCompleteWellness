import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut, ChevronLeft } from "lucide-react";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { Measurement } from "@shared/schema";
import { Loader2 } from "lucide-react";
import ChangePasswordForm from "@/components/change-password-form";
import { insertMeasurementSchema } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { BottomNav } from "@/components/bottom-nav";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Edit } from "lucide-react";

interface ProfilePageProps {
  onClose?: () => void;
}

export default function ProfilePage({ onClose }: ProfilePageProps) {
  const { user: authUser, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [uploading, setUploading] = useState(false);

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose(
    {
      onSwipeRight: () => {
        if (onClose) {
          onClose();
        } else {
          setLocation(-1);
        }
      },
    },
  );

  const { data: user, refetch: refetchUser } = useQuery({
    queryKey: ["/api/user"],
    staleTime: 0,
    enabled: !!authUser,
  });

  const [isEditingPreferredName, setIsEditingPreferredName] = useState(false);
  const [preferredNameValue, setPreferredNameValue] = useState(
    user?.preferredName || "",
  );
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [emailValue, setEmailValue] = useState(user?.email || "");

  useEffect(() => {
    setPreferredNameValue(user?.preferredName || "");
  }, [user?.preferredName]);

  useEffect(() => {
    setEmailValue(user?.email || "");
  }, [user?.email]);

  useEffect(() => {
    setSelectedActivityTypeId(user?.preferredActivityTypeId || 1);
  }, [user?.preferredActivityTypeId]);

  const updatePreferredNameMutation = useMutation({
    mutationFn: async (preferredName: string) => {
      console.log("Updating preferred name to:", preferredName);
      const res = await apiRequest("PATCH", "/api/user/preferred-name", {
        preferredName,
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to update preferred name:", errorText);
        throw new Error("Failed to update preferred name");
      }
      
      try {
        return await res.json();
      } catch (parseError) {
        console.error("Error parsing response:", parseError);
        // If parsing fails but the request was successful, return a simple success object
        return { success: true };
      }
    },
    onSuccess: async (data) => {
      console.log("Preferred name update successful:", data);
      setIsEditingPreferredName(false);
      
      // Invalidate and refetch user data to get fresh data from server
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      await refetchUser();
      
      toast({
        title: "Success",
        description: "Preferred name updated successfully",
      });
    },
    onError: (error: any) => {
      console.error("Preferred name update error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update preferred name",
        variant: "destructive",
      });
    },
  });

  const updateEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      console.log("Updating email to:", email);
      const res = await apiRequest("PATCH", "/api/user/email", {
        email,
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to update email:", errorText);
        throw new Error("Failed to update email");
      }
      
      try {
        return await res.json();
      } catch (parseError) {
        console.error("Error parsing response:", parseError);
        return { success: true };
      }
    },
    onSuccess: async (data) => {
      console.log("Email update successful:", data);
      setIsEditingEmail(false);
      
      // Invalidate and refetch user data to get fresh data from server
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      await refetchUser();
      
      toast({
        title: "Success",
        description: "Email updated successfully",
      });
    },
    onError: (error: any) => {
      console.error("Email update error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update email",
        variant: "destructive",
      });
    },
  });

  const updateActivityTypeMutation = useMutation({
    mutationFn: async (activityTypeId: number) => {
      console.log("Updating activity type to:", activityTypeId);
      const res = await apiRequest("PATCH", "/api/user/activity-type", {
        activityTypeId,
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error("Failed to update activity type:", errorText);
        throw new Error("Failed to update activity type");
      }
      return res.json();
    },
    onSuccess: async (data) => {
      console.log("Activity type update successful:", data);
      // Invalidate and refetch user data
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      await refetchUser();
      setIsEditingActivityType(false);
      toast({
        title: "Success",
        description: "Activity type updated successfully",
      });
    },
    onError: (error: any) => {
      console.error("Activity type update error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update activity type",
        variant: "destructive",
      });
    },
  });

  // Add user stats query with timezone offset
  const tzOffset = new Date().getTimezoneOffset();
  const { data: userStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/user/stats", tzOffset],
    queryFn: async () => {
      const response = await fetch(`/api/user/stats?tzOffset=${tzOffset}`);
      if (!response.ok) throw new Error("Failed to fetch user stats");
      return response.json();
    },
    staleTime: 60000, // 1 minute
    enabled: !!authUser,
  });

  // Add activity progress query to get current week and day
  const { data: activityProgress } = useQuery({
    queryKey: ["/api/activities/current", tzOffset],
    queryFn: async () => {
      const response = await fetch(
        `/api/activities/current?tzOffset=${tzOffset}`,
      );
      if (!response.ok) throw new Error("Failed to fetch activity progress");
      return response.json();
    },
    staleTime: 60000, // 1 minute
    enabled: !!authUser && !!user?.teamId,
  });

  // Add teams query to get team information
  const { data: teams } = useQuery({
    queryKey: ["/api/teams"],
    queryFn: async () => {
      const response = await fetch("/api/teams");
      if (!response.ok) throw new Error("Failed to fetch teams");
      return response.json();
    },
    enabled: !!authUser && !!user?.teamId,
  });

  // Add measurements query
  const {
    data: measurements,
    isLoading: measurementsLoading,
    error: measurementsError,
  } = useQuery<Measurement[]>({
    queryKey: ["/api/measurements"],
    queryFn: async () => {
      const response = await fetch(`/api/measurements`);
      if (!response.ok) throw new Error("Failed to fetch measurements");
      return response.json();
    },
    enabled: !!authUser,
  });

  // Add workout types query
  const { data: workoutTypes } = useQuery({
    queryKey: ["/api/workout-types"],
    enabled: !!authUser,
  });

  // Activity type selection state
  const [isEditingActivityType, setIsEditingActivityType] = useState(false);
  const [selectedActivityTypeId, setSelectedActivityTypeId] = useState(
    user?.preferredActivityTypeId || 1,
  );

  useEffect(() => {
    console.log("Profile page user data updated:", user);
  }, [user]);

  useEffect(() => {
    console.log("Refetching user data");
    refetchUser();
  }, [refetchUser]);

  const handleRefresh = async () => {
    console.log("Manual refresh requested");
    await refetchUser();
    toast({
      title: "Refreshed",
      description: "Profile data has been refreshed",
    });
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Add measurement form
  const form = useForm({
    resolver: zodResolver(
      insertMeasurementSchema.omit({ userId: true, date: true }),
    ),
    defaultValues: {
      weight: "",
      waist: "",
    },
  });

  const addMeasurementMutation = useMutation({
    mutationFn: async (data: {
      weight?: number | null;
      waist?: number | null;
    }) => {
      // Ensure we're sending at least one measurement
      if (
        (data.weight === undefined ||
          data.weight === null ||
          data.weight === "") &&
        (data.waist === undefined || data.waist === null || data.waist === "")
      ) {
        throw new Error("Please enter at least one measurement");
      }

      // Only send fields that have valid values
      const payload = {
        userId: user?.id,
        ...(data.weight &&
          data.weight !== "" && { weight: parseInt(String(data.weight)) }),
        ...(data.waist &&
          data.waist !== "" && { waist: parseInt(String(data.waist)) }),
      };

      console.log("Submitting measurement:", payload);

      const res = await apiRequest("POST", "/api/measurements", payload);

      if (!res.ok) {
        const text = await res.text();
        let errorMessage = "Failed to add measurement";

        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.message || errorMessage;
        } catch (parseError) {
          console.error("Error parsing error response:", parseError, text);
        }

        throw new Error(errorMessage);
      }

      try {
        return await res.json();
      } catch (parseError) {
        console.error("Error parsing success response:", parseError);
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
      console.error("Error adding measurement:", error);
      toast({
        title: "Unable to Update",
        description:
          error.message ||
          "There was a problem updating your measurements. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div
      className="flex flex-col h-full bg-background"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <header className="sticky top-0 z-10 bg-background border-b border-border pt-12">
        <div className="p-4 flex items-center">
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="mr-2 scale-125"
            >
              <ChevronLeft className="h-8 w-8 scale-125" />
            </Button>
          )}
          <h1 className="text-xl font-bold">Profile</h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6 pb-60 space-y-6 bg-background">
        <div className="flex-1 space-y-4">
          <Card>
            <CardContent className="flex flex-col items-center p-6 space-y-4">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage
                    src={
                      user?.imageUrl ||
                      `https://api.dicebear.com/7.x/initials/svg?seed=${user?.username}`
                    }
                    alt={user?.username}
                  />
                  <AvatarFallback>
                    {user?.username?.[0].toUpperCase()}
                  </AvatarFallback>
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
                      formData.append("image", file);

                      try {
                        setUploading(true);
                        const res = await fetch("/api/user/image", {
                          method: "POST",
                          body: formData,
                        });

                        if (!res.ok) {
                          throw new Error("Failed to update profile image");
                        }

                        await refetchUser();
                        // Invalidate all queries to ensure profile image is updated everywhere
                        await queryClient.invalidateQueries({
                          queryKey: ["/api/posts"],
                        });
                        await queryClient.invalidateQueries({
                          queryKey: ["/api/posts/comments"],
                        });

                        // Clear the entire cache to make sure everything refreshes
                        queryClient.clear();

                        // Force refresh the home page data
                        await queryClient.refetchQueries({
                          queryKey: ["/api/posts"],
                        });

                        toast({
                          title: "Success",
                          description: "Profile image updated successfully",
                        });
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Failed to update profile image",
                          variant: "destructive",
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
              
              <h2 className="text-xl font-semibold text-center">{user?.username}</h2>
              
              <div className="w-full space-y-3">
                <div>
                  {isEditingPreferredName ? (
                    <div className="space-y-2">
                      <Input
                        value={preferredNameValue}
                        onChange={(e) => setPreferredNameValue(e.target.value)}
                        placeholder="Enter preferred name"
                        className="text-base w-full"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            updatePreferredNameMutation.mutate(
                              preferredNameValue,
                            );
                          } else if (e.key === "Escape") {
                            setPreferredNameValue(user?.preferredName || "");
                            setIsEditingPreferredName(false);
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            updatePreferredNameMutation.mutate(
                              preferredNameValue,
                            )
                          }
                          disabled={updatePreferredNameMutation.isPending}
                        >
                          {updatePreferredNameMutation.isPending
                            ? "Saving..."
                            : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPreferredNameValue(user?.preferredName || "");
                            setIsEditingPreferredName(false);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-lg text-muted-foreground">Preferred Name</span>
                        <span className="font-medium">
                          {user?.preferredName || preferredNameValue || "Not set"}
                        </span>
                      </div>
                      <div className="flex justify-end mt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPreferredNameValue(user?.preferredName || "");
                            setIsEditingPreferredName(true);
                          }}
                          className="h-6 px-2 text-xs"
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                
                <div>
                  {isEditingEmail ? (
                    <div className="space-y-2">
                      <Input
                        type="email"
                        value={emailValue}
                        onChange={(e) => setEmailValue(e.target.value)}
                        placeholder="Enter email"
                        className="text-base w-full"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            updateEmailMutation.mutate(emailValue);
                          } else if (e.key === "Escape") {
                            setEmailValue(user?.email || "");
                            setIsEditingEmail(false);
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            updateEmailMutation.mutate(emailValue)
                          }
                          disabled={updateEmailMutation.isPending}
                        >
                          {updateEmailMutation.isPending
                            ? "Saving..."
                            : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEmailValue(user?.email || "");
                            setIsEditingEmail(false);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-lg text-muted-foreground">Email</span>
                        <span className="font-medium">
                          {user?.email}
                        </span>
                      </div>
                      <div className="flex justify-end mt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEmailValue(user?.email || "");
                            setIsEditingEmail(true);
                          }}
                          className="h-6 px-2 text-xs"
                        >
                          Edit
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h3 className="text-xl font-semibold mb-4">Program Details</h3>
              <div className="space-y-3">
                {user?.teamId ? (
                  <>
                    {user.teamJoinedAt && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-lg text-muted-foreground">
                            Team
                          </span>
                          <span className="font-medium">
                            {teams?.find((t) => t.id === user.teamId)?.name ||
                              "Loading..."}
                          </span>
                        </div>
                        {activityProgress &&
                          activityProgress.currentWeek &&
                          activityProgress.currentDay && (
                            <>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">
                                  Current Week
                                </span>
                                <span className="font-medium">
                                  Week {activityProgress.currentWeek}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">
                                  Current Day
                                </span>
                                <span className="font-medium">
                                  Day {activityProgress.currentDay}
                                </span>
                              </div>
                            </>
                          )}

                        <div>
                          {isEditingActivityType ? (
                            <div className="space-y-2">
                              <Select
                                value={selectedActivityTypeId.toString()}
                                onValueChange={(value) =>
                                  setSelectedActivityTypeId(parseInt(value))
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {workoutTypes?.map((workoutType) => (
                                    <SelectItem
                                      key={workoutType.id}
                                      value={workoutType.id.toString()}
                                    >
                                      {workoutType.type}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    updateActivityTypeMutation.mutate(
                                      selectedActivityTypeId,
                                    )
                                  }
                                  disabled={updateActivityTypeMutation.isPending}
                                >
                                  {updateActivityTypeMutation.isPending
                                    ? "Saving..."
                                    : "Save"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedActivityTypeId(
                                      user?.preferredActivityTypeId || 1,
                                    );
                                    setIsEditingActivityType(false);
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex justify-between items-center">
                                <span className="text-lg text-muted-foreground">
                                  Activity Type
                                </span>
                                <span className="font-medium">
                                  {workoutTypes?.find(
                                    (wt) =>
                                      wt.id ===
                                      (user?.preferredActivityTypeId || 1),
                                  )?.type || "Bands"}
                                </span>
                              </div>
                              <div className="flex justify-end mt-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedActivityTypeId(
                                      user?.preferredActivityTypeId || 1,
                                    );
                                    setIsEditingActivityType(true);
                                  }}
                                  className="h-6 px-2 text-xs"
                                  data-testid="button-edit-activity-type"
                                >
                                  Edit
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
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
              <div className="grid grid-cols-3 gap-1">
                <div className="flex flex-col items-center">
                  <div className="text-base text-muted-foreground">
                    Daily Total
                  </div>
                  <div className="text-lg font-bold">
                    {statsLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    ) : (
                      userStats?.dailyPoints || 0
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="text-base text-muted-foreground">
                    Week Total
                  </div>
                  <div className="text-lg font-bold">
                    {statsLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    ) : (
                      userStats?.weeklyPoints || 0
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  <div className="text-base text-muted-foreground">
                    Monthly Avg
                  </div>
                  <div className="text-lg font-bold">
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
                <form
                  onSubmit={form.handleSubmit((data) =>
                    addMeasurementMutation.mutate(data),
                  )}
                  className="space-y-4 mb-6"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="weight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-lg">
                            Weight (lbs)
                          </FormLabel>
                          <FormControl>
                            <Input
                              className="text-base"
                              type="number"
                              placeholder="Enter weight"
                              value={field.value || ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value ? Number(e.target.value) : "",
                                )
                              }
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
                          <FormLabel className="text-lg">
                            Waist (inches)
                          </FormLabel>
                          <FormControl>
                            <Input
                              className="text-base"
                              type="number"
                              placeholder="Enter waist"
                              value={field.value || ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value ? Number(e.target.value) : "",
                                )
                              }
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
                    {addMeasurementMutation.isPending
                      ? "Adding..."
                      : "Add Measurement"}
                  </Button>
                </form>
              </Form>

              {measurementsLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : measurementsError ? (
                <p className="text-sm text-destructive">
                  Failed to load measurements
                </p>
              ) : !measurements?.length ? (
                <div className="text-center py-6">
                  <p className="text-base text-muted-foreground">
                    No measurements recorded yet
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Record your measurements to track your progress
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-6 mb-6">
                    <div className="h-[300px]">
                      <h4 className="text-sm font-medium mb-4">
                        Weight Progress
                      </h4>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={measurements
                            .filter((m) => m.weight !== null)
                            .sort(
                              (a, b) =>
                                new Date(a.date!).getTime() -
                                new Date(b.date!).getTime(),
                            )}
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(date) =>
                              new Date(date).toLocaleDateString()
                            }
                          />
                          <YAxis
                            tick={{ fontSize: 12 }}
                            unit=" lbs"
                            domain={["auto", "auto"]}
                          />
                          <Tooltip
                            labelFormatter={(date) =>
                              new Date(date).toLocaleDateString()
                            }
                            formatter={(value) => [`${value} lbs`, "Weight"]}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="weight"
                            stroke="#2563eb"
                            name="Weight"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="h-[300px]">
                      <h4 className="text-sm font-medium mb-4">
                        Waist Progress
                      </h4>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={measurements
                            .filter((m) => m.waist !== null)
                            .sort(
                              (a, b) =>
                                new Date(a.date!).getTime() -
                                new Date(b.date!).getTime(),
                            )}
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(date) =>
                              new Date(date).toLocaleDateString()
                            }
                          />
                          <YAxis
                            tick={{ fontSize: 12 }}
                            unit=" in"
                            domain={["auto", "auto"]}
                          />
                          <Tooltip
                            labelFormatter={(date) =>
                              new Date(date).toLocaleDateString()
                            }
                            formatter={(value) => [`${value} inches`, "Waist"]}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="waist"
                            stroke="#16a34a"
                            name="Waist"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
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

          <Button
            variant="destructive"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
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
