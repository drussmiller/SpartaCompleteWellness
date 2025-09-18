import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ChevronLeft, Plus, Lock, Trash2, Loader2, Edit, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { insertTeamSchema, insertOrganizationSchema, insertGroupSchema, type Team, type User, type Organization, type Group } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottomNav } from "@/components/bottom-nav";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/app-layout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { z } from "zod";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Type definition for form data
type TeamFormData = z.infer<typeof insertTeamSchema>;
type OrganizationFormData = z.infer<typeof insertOrganizationSchema>;
type GroupFormData = z.infer<typeof insertGroupSchema>;

interface AdminPageProps {
  onClose?: () => void;
}

export default function AdminPage({ onClose }: AdminPageProps) {
  const { user: currentUser } = useAuth(); // Renamed to currentUser to avoid conflict with the mapped user
  const { toast } = useToast();
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [, setLocation] = useLocation();
  const [userProgress, setUserProgress] = useState<Record<number, { week: number; day: number }>>({});
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>("all");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("all");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("all");

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose({
    onSwipeRight: () => {
      if (onClose) {
        onClose();
      } else {
        setLocation("/menu");
      }
    }
  });

  // Get timezone offset for current user (in minutes)
  const tzOffset = new Date().getTimezoneOffset();

  const { data: teams, isLoading: teamsLoading, error: teamsError } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: organizations, isLoading: organizationsLoading, error: organizationsError } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const { data: groups, isLoading: groupsLoading, error: groupsError } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
  });

  const { data: users, isLoading: usersLoading, error: usersError } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  useEffect(() => {
    if (users) {
      users.forEach(async (user) => {
        try {
          const response = await fetch(`/api/activities/current?tzOffset=${tzOffset}`);
          if (response.ok) {
            const progress = await response.json();
            setUserProgress(prev => ({
              ...prev,
              [user.id]: {
                week: progress.currentWeek,
                day: progress.currentDay
              }
            }));
          }
        } catch (error) {
          console.error('Error fetching user progress:', error);
        }
      });
    }
  }, [users, tzOffset]);


  const form = useForm<TeamFormData>({
    resolver: zodResolver(insertTeamSchema),
    defaultValues: {
      name: "",
      description: "",
      groupId: 0,
      maxSize: 6,
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: TeamFormData) => {
      const res = await apiRequest("POST", "/api/teams", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create team");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team created successfully",
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: number) => {
      const res = await apiRequest("DELETE", `/api/teams/${teamId}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete team");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Keep this for backward compatibility but it won't be used in the new UI
  const updateUserTeamMutation = useMutation({
    mutationFn: async ({ userId, teamId }: { userId: number; teamId: number | null }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, { teamId });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update user's team");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User's team updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role, value }: { userId: number; role: 'isAdmin' | 'isTeamLead' | 'isGroupAdmin'; value: boolean }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { role, value });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User's role updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ teamId, data }: { teamId: number; data: Partial<Team> }) => {
      const res = await apiRequest("PATCH", `/api/teams/${teamId}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update team");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team updated successfully",
      });
      setEditingTeam(null);
      setSelectedGroupId("");
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateOrganizationMutation = useMutation({
    mutationFn: async ({ organizationId, data }: { organizationId: number; data: Partial<Organization> }) => {
      const res = await apiRequest("PATCH", `/api/organizations/${organizationId}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update organization");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Organization updated successfully",
      });
      setEditingOrganization(null);
      // Invalidate all affected entities since organization status changes can cascade
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ groupId, data }: { groupId: number; data: Partial<Group> }) => {
      const res = await apiRequest("PATCH", `/api/groups/${groupId}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update group");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Group updated successfully",
      });
      setEditingGroup(null);
      // Invalidate all affected entities since group status changes can cascade
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: number; data: Partial<User> }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update user");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User updated successfully",
      });
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/users/${userId}`);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: number; newPassword: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/password`, { newPassword });
      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || "Failed to reset password";
        } catch {
          errorMessage = errorText || "Failed to reset password";
        }
        throw new Error(errorMessage);
      }
      // Always return success for 200 responses
      return { success: true };
    },
    onSuccess: () => {
      console.log("Password reset success - closing dialog");
      toast({
        title: "Success",
        description: "Password reset successfully",
      });
      // Force close dialog and reset form
      setTimeout(() => {
        setResetPasswordOpen(false);
        setNewPassword("");
        setSelectedUserId(null);
      }, 100);
    },
    onError: (error: Error) => {
      console.error("Reset password error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
      // Clear password field on error but keep dialog open
      setNewPassword("");
    },
  });

  // Organization mutations
  const organizationForm = useForm<OrganizationFormData>({
    resolver: zodResolver(insertOrganizationSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createOrganizationMutation = useMutation({
    mutationFn: async (data: OrganizationFormData) => {
      const res = await apiRequest("POST", "/api/organizations", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create organization");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Organization created successfully",
      });
      organizationForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteOrganizationMutation = useMutation({
    mutationFn: async (organizationId: number) => {
      const res = await apiRequest("DELETE", `/api/organizations/${organizationId}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete organization");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Organization deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Group mutations
  const groupForm = useForm<GroupFormData>({
    resolver: zodResolver(insertGroupSchema),
    defaultValues: {
      name: "",
      description: "",
      organizationId: 0,
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: async (data: GroupFormData) => {
      const res = await apiRequest("POST", "/api/groups", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create group");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Group created successfully",
      });
      groupForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: number) => {
      const res = await apiRequest("DELETE", `/api/groups/${groupId}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete group");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Group deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateUserGroupMutation = useMutation({
    mutationFn: async ({ userId, groupId }: { userId: number; groupId: number | null }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, { groupId });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update user's group");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User's group updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isLoading = teamsLoading || usersLoading || organizationsLoading || groupsLoading;
  const error = teamsError || usersError || organizationsError || groupsError;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading activities...</span>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-red-500 mb-2">Error Loading Data</h2>
              <p className="text-gray-600">{error instanceof Error ? error.message : 'An error occurred'}</p>
              <Button
                className="mt-4"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/activities"] })}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!currentUser?.isAdmin && !currentUser?.isGroupAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-red-500 mb-2">Unauthorized</h2>
              <p className="text-gray-600">You do not have permission to access this page.</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Filter teams based on user role
  const filteredTeams = currentUser?.isAdmin
    ? teams || []  // Full admins see all teams
    : (teams || []).filter(team => team.groupId === currentUser?.adminGroupId);  // Group admins see only their group's teams

  const sortedTeams = [...filteredTeams].sort((a, b) => a.name.localeCompare(b.name));
  const sortedOrganizations = [...(organizations || [])].sort((a, b) => a.name.localeCompare(b.name));
  const sortedGroups = [...(groups || [])].sort((a, b) => a.name.localeCompare(b.name));
  // Filter users based on user role - Group admins only see users in their group's teams
  const teamIds = filteredTeams.map(team => team.id);  // Get IDs of teams the current user can see
  const filteredUsers = currentUser?.isAdmin
    ? users || []  // Full admins see all users
    : (users || []).filter(u => u.teamId && teamIds.includes(u.teamId));  // Group admins see only users in their group's teams

  const sortedUsers = [...filteredUsers].sort((a, b) => (a.username || '').localeCompare(b.username || ''));

  // Filter logic for search
  const filteredGroupsForFilter = selectedOrgFilter === "all"
    ? sortedGroups
    : sortedGroups?.filter(g => g.organizationId.toString() === selectedOrgFilter);

  const filteredTeamsForFilter = selectedGroupFilter === "all"
    ? filteredTeams
    : filteredTeams.filter(t => t.groupId.toString() === selectedGroupFilter);

  const filteredUsersForDisplay = sortedUsers?.filter(user => {
    // Organization filter
    if (selectedOrgFilter !== "all") {
      const userTeam = sortedTeams.find(t => t.id === user.teamId);
      const userGroup = userTeam ? sortedGroups?.find(g => g.id === userTeam.groupId) : null;
      if (!userGroup || userGroup.organizationId.toString() !== selectedOrgFilter) {
        return false;
      }
    }

    // Group filter
    if (selectedGroupFilter !== "all") {
      const userTeam = sortedTeams.find(t => t.id === user.teamId);
      if (!userTeam || userTeam.groupId.toString() !== selectedGroupFilter) {
        return false;
      }
    }

    // Team filter
    if (selectedTeamFilter !== "all") {
      if (selectedTeamFilter === "none") {
        return !user.teamId;
      } else {
        return user.teamId?.toString() === selectedTeamFilter;
      }
    }

    return true;
  });

  const isMobile = window.innerWidth <= 768;

  return (
    <AppLayout sidebarWidth="80">
      <div
        className="flex flex-col h-screen pb-20"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Fixed title bar */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
          <div className="p-4 pt-16 flex items-center">
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
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto pt-20 pb-20">
          <div className="container p-4 md:px-8">
            {/* Activity Management - Only show for full admins */}
            {currentUser?.isAdmin && (
              <div className="flex gap-2 mt-4 justify-center">
                <Button
                  size="default"
                  className="px-4 bg-violet-700 text-white hover:bg-violet-800"
                  onClick={() => setLocation("/activity-management")}
                >
                  Activity Management
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* Organizations Section - Only show for full admins */}
              {currentUser?.isAdmin && (
                <Collapsible className="w-full border rounded-lg p-4">
                  <div className="mb-4">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="p-0 h-auto text-2xl font-semibold hover:bg-transparent hover:text-primary">
                        Organizations
                        <ChevronDown className="h-5 w-5 ml-2" />
                      </Button>
                    </CollapsibleTrigger>
                    {/* Moved Dialog Trigger inside the CollapsibleContent */}
                    <CollapsibleContent>
                      <div className="space-y-4">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" className="mb-4 mt-4 px-3 bg-violet-700 text-white hover:bg-violet-800">
                              <Plus className="h-4 w-4 mr-2" />
                              New Organization
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <div className="flex items-center mb-2 relative">
                              <DialogPrimitive.Close asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 rounded-full absolute right-2 top-2"
                                >
                                  <span className="sr-only">Close</span>
                                  <span className="text-lg font-semibold">×</span>
                                </Button>
                              </DialogPrimitive.Close>
                              <DialogTitle className="w-full text-center">Create New Organization</DialogTitle>
                            </div>
                            <Form {...organizationForm}>
                              <form onSubmit={organizationForm.handleSubmit((data) => createOrganizationMutation.mutate(data))} className="space-y-4">
                                <FormField
                                  control={organizationForm.control}
                                  name="name"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Organization Name</FormLabel>
                                      <FormControl>
                                        <Input placeholder="Enter organization name" {...field} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={organizationForm.control}
                                  name="description"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Description</FormLabel>
                                      <FormControl>
                                        <Input placeholder="Enter description" {...field} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <Button type="submit" disabled={createOrganizationMutation.isPending}>
                                  {createOrganizationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Create Organization
                                </Button>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="space-y-4">
                        {sortedOrganizations?.map((organization) => (
                          <Card key={organization.id}>
                            <CardHeader className="pb-2">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  {editingOrganization?.id === organization.id ? (
                                    <form onSubmit={(e) => {
                                      e.preventDefault();
                                      const formData = new FormData(e.currentTarget);
                                      const name = formData.get('name') as string;
                                      const description = formData.get('description') as string;
                                      const statusValue = formData.get('status') as string;
                                      const parsedStatus = statusValue ? parseInt(statusValue) : 1;
                                      const status = (parsedStatus === 0 || parsedStatus === 1) ? parsedStatus : 1;

                                      if (!name) {
                                        toast({
                                          title: "Error",
                                          description: "Please fill in all required fields",
                                          variant: "destructive"
                                        });
                                        return;
                                      }

                                      updateOrganizationMutation.mutate({
                                        organizationId: organization.id,
                                        data: {
                                          name,
                                          description: description || undefined,
                                          status: Number(status)
                                        }
                                      });
                                    }} className="space-y-2">
                                      <Input
                                        name="name"
                                        defaultValue={organization.name}
                                        placeholder="Organization name"
                                        required
                                      />
                                      <Input
                                        name="description"
                                        defaultValue={organization.description || ''}
                                        placeholder="Description"
                                      />
                                      <Select name="status" defaultValue={organization.status?.toString() || "1"}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="1">Active</SelectItem>
                                          <SelectItem value="0">Inactive</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <div className="flex gap-2">
                                        <Button type="submit" size="sm" disabled={updateOrganizationMutation.isPending}>
                                          {updateOrganizationMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                          Save
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setEditingOrganization(null)}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </form>
                                  ) : (
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <CardTitle>{organization.name}</CardTitle>
                                      </div>
                                      <CardDescription>{organization.description}</CardDescription>
                                      <p className="text-sm mt-2">
                                        <span className="font-medium">Status: </span>
                                        <span className={organization.status === 1 ? "text-green-600" : "text-red-600"}>
                                          {organization.status === 1 ? "Active" : "Inactive"}
                                        </span>
                                      </p>
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {editingOrganization?.id !== organization.id && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setEditingOrganization(organization)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => deleteOrganizationMutation.mutate(organization.id)}
                                    disabled={deleteOrganizationMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm">
                                <span className="font-medium">Groups: </span>
                                {sortedGroups?.filter((g) => g.organizationId === organization.id).length || 0}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )}

              {/* Groups Section - Only show for full admins */}
              {currentUser?.isAdmin && (
                <Collapsible className="w-full border rounded-lg p-4">
                  <div className="mb-4">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="p-0 h-auto text-2xl font-semibold hover:bg-transparent hover:text-primary">
                        Groups
                        <ChevronDown className="h-5 w-5 ml-2" />
                      </Button>
                    </CollapsibleTrigger>
                    {/* Moved Dialog Trigger inside the CollapsibleContent */}
                    <CollapsibleContent>
                      <div className="space-y-4">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" className="mb-4 mt-4 px-3 bg-violet-700 text-white hover:bg-violet-800">
                              <Plus className="h-4 w-4 mr-2" />
                              New Group
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <div className="flex items-center mb-2 relative">
                              <DialogPrimitive.Close asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 rounded-full absolute right-2 top-2"
                                >
                                  <span className="sr-only">Close</span>
                                  <span className="text-lg font-semibold">×</span>
                                </Button>
                              </DialogPrimitive.Close>
                              <DialogTitle className="w-full text-center">Create New Group</DialogTitle>
                            </div>
                            <Form {...groupForm}>
                              <form onSubmit={groupForm.handleSubmit((data) => createGroupMutation.mutate(data))} className="space-y-4">
                                <FormField
                                  control={groupForm.control}
                                  name="name"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Group Name</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={groupForm.control}
                                  name="description"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Description</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={groupForm.control}
                                  name="organizationId"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Organization</FormLabel>
                                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select organization" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {sortedOrganizations?.map((org) => (
                                            <SelectItem key={org.id} value={org.id.toString()}>
                                              {org.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <Button type="submit" disabled={createGroupMutation.isPending}>
                                  {createGroupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                  Create Group
                                </Button>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="space-y-4">
                        {sortedGroups?.map((group) => (
                          <Card key={group.id}>
                            <CardHeader className="pb-2">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  {editingGroup?.id === group.id ? (
                                    <form onSubmit={(e) => {
                                      e.preventDefault();
                                      const formData = new FormData(e.currentTarget);
                                      const name = formData.get('name') as string;
                                      const description = formData.get('description') as string;
                                      const organizationId = parseInt(formData.get('organizationId') as string);
                                      const statusValue = formData.get('status') as string;
                                      const parsedStatus = statusValue ? parseInt(statusValue) : 1;
                                      const status = (parsedStatus === 0 || parsedStatus === 1) ? parsedStatus : 1;

                                      if (!name || !organizationId) {
                                        toast({
                                          title: "Error",
                                          description: "Please fill in all required fields",
                                          variant: "destructive"
                                        });
                                        return;
                                      }

                                      updateGroupMutation.mutate({
                                        groupId: group.id,
                                        data: {
                                          name,
                                          description: description || undefined,
                                          organizationId,
                                          status: Number(status)
                                        }
                                      });
                                    }} className="space-y-2">
                                      <Input
                                        name="name"
                                        defaultValue={group.name}
                                        placeholder="Group name"
                                        required
                                      />
                                      <Input
                                        name="description"
                                        defaultValue={group.description || ''}
                                        placeholder="Description"
                                      />
                                      <Select name="organizationId" defaultValue={group.organizationId.toString()}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select organization" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {sortedOrganizations?.map((org) => (
                                            <SelectItem key={org.id} value={org.id.toString()}>
                                              {org.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <Select name="status" defaultValue={group.status?.toString() || "1"}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="1">Active</SelectItem>
                                          <SelectItem value="0">Inactive</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <div className="flex gap-2">
                                        <Button type="submit" size="sm" disabled={updateGroupMutation.isPending}>
                                          {updateGroupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                          Save
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setEditingGroup(null)}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </form>
                                  ) : (
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <CardTitle>{group.name}</CardTitle>
                                      </div>
                                      <CardDescription>{group.description}</CardDescription>
                                      <p className="text-sm mt-2">
                                        <span className="font-medium">Status: </span>
                                        <span className={group.status === 1 ? "text-green-600" : "text-red-600"}>
                                          {group.status === 1 ? "Active" : "Inactive"}
                                        </span>
                                      </p>
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {editingGroup?.id !== group.id && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setEditingGroup(group)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => deleteGroupMutation.mutate(group.id)}
                                    disabled={deleteGroupMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm">
                                <span className="font-medium">Organization: </span>
                                {sortedOrganizations?.find((o) => o.id === group.organizationId)?.name || "Unknown"}
                              </p>
                              <p className="text-sm">
                                <span className="font-medium">Members: </span>
                                {sortedUsers?.filter((u) => {
                                  const userTeam = sortedTeams?.find(t => t.id === u.teamId);
                                  return userTeam && userTeam.groupId === group.id;
                                }).length || 0}
                              </p>
                              <p className="text-sm">
                                <span className="font-medium">Teams: </span>
                                {sortedTeams?.filter((t) => t.groupId === group.id).length || 0}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )}

              <Collapsible className="w-full border rounded-lg p-4">
                <div className="mb-4">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="p-0 h-auto text-2xl font-semibold hover:bg-transparent hover:text-primary">
                      Teams
                      <ChevronDown className="h-5 w-5 ml-2" />
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <div className="space-y-4">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" className="mb-4 px-3 bg-violet-700 text-white hover:bg-violet-800">
                          <Plus className="h-4 w-4 mr-2" />
                          New Team
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <div className="flex items-center mb-2 relative">
                          <DialogPrimitive.Close asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-full absolute right-2 top-2"
                            >
                              <span className="sr-only">Close</span>
                              <span className="text-lg font-semibold">×</span>
                            </Button>
                          </DialogPrimitive.Close>
                          <DialogTitle className="w-full text-center">Create New Team</DialogTitle>
                        </div>
                        <Form {...form}>
                          <form onSubmit={form.handleSubmit((data) => createTeamMutation.mutate(data))} className="space-y-4">
                            <FormField
                              control={form.control}
                              name="name"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Name</FormLabel>
                                  <FormControl>
                                    <Input {...field} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="description"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Description</FormLabel>
                                  <FormControl>
                                    <Textarea {...field} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="groupId"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Group</FormLabel>
                                  <FormControl>
                                    <Select
                                      value={field.value?.toString() || ""}
                                      onValueChange={(value) => field.onChange(parseInt(value))}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select a group" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {sortedGroups?.map((group) => (
                                          <SelectItem key={group.id} value={group.id.toString()}>
                                            {group.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="maxSize"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Maximum Team Size</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min="1"
                                      {...field}
                                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <Button type="submit" disabled={createTeamMutation.isPending}>
                              {createTeamMutation.isPending ? "Creating..." : "Create Team"}
                            </Button>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                    {sortedTeams?.map((team) => (
                      <Card key={team.id}>
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              {editingTeam?.id === team.id ? (
                                <form onSubmit={(e) => {
                                  e.preventDefault();
                                  const formData = new FormData(e.currentTarget);
                                  const name = formData.get('name') as string;
                                  const description = formData.get('description') as string;
                                  const maxSize = parseInt(formData.get('maxSize') as string) || 6;
                                  const groupId = selectedGroupId ? parseInt(selectedGroupId) : undefined;
                                  const statusValue = formData.get('status') as string;
                                  const parsedStatus = statusValue ? parseInt(statusValue) : 1;
                                  const status = (parsedStatus === 0 || parsedStatus === 1) ? parsedStatus : 1;

                                  if (!name || !selectedGroupId) {
                                    toast({
                                      title: "Error",
                                      description: "Please fill in all required fields",
                                      variant: "destructive"
                                    });
                                    return;
                                  }

                                  updateTeamMutation.mutate({
                                    teamId: team.id,
                                    data: {
                                      name,
                                      description,
                                      groupId,
                                      maxSize,
                                      status: Number(status),
                                    }
                                  });
                                }}>
                                  <div className="space-y-2">
                                    <Input
                                      name="name"
                                      defaultValue={team.name}
                                      className="font-semibold"
                                    />
                                    <Textarea
                                      name="description"
                                      defaultValue={team.description || ''}
                                      className="text-sm"
                                    />
                                    <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select a group" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {sortedGroups?.map((group) => (
                                          <SelectItem key={group.id} value={group.id.toString()}>
                                            {group.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Input
                                      name="maxSize"
                                      type="number"
                                      min="1"
                                      defaultValue={team.maxSize?.toString() || '6'}
                                      placeholder="Maximum team size"
                                      className="text-sm"
                                    />
                                    <Select name="status" defaultValue={team.status?.toString() || "1"}>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="1">Active</SelectItem>
                                        <SelectItem value="0">Inactive</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <div className="flex gap-2">
                                      <Button type="submit" size="sm">Save</Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          setEditingTeam(null);
                                          setSelectedGroupId("");
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                </form>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <CardTitle className="text-lg">{team.name}</CardTitle>
                                  </div>
                                  <CardDescription className="line-clamp-2 text-sm">
                                    {team.description}
                                  </CardDescription>
                                  <p className="text-sm mt-2">
                                    <span className="font-medium">Status: </span>
                                    <span className={team.status === 1 ? "text-green-600" : "text-red-600"}>
                                      {team.status === 1 ? "Active" : "Inactive"}
                                    </span>
                                  </p>
                                </>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingTeam(team);
                                  setSelectedGroupId(team.groupId?.toString() || "");
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogTitle>Delete Team?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete the team "{team.name}"? This action cannot be undone.
                                    {sortedUsers?.filter((u) => u.teamId === team.id).length > 0 && (
                                      <p className="mt-2 text-amber-600 font-medium">
                                        Warning: This team has {sortedUsers?.filter((u) => u.teamId === team.id).length} members.
                                        Deleting it will remove these users from the team.
                                      </p>
                                    )}
                                  </AlertDialogDescription>
                                  <div className="flex items-center justify-end gap-2 mt-4">
                                    <AlertDialogCancel className="h-10 px-4 py-2 flex items-center justify-center">Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 hover:bg-red-700 text-white h-10 px-4 py-2 flex items-center justify-center"
                                      onClick={() => deleteTeamMutation.mutate(team.id)}
                                    >
                                      Delete Team
                                    </AlertDialogAction>
                                  </div>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm">
                            <span className="font-medium">Group: </span>
                            {sortedGroups?.find((g) => g.id === team.groupId)?.name || "No Group"}
                          </p>
                          <p className="text-sm">
                            <span className="font-medium">Members: </span>
                            {sortedUsers?.filter((u) => u.teamId === team.id).length || 0}
                          </p>
                          <p className="text-sm">
                            <span className="font-medium">Max Size: </span>
                            {team.maxSize || 6}
                          </p>
                          <p className="text-sm">
                            <span className="font-medium">Status: </span>
                            <span className={team.status === 1 ? "text-green-600" : "text-red-600"}>
                              {team.status === 1 ? "Active" : "Inactive"}
                            </span>
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="border rounded-lg p-4">
                <Collapsible className="w-full">
                  <div className="mb-4">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="p-0 h-auto text-2xl font-semibold hover:bg-transparent hover:text-primary">
                        Users
                        <ChevronDown className="h-5 w-5 ml-2" />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    {/* Search and Filter Section */}
                    <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
                      <h3 className="text-lg font-medium">Search & Filter Users</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Organization</label>
                          <Select
                            value={selectedOrgFilter}
                            onValueChange={setSelectedOrgFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="All Organizations" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Organizations</SelectItem>
                              {sortedOrganizations?.map((org) => (
                                <SelectItem key={org.id} value={org.id.toString()}>
                                  {org.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Group</label>
                          <Select
                            value={selectedGroupFilter}
                            onValueChange={setSelectedGroupFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="All Groups" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Groups</SelectItem>
                              {filteredGroupsForFilter?.map((group) => (
                                <SelectItem key={group.id} value={group.id.toString()}>
                                  {group.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Team</label>
                          <Select
                            value={selectedTeamFilter}
                            onValueChange={setSelectedTeamFilter}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="All Teams" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Teams</SelectItem>
                              <SelectItem value="none">No Team</SelectItem>
                              {filteredTeamsForFilter?.map((team) => (
                                <SelectItem key={team.id} value={team.id.toString()}>
                                  {team.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-600">
                          Showing {filteredUsersForDisplay?.length || 0} of {sortedUsers?.length || 0} users
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedOrgFilter("all");
                            setSelectedGroupFilter("all");
                            setSelectedTeamFilter("all");
                          }}
                        >
                          Clear Filters
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {filteredUsersForDisplay?.map((user) => (
                        <Card key={user.id}>
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <div>
                                {editingUser?.id === user.id ? (
                                  <form onSubmit={(e) => {
                                    e.preventDefault();
                                    const formData = new FormData(e.currentTarget);
                                    updateUserMutation.mutate({
                                      userId: user.id,
                                      data: {
                                        username: formData.get('username') as string,
                                        email: formData.get('email') as string,
                                        status: ((statusValue) => {
                                          const parsed = statusValue ? parseInt(statusValue) : 1;
                                          return (parsed === 0 || parsed === 1) ? parsed : 1;
                                        })(formData.get('status') as string),
                                      }
                                    });
                                  }}>
                                    <div className="space-y-2">
                                      <Input
                                        name="username"
                                        defaultValue={user.username}
                                        className="font-semibold"
                                      />
                                      <Input
                                        name="email"
                                        defaultValue={user.email}
                                        type="email"
                                        className="text-sm"
                                      />
                                      <Select name="status" defaultValue={user.status?.toString() || "1"}>
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="1">Active</SelectItem>
                                          <SelectItem value="0">Inactive</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <div className="flex gap-2">
                                        <Button type="submit" size="sm">Save</Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setEditingUser(null)}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  </form>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2">
                                      <CardTitle>{user.preferredName || user.username}</CardTitle>
                                      <div className="flex gap-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => setEditingUser(user)}
                                        >
                                          <Edit className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              variant="destructive"
                                              size="sm"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This action cannot be undone. This will permanently delete the user
                                              account and all associated data.
                                            </AlertDialogDescription>
                                            <div className="flex items-center justify-end gap-2 mt-4">
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction
                                                className="bg-red-600 hover:bg-red-700 text-white"
                                                onClick={() => deleteUserMutation.mutate(user.id)}
                                              >
                                                Delete User
                                              </AlertDialogAction>
                                            </div>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      <span className="font-medium">Username:</span> {user.username}
                                    </div>
                                    <CardDescription>{user.email}</CardDescription>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                      Start Date: {new Date(user.createdAt!).toLocaleDateString()}
                                    </div>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                      Progress: Week {userProgress[user.id]?.week ?? user.currentWeek},
                                      Day {userProgress[user.id]?.day ?? user.currentDay}
                                    </div>
                                    <p className="text-sm mt-2">
                                      <span className="font-medium">Status: </span>
                                      <span className={user.status === 1 ? "text-green-600" : "text-red-600"}>
                                        {user.status === 1 ? "Active" : "Inactive"}
                                      </span>
                                    </p>
                                  </>
                                )}
                              </div>

                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Team Assignment</p>
                              <Select
                                defaultValue={user.teamId?.toString() || "none"}
                                onValueChange={(value) => {
                                  const teamId = value === "none" ? null : parseInt(value);
                                  updateUserTeamMutation.mutate({ userId: user.id, teamId });
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select a team" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No Team</SelectItem>
                                  {sortedTeams?.map((team) => (
                                    <SelectItem key={team.id} value={team.id.toString()}>
                                      {team.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <p className="text-sm font-medium">Roles</p>
                              <div className="flex gap-2 mr-24">
                                {/* Admin button - only show if current logged-in user is Admin */}
                                {currentUser?.isAdmin && (
                                  <Button
                                    variant={user.isAdmin ? "default" : "outline"}
                                    size="sm"
                                    className={`text-xs ${user.isAdmin ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
                                    onClick={() => {
                                      // Prevent removing admin from the admin user with username "admin"
                                      if (user.username === "admin" && user.isAdmin) {
                                        toast({
                                          title: "Cannot Remove Admin",
                                          description: "This is the main administrator account and cannot have admin rights removed.",
                                          variant: "destructive"
                                        });
                                        return;
                                      }
                                      updateUserRoleMutation.mutate({
                                        userId: user.id,
                                        role: 'isAdmin',
                                        value: !user.isAdmin
                                      });
                                    }}
                                  >
                                    Admin
                                  </Button>
                                )}
                                {/* Group Admin button - show if current logged-in user is Admin or Group Admin */}
                                {(currentUser?.isAdmin || currentUser?.isGroupAdmin) && (
                                  <Button
                                    variant={user.isGroupAdmin ? "default" : "outline"}
                                    size="sm"
                                    className={`text-xs ${user.isGroupAdmin ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
                                    disabled={!user.teamId}
                                    onClick={() => {
                                      if (!user.teamId) {
                                        toast({
                                          title: "Team Required",
                                          description: "User must be assigned to a team before becoming a Group Admin.",
                                          variant: "destructive"
                                        });
                                        return;
                                      }
                                      updateUserRoleMutation.mutate({
                                        userId: user.id,
                                        role: 'isGroupAdmin',
                                        value: !user.isGroupAdmin
                                      });
                                    }}
                                  >
                                    Group Admin
                                  </Button>
                                )}
                                {/* Team Lead button - show for Admin, Group Admin, or Team Lead */}
                                {(currentUser?.isAdmin || currentUser?.isGroupAdmin || currentUser?.isTeamLead) && (
                                  <Button
                                    variant={user.isTeamLead ? "default" : "outline"}
                                    size="sm"
                                    className={`text-xs ${user.isTeamLead ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
                                    disabled={!user.teamId}
                                    onClick={() => {
                                      if (!user.teamId) {
                                        toast({
                                          title: "Team Required",
                                          description: "User must be assigned to a team before becoming a Team Lead.",
                                          variant: "destructive"
                                        });
                                        return;
                                      }
                                      updateUserRoleMutation.mutate({
                                        userId: user.id,
                                        role: 'isTeamLead',
                                        value: !user.isTeamLead
                                      });
                                    }}
                                  >
                                    Team Lead
                                  </Button>
                                )}
                              </div>
                            </div>

                            <div className="pt-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full bg-violet-700 text-white hover:bg-violet-800 hover:text-white"
                                onClick={() => {
                                  setSelectedUserId(user.id);
                                  setResetPasswordOpen(true);
                                }}
                              >
                                <Lock className="h-4 w-4 mr-1" />
                                Reset Password
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          </div>
        </div>
        <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Enter a new password for the user.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (selectedUserId && newPassword) {
                resetPasswordMutation.mutate({ userId: selectedUserId, newPassword });
              }
            }}>
              <div className="space-y-4 mt-2">
                <div className="relative">
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    required
                  />
                </div>
                <Button type="submit" disabled={resetPasswordMutation.isPending}>
                  {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <div className="fixed bottom-0 left-0 right-0 z-50 bg-background">
          <BottomNav />
        </div>
      </div>
    </AppLayout>
  );
}