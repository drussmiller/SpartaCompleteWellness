import { useQuery, useMutation } from "@tanstack/react-query";
import React, { useState, useEffect, memo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  ChevronLeft,
  Plus,
  Lock,
  Trash2,
  Loader2,
  Edit,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  insertTeamSchema,
  insertOrganizationSchema,
  insertGroupSchema,
  type Team,
  type User,
  type Organization,
  type Group,
} from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { InviteQRCode } from "@/components/invite-qr-code";
import { Label } from "@/components/ui/label";

// Type definition for form data
type TeamFormData = z.infer<typeof insertTeamSchema>;
type OrganizationFormData = z.infer<typeof insertOrganizationSchema>;
type GroupFormData = z.infer<typeof insertGroupSchema>;

interface AdminPageProps {
  onClose?: () => void;
}

// Helper function to safely extract error messages from responses
async function getErrorMessage(res: Response, defaultMessage: string): Promise<string> {
  try {
    const error = await res.json();
    return error.message || defaultMessage;
  } catch {
    try {
      const text = await res.text();
      return text || defaultMessage;
    } catch {
      return defaultMessage;
    }
  }
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
  const [editingOrganization, setEditingOrganization] =
    useState<Organization | null>(null);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [, setLocation] = useLocation();
  const [userProgress, setUserProgress] = useState<
    Record<number, { week: number; day: number }>
  >({});
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>("all");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("all");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>("all");
  const [showInactiveOrgs, setShowInactiveOrgs] = useState(false);
  const [showInactiveGroups, setShowInactiveGroups] = useState(false);
  const [showInactiveTeams, setShowInactiveTeams] = useState(false);
  const [showInactiveUsers, setShowInactiveUsers] = useState(false);
  const [selectedProgramStartDate, setSelectedProgramStartDate] = useState<Record<number, Date | undefined>>({});

  // Collapsible panel states - controlled to persist across re-renders
  const [organizationsPanelOpen, setOrganizationsPanelOpen] = useState(false);
  const [groupsPanelOpen, setGroupsPanelOpen] = useState(false);
  const [teamsPanelOpen, setTeamsPanelOpen] = useState(false);
  const [usersPanelOpen, setUsersPanelOpen] = useState(false);

  // Optimistic updates - track local changes without touching React Query cache
  const [optimisticGroups, setOptimisticGroups] = useState<Record<number, Partial<Group>>>({});
  const [optimisticTeams, setOptimisticTeams] = useState<Record<number, Partial<Team>>>({});
  const [optimisticUsers, setOptimisticUsers] = useState<Record<number, Partial<User>>>({});
  const [optimisticOrgs, setOptimisticOrgs] = useState<Record<number, Partial<Organization>>>({});

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose(
    {
      onSwipeRight: () => {
        if (onClose) {
          onClose();
        } else {
          setLocation("/menu");
        }
      },
    },
  );

  // Get timezone offset for current user (in minutes)
  const tzOffset = new Date().getTimezoneOffset();

  const {
    data: teams,
    isLoading: teamsLoading,
    error: teamsError,
  } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const {
    data: organizations,
    isLoading: organizationsLoading,
    error: organizationsError,
  } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const {
    data: groups,
    isLoading: groupsLoading,
    error: groupsError,
  } = useQuery<Group[]>({
    queryKey: ["/api/groups"],
  });

  const {
    data: users,
    isLoading: usersLoading,
    error: usersError,
  } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Merge cached data with optimistic updates
  const mergedGroups = groups?.map(g => ({ ...g, ...optimisticGroups[g.id] }));
  const mergedTeams = teams?.map(t => ({ ...t, ...optimisticTeams[t.id] }));
  const mergedUsers = users?.map(u => ({ ...u, ...optimisticUsers[u.id] }));
  const mergedOrgs = organizations?.map(o => ({ ...o, ...optimisticOrgs[o.id] }));

  // Note: User progress is now shown directly from user.currentWeek and user.currentDay
  // No need to fetch separately for each user

  // Auto-set filters for Group Admins to their specific group
  useEffect(() => {
    if (currentUser?.isGroupAdmin && !currentUser?.isAdmin && groups && organizations) {
      const adminGroup = groups.find(g => g.id === currentUser.adminGroupId);
      if (adminGroup) {
        // Set organization filter
        if (selectedOrgFilter === "all") {
          setSelectedOrgFilter(adminGroup.organizationId.toString());
        }
        // Set group filter to their specific group
        if (selectedGroupFilter === "all") {
          setSelectedGroupFilter(adminGroup.id.toString());
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, groups, organizations]);

  const form = useForm<TeamFormData>({
    resolver: zodResolver(insertTeamSchema),
    defaultValues: {
      name: "",
      description: "",
      groupId: currentUser?.isGroupAdmin && !currentUser?.isAdmin
        ? currentUser.adminGroupId || 0
        : 0,
      maxSize: 6,
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: TeamFormData) => {
      const res = await apiRequest("POST", "/api/teams", data);
      if (!res.ok) {
        const errorMessage = await getErrorMessage(res, "Failed to create team");
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team created successfully",
      });
      form.reset();
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
        const errorMessage = await getErrorMessage(res, "Failed to delete team");
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team deleted successfully",
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

  // Keep this for backward compatibility but it won't be used in the new UI
  const updateUserTeamMutation = useMutation({
    mutationFn: async ({
      userId,
      teamId,
    }: {
      userId: number;
      teamId: number | null;
    }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, { teamId });
      if (!res.ok) {
        let errorMessage = "Failed to update user's team";
        try {
          const error = await res.json();
          errorMessage = error.message || errorMessage;
        } catch {
          const text = await res.text();
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User's team updated successfully",
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

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({
      userId,
      role,
      value,
    }: {
      userId: number;
      role: "isAdmin" | "isTeamLead" | "isGroupAdmin";
      value: boolean;
    }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, {
        role,
        value,
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSuccess: (updatedUser) => {
      toast({
        title: "Success",
        description: "User's role updated successfully",
      });

      // Update the users list in the cache without refetching
      queryClient.setQueryData(["/api/users"], (oldUsers: User[] | undefined) => {
        if (!oldUsers) return oldUsers;
        return oldUsers.map(user => 
          user.id === updatedUser.id ? updatedUser : user
        );
      });

      // Only refetch current user data if we modified the logged-in user
      if (updatedUser.id === currentUser?.id) {
      }
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
    mutationFn: async ({
      teamId,
      data,
    }: {
      teamId: number;
      data: Partial<Team>;
    }) => {
      const res = await apiRequest("PATCH", `/api/teams/${teamId}`, data);
      if (!res.ok) {
        const errorMessage = await getErrorMessage(res, "Failed to update team");
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Team updated successfully",
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

  const updateOrganizationMutation = useMutation({
    mutationFn: async ({
      organizationId,
      data,
    }: {
      organizationId: number;
      data: Partial<Organization>;
    }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/organizations/${organizationId}`,
        data,
      );
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
    mutationFn: async ({ groupId, data }: { groupId: number; data: any }) => {
      // Optimistically update local state immediately
      setOptimisticGroups(prev => ({
        ...prev,
        [groupId]: { ...prev[groupId], ...data }
      }));

      const res = await apiRequest("PATCH", `/api/groups/${groupId}`, data);
      if (!res.ok) {
        let errorMessage = "Failed to update group";
        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          // If JSON parsing fails, use default message
          console.error("Failed to parse error response:", e);
        }
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Group updated successfully",
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

  const updateUserMutation = useMutation({
    mutationFn: async ({
      userId,
      data,
    }: {
      userId: number;
      data: Partial<User>;
    }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, data);
      if (!res.ok) {
        const errorMessage = await getErrorMessage(res, "Failed to update user");
        throw new Error(errorMessage);
      }
      return res.json();
    },
    onSuccess: (updatedUser) => {
      toast({
        title: "Success",
        description: "User updated successfully",
      });

      // Update the users list in the cache
      queryClient.setQueryData(["/api/users"], (oldUsers: User[] | undefined) => {
        if (!oldUsers) return oldUsers;
        return oldUsers.map(user => 
          user.id === updatedUser.id ? updatedUser : user
        );
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
    mutationFn: async ({
      userId,
      newPassword,
    }: {
      userId: number;
      newPassword: string;
    }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/password`, {
        newPassword,
      });
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
    onSuccess: (newOrganization) => {
      toast({
        title: "Success",
        description: "Organization created successfully",
      });
      organizationForm.reset();

      // Update cache manually instead of invalidating to prevent panel collapse
      queryClient.setQueryData(["/api/organizations"], (oldOrgs: Organization[] | undefined) => {
        if (!oldOrgs) return [newOrganization];
        return [...oldOrgs, newOrganization];
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

  const deleteOrganizationMutation = useMutation({
    mutationFn: async (organizationId: number) => {
      const res = await apiRequest(
        "DELETE",
        `/api/organizations/${organizationId}`,
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to delete organization");
      }
      return res.json();
    },
    onSuccess: (_, organizationId) => {
      toast({
        title: "Success",
        description: "Organization deleted successfully",
      });

      // Update cache manually to remove deleted organization
      queryClient.setQueryData(["/api/organizations"], (oldOrgs: Organization[] | undefined) => {
        if (!oldOrgs) return [];
        return oldOrgs.filter(org => org.id !== organizationId);
      });

      // Force re-fetch to ensure UI is in sync with database
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
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<number | null>(null);

  const groupForm = useForm<GroupFormData>({
    resolver: zodResolver(insertGroupSchema.omit({ organizationId: true })),
    defaultValues: {
      name: "",
      description: "",
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
    onSuccess: (newGroup) => {
      toast({
        title: "Success",
        description: "Group created successfully",
      });
      groupForm.reset();

      // Update cache manually to add the new group
      queryClient.setQueryData(["/api/groups"], (oldGroups: Group[] | undefined) => {
        if (!oldGroups) return [newGroup];
        return [...oldGroups, newGroup];
      });

      // Also invalidate to ensure consistency
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
    onSuccess: (_, groupId) => {
      toast({
        title: "Success",
        description: "Group deleted successfully",
      });

      // Update cache manually to remove the deleted group
      queryClient.setQueryData(["/api/groups"], (oldGroups: Group[] | undefined) => {
        if (!oldGroups) return [];
        return oldGroups.filter(group => group.id !== groupId);
      });

      // Also invalidate to ensure consistency
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

  const generateGroupInviteCodeMutation = useMutation({
    mutationFn: async (groupId: number) => {
      const res = await apiRequest("POST", `/api/groups/${groupId}/generate-invite-code`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to generate invite code");
      }
      return res.json();
    },
    onSuccess: () => {
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateTeamInviteCodesMutation = useMutation({
    mutationFn: async (teamId: number) => {
      const res = await apiRequest("POST", `/api/teams/${teamId}/generate-invite-codes`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to generate invite codes");
      }
      return res.json();
    },
    onSuccess: () => {
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
    mutationFn: async ({
      userId,
      groupId,
    }: {
      userId: number;
      groupId: number | null;
    }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, {
        groupId,
      });
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
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isLoading =
    teamsLoading || usersLoading || organizationsLoading || groupsLoading;
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
              <h2 className="text-xl font-bold text-red-500 mb-2">
                Error Loading Data
              </h2>
              <p className="text-gray-600">
                {error instanceof Error ? error.message : "An error occurred"}
              </p>
              <Button
                className="mt-4"
                onClick={() => {
                  window.location.reload();
                }}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Access control: Only Admins and Group Admins can access the dashboard. Team Leads can see their team's users.
  if (!currentUser?.isAdmin && !currentUser?.isGroupAdmin && !currentUser?.isTeamLead) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold text-red-500 mb-2">
                Unauthorized
              </h2>
              <p className="text-gray-600">
                You do not have permission to access this page.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Sort and filter data - do all computations without useMemo to avoid hooks order issues
  const sortedOrganizations = [...(organizations || [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Filter groups based on the current user's role first
  const filteredGroups = currentUser?.isGroupAdmin && !currentUser?.isAdmin
    ? (() => {
        const adminGroup = (groups || []).find(
          (g) => g.id === currentUser.adminGroupId,
        );
        return adminGroup ? [adminGroup] : [];
      })()
    : (groups || []);

  // Sort the filtered groups
  const sortedGroups = [...filteredGroups].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Filter teams based on user role
  const filteredTeams = currentUser?.isAdmin
    ? teams || []
    : currentUser?.isGroupAdmin
      ? (teams || []).filter((team) => team.groupId === currentUser.adminGroupId)
      : currentUser?.isTeamLead
        ? (teams || []).filter((team) => team.id === currentUser.teamId)
        : [];

  const sortedTeams = [...filteredTeams].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Filter users based on user role
  const filteredUsers = currentUser?.isAdmin
    ? users || []
    : currentUser?.isGroupAdmin
      ? (() => {
          const adminGroupId = currentUser.adminGroupId;
          if (!adminGroupId) {
            return [];
          }
          const groupTeams = (teams || []).filter((team) => team.groupId === adminGroupId);
          const groupTeamIds = groupTeams.map((team) => team.id);
          return (users || []).filter((u) => {
            // Include users in the admin's groups' teams, or users not assigned to any team
            if (u.teamId && groupTeamIds.includes(u.teamId)) {
              return true;
            }
            if (!u.teamId) {
              return true;
            }
            return false;
          });
        })()
      : currentUser?.isTeamLead
        ? // Team Leads see only users in their own team
          (users || []).filter((u) => u.teamId === currentUser.teamId)
        : []; // Default case, should not be reached if access control is correct

  const sortedUsers = [...filteredUsers].sort((a, b) =>
    (a.username || "").localeCompare(b.username || ""),
  );

  // Filter variables for the search/filter dropdowns
  const filteredGroupsForFilter =
    selectedOrgFilter === "all"
      ? filteredGroups
      : filteredGroups.filter(
          (group) => group.organizationId.toString() === selectedOrgFilter,
        );

  const filteredTeamsForFilter =
    selectedGroupFilter === "all"
      ? sortedTeams
      : sortedTeams.filter(
          (team) => team.groupId.toString() === selectedGroupFilter,
        );

  // Apply filters to users for display
  const filteredUsersForDisplay = sortedUsers.filter((user) => {
    // Organization filter
    if (selectedOrgFilter !== "all") {
      const userTeam = sortedTeams.find((t) => t.id === user.teamId);
      const userGroup = userTeam
        ? sortedGroups.find((g) => g.id === userTeam.groupId)
        : null;
      if (
        !userGroup ||
        userGroup.organizationId.toString() !== selectedOrgFilter
      ) {
        return false;
      }
    }

    // Group filter
    if (selectedGroupFilter !== "all") {
      const userTeam = sortedTeams.find((t) => t.id === user.teamId);
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

  // Filtered lists for display based on showInactive state
  const visibleOrganizations = showInactiveOrgs
    ? sortedOrganizations
    : sortedOrganizations.filter((org) => org.status === 1);
  const visibleGroups = showInactiveGroups
    ? filteredGroups
    : filteredGroups.filter((group) => group.status === 1);
  const visibleTeams = showInactiveTeams
    ? sortedTeams
    : sortedTeams.filter((team) => team.status === 1);
  const visibleUsers = showInactiveUsers
    ? filteredUsersForDisplay
    : filteredUsersForDisplay.filter((user) => user.status === 1);

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
              {currentUser?.isAdmin && !currentUser?.isTeamLead && (
                <Collapsible 
                  open={organizationsPanelOpen} 
                  onOpenChange={setOrganizationsPanelOpen}
                  className="w-full border rounded-lg p-4 min-h-[60px]"
                >
                  <div className="mb-4">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="p-0 h-auto text-2xl font-semibold hover:bg-transparent hover:text-primary mb-4"
                      >
                        Organizations
                        <ChevronDown className={`h-5 w-5 ml-2 transition-transform ${organizationsPanelOpen ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                    {/* Moved Dialog Trigger inside the CollapsibleContent */}
                    <CollapsibleContent>
                      <div className="space-y-4">
                        <div className="flex items-center space-x-2 mb-4">
                          <Checkbox
                            id="show-inactive-orgs"
                            checked={showInactiveOrgs}
                            onCheckedChange={(checked) => setShowInactiveOrgs(checked === true)}
                          />
                          <Label
                            htmlFor="show-inactive-orgs"
                          >
                            Show inactive organizations
                          </Label>
                        </div>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              className="mb-8 mt-6 px-3 bg-violet-700 text-white hover:bg-violet-800"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              New Organization
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Create New Organization</DialogTitle>
                            </DialogHeader>
                            <Form {...organizationForm}>
                              <form
                                onSubmit={organizationForm.handleSubmit(
                                  (data) =>
                                    createOrganizationMutation.mutate(data),
                                )}
                                className="space-y-4"
                              >
                                <FormField
                                  control={organizationForm.control}
                                  name="name"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Organization Name</FormLabel>
                                      <FormControl>
                                        <Input
                                          placeholder="Enter organization name"
                                          {...field}
                                        />
                                      </FormControl>
                                      <FormMessage />
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
                                        <Input
                                          placeholder="Enter description"
                                          {...field}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <DialogFooter>
                                  <Button
                                    type="submit"
                                    disabled={
                                      createOrganizationMutation.isPending
                                    }
                                  >
                                    {createOrganizationMutation.isPending && (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Create Organization
                                  </Button>
                                </DialogFooter>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="space-y-4">
                        {visibleOrganizations?.map((organization, index) => (
                          <Card key={organization.id} className={index === 0 ? "mt-4" : ""}>
                            <CardHeader className="pb-2">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  {editingOrganization?.id ===
                                  organization.id ? (
                                    <form
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        const formData = new FormData(
                                          e.currentTarget,
                                        );
                                        const name = formData.get(
                                          "name",
                                        ) as string;
                                        const description = formData.get(
                                          "description",
                                        ) as string;
                                        const statusValue = formData.get(
                                          "status",
                                        ) as string;
                                        const parsedStatus = statusValue
                                          ? parseInt(statusValue)
                                          : 1;
                                        const status =
                                          parsedStatus === 0 ||
                                          parsedStatus === 1
                                            ? parsedStatus
                                            : 1;

                                        if (!name) {
                                          toast({
                                            title: "Error",
                                            description:
                                              "Please fill in all required fields",
                                            variant: "destructive",
                                          });
                                          return;
                                        }

                                        updateOrganizationMutation.mutate({
                                          organizationId: organization.id,
                                          data: {
                                            name,
                                            description:
                                              description || undefined,
                                            status: Number(status),
                                          },
                                        });
                                      }}
                                      className="space-y-2"
                                    >
                                      <Input
                                        name="name"
                                        defaultValue={organization.name}
                                        placeholder="Organization name"
                                        required
                                      />
                                      <Input
                                        name="description"
                                        defaultValue={
                                          organization.description || ""
                                        }
                                        placeholder="Description"
                                      />
                                      <Select
                                        name="status"
                                        defaultValue={
                                          organization.status?.toString() || "1"
                                        }
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="1">
                                            Active
                                          </SelectItem>
                                          <SelectItem value="0">
                                            Inactive
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <div className="flex gap-2">
                                        <Button
                                          type="submit"
                                          size="sm"
                                          disabled={
                                            updateOrganizationMutation.isPending
                                          }
                                        >
                                          {updateOrganizationMutation.isPending && (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          )}
                                          Save
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() =>
                                            setEditingOrganization(null)
                                          }
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </form>
                                  ) : (
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <CardTitle>
                                          {organization.name}
                                        </CardTitle>
                                      </div>
                                      <CardDescription>
                                        {organization.description}
                                      </CardDescription>
                                      <p className="text-sm mt-2">
                                        <span className="font-medium">
                                          Status:{" "}
                                        </span>
                                        <span
                                          className={
                                            organization.status === 1
                                              ? "text-green-600"
                                              : "text-red-600"
                                          }
                                        >
                                          {organization.status === 1
                                            ? "Active"
                                            : "Inactive"}
                                        </span>
                                      </p>
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {editingOrganization?.id !==
                                    organization.id && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        setEditingOrganization(organization)
                                      }
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() =>
                                      deleteOrganizationMutation.mutate(
                                        organization.id,
                                      )
                                    }
                                    disabled={
                                      deleteOrganizationMutation.isPending
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm">
                                <span className="font-medium">Groups: </span>
                                {sortedGroups?.filter(
                                  (g) => g.organizationId === organization.id,
                                ).length || 0}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
              )}

              {/* Groups Section - Show for full admins and group admins */}
              {(currentUser?.isAdmin || currentUser?.isGroupAdmin) && !currentUser?.isTeamLead && (
                <Collapsible 
                  open={groupsPanelOpen} 
                  onOpenChange={setGroupsPanelOpen}
                  className="w-full border rounded-lg p-4 min-h-[60px]"
                >
                  <div className="mb-4">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        className="p-0 h-auto text-2xl font-semibold hover:bg-transparent hover:text-primary mb-4"
                      >
                        Groups
                        <ChevronDown className={`h-5 w-5 ml-2 transition-transform ${groupsPanelOpen ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                    {/* Moved Dialog Trigger inside the CollapsibleContent */}
                    <CollapsibleContent>
                      <div className="space-y-4">
                        <div className="flex items-center space-x-2 mb-4">
                          <Checkbox
                            id="show-inactive-groups"
                            checked={showInactiveGroups}
                            onCheckedChange={(checked) => setShowInactiveGroups(checked === true)}
                          />
                          <Label
                            htmlFor="show-inactive-groups"
                          >
                            Show inactive groups
                          </Label>
                        </div>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              className="mb-8 mt-6 px-3 bg-violet-700 text-white hover:bg-violet-800"
                            >
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
                                  <span className="text-lg font-semibold">
                                    ×
                                  </span>
                                </Button>
                              </DialogPrimitive.Close>
                              <DialogTitle className="w-full text-center">
                                Create New Group
                              </DialogTitle>
                            </div>
                            <Form {...groupForm}>
                              <form
                                onSubmit={groupForm.handleSubmit((data) => {
                                  // Set organizationId based on user role
                                  let orgId: number;

                                  if (currentUser?.isAdmin) {
                                    // Admin must select an organization
                                    if (!selectedOrganizationId) {
                                      toast({
                                        title: "Error",
                                        description: "Please select an organization",
                                        variant: "destructive",
                                      });
                                      return;
                                    }
                                    orgId = selectedOrganizationId;
                                  } else if (
                                    currentUser?.isGroupAdmin &&
                                    currentUser?.adminGroupId
                                  ) {
                                    // Group Admin uses their group's organization
                                    const adminGroup = groups?.find(
                                      (g) => g.id === currentUser.adminGroupId,
                                    );
                                    if (!adminGroup) {
                                      toast({
                                        title: "Error",
                                        description: "Could not find your organization",
                                        variant: "destructive",
                                      });
                                      return;
                                    }
                                    orgId = adminGroup.organizationId;
                                  } else {
                                    toast({
                                      title: "Error",
                                      description: "Not authorized to create groups",
                                      variant: "destructive",
                                    });
                                    return;
                                  }

                                  createGroupMutation.mutate({
                                    ...data,
                                    organizationId: orgId,
                                  });
                                })}
                                className="space-y-4"
                              >
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
                                {currentUser?.isAdmin && (
                                  <div className="space-y-2">
                                    <label className="text-sm font-medium">Organization</label>
                                    <Select
                                      value={selectedOrganizationId !== null ? selectedOrganizationId.toString() : undefined}
                                      onValueChange={(value) => {
                                        setSelectedOrganizationId(parseInt(value));
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select organization" />
                                      </SelectTrigger>
                                      <SelectContent className="z-[9999]">
                                        {sortedOrganizations?.map((org) => (
                                          <SelectItem
                                            key={org.id}
                                            value={org.id.toString()}
                                          >
                                            {org.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                {currentUser?.isGroupAdmin && (
                                  <div className="text-sm text-muted-foreground">
                                    Groups will be created in your organization:{" "}
                                    {(() => {
                                      const adminGroup = groups?.find(
                                        (g) =>
                                          g.id === currentUser.adminGroupId,
                                      );
                                      const org = sortedOrganizations?.find(
                                        (o) =>
                                          o.id === adminGroup?.organizationId,
                                      );
                                      return org?.name || "Unknown";
                                    })()}
                                  </div>
                                )}
                                <Button
                                  type="submit"
                                  disabled={createGroupMutation.isPending}
                                >
                                  {createGroupMutation.isPending && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  )}
                                  Create Group
                                </Button>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="space-y-4">
                        {(showInactiveGroups ? sortedGroups : sortedGroups.filter(g => g.status === 1))?.map((group, index) => (
                          <Card key={group.id} className={index === 0 ? "mt-4" : ""}>
                            <CardHeader className="pb-2">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  {editingGroup?.id === group.id ? (
                                    <form
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        const formData = new FormData(
                                          e.currentTarget,
                                        );
                                        const name = formData.get(
                                          "name",
                                        ) as string;
                                        const description = formData.get(
                                          "description",
                                        ) as string;
                                        const organizationId = parseInt(
                                          formData.get(
                                            "organizationId",
                                          ) as string,
                                        );
                                        const statusValue = formData.get(
                                          "status",
                                        ) as string;
                                        const parsedStatus = statusValue
                                          ? parseInt(statusValue)
                                          : 1;
                                        const status =
                                          parsedStatus === 0 ||
                                          parsedStatus === 1
                                            ? parsedStatus
                                            : 1;
                                        const competitive = formData.get(
                                          "competitive",
                                        ) === "on";

                                        if (!name || !organizationId) {
                                          toast({
                                            title: "Error",
                                            description:
                                              "Please fill in all required fields",
                                            variant: "destructive",
                                          });
                                          return;
                                        }

                                        updateGroupMutation.mutate({
                                          groupId: group.id,
                                          data: {
                                            name,
                                            description:
                                              description || undefined,
                                            organizationId,
                                            status: Number(status),
                                            competitive,
                                          },
                                        });
                                      }}
                                      className="space-y-2"
                                    >
                                      <Input
                                        name="name"
                                        defaultValue={group.name}
                                        placeholder="Group name"
                                        required
                                      />
                                      <Input
                                        name="description"
                                        defaultValue={group.description || ""}
                                        placeholder="Description"
                                      />
                                      {/* Only show organization selector for Full Admins */}
                                      {currentUser?.isAdmin ? (
                                        <Select
                                          name="organizationId"
                                          defaultValue={group.organizationId.toString()}
                                        >
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select organization" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {sortedOrganizations?.map((org) => (
                                              <SelectItem
                                                key={org.id}
                                                value={org.id.toString()}
                                              >
                                                {org.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <input
                                          type="hidden"
                                          name="organizationId"
                                          value={group.organizationId.toString()}
                                        />
                                      )}
                                      <Select
                                        name="status"
                                        defaultValue={
                                          group.status?.toString() || "1"
                                        }
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="1">
                                            Active
                                          </SelectItem>
                                          <SelectItem value="0">
                                            Inactive
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <div className="flex items-center space-x-2">
                                        <Checkbox
                                          id={`edit-competitive-${group.id}`}
                                          name="competitive"
                                          defaultChecked={group.competitive || false}
                                        />
                                        <label
                                          htmlFor={`edit-competitive-${group.id}`}
                                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                        >
                                          Competitive
                                        </label>
                                      </div>
                                      <div className="flex gap-2">
                                        <Button
                                          type="submit"
                                          size="sm"
                                          disabled={
                                            updateGroupMutation.isPending
                                          }
                                        >
                                          {updateGroupMutation.isPending && (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          )}
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
                                      <CardDescription>
                                        {group.description}
                                      </CardDescription>
                                      <p className="text-sm mt-2">
                                        <span className="font-medium">
                                          Status:{" "}
                                        </span>
                                        <span
                                          className={
                                            group.status === 1
                                              ? "text-green-600"
                                              : "text-red-600"
                                          }
                                        >
                                          {group.status === 1
                                            ? "Active"
                                            : "Inactive"}
                                        </span>
                                      </p>
                                      <div className="flex items-center space-x-2 mt-2">
                                        <Checkbox
                                          id={`competitive-${group.id}`}
                                          checked={
                                            optimisticGroups[group.id]?.competitive !== undefined
                                              ? !!optimisticGroups[group.id].competitive
                                              : !!group.competitive
                                          }
                                          onCheckedChange={(checked) => {
                                            updateGroupMutation.mutate({
                                              groupId: group.id,
                                              data: {
                                                competitive: checked === true,
                                              },
                                            });
                                          }}
                                        />
                                        <label
                                          htmlFor={`competitive-${group.id}`}
                                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                        >
                                          Competitive
                                        </label>
                                      </div>
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
                                    onClick={() =>
                                      deleteGroupMutation.mutate(group.id)
                                    }
                                    disabled={deleteGroupMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <p className="text-sm">
                                <span className="font-medium">
                                  Organization:{" "}
                                </span>
                                {sortedOrganizations?.find(
                                  (o) => o.id === group.organizationId,
                                )?.name || "Unknown"}
                              </p>
                              <p className="text-sm">
                                <span className="font-medium">Members: </span>
                                {sortedUsers?.filter((u) => {
                                  const userTeam = sortedTeams?.find(
                                    (t) => t.id === u.teamId,
                                  );
                                  return (
                                    userTeam && userTeam.groupId === group.id
                                  );
                                }).length || 0}
                              </p>
                              <p className="text-sm">
                                <span className="font-medium">Teams: </span>
                                {sortedTeams?.filter(
                                  (t) => t.groupId === group.id,
                                ).length || 0}
                              </p>
                              <div className="mt-4 pt-4 border-t">
                                <p className="text-sm font-medium mb-2">Invite Codes:</p>
                                <div className="space-y-2">
                                  <InviteQRCode
                                    type="group_admin"
                                    id={group.id}
                                    name={group.name}
                                  />
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
              )}

              {/* Teams Section - Show for admins and group admins */}
              {(currentUser?.isAdmin || currentUser?.isGroupAdmin) && !currentUser?.isTeamLead && (
                <Collapsible 
                  open={teamsPanelOpen} 
                  onOpenChange={setTeamsPanelOpen}
                  className="w-full border rounded-lg p-4 min-h-[60px]"
                >
                <div className="mb-4">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="p-0 h-auto text-2xl font-semibold hover:bg-transparent hover:text-primary mb-4"
                    >
                      Teams
                      <ChevronDown className={`h-5 w-5 ml-2 transition-transform ${teamsPanelOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2 mb-4">
                      <Checkbox
                        id="show-inactive-teams"
                        checked={showInactiveTeams}
                        onCheckedChange={(checked) => setShowInactiveTeams(checked === true)}
                      />
                      <Label
                        htmlFor="show-inactive-teams"
                      >
                        Show inactive teams
                      </Label>
                    </div>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          className="mb-4 px-3 bg-violet-700 text-white hover:bg-violet-800"
                        >
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
                          <DialogTitle className="w-full text-center">
                            Create New Team
                          </DialogTitle>
                        </div>
                        <Form {...form}>
                          <form
                            onSubmit={form.handleSubmit((data) =>
                              createTeamMutation.mutate(data),
                            )}
                            className="space-y-4"
                          >
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
                                    {currentUser?.isGroupAdmin && !currentUser?.isAdmin ? (
                                      // Group Admins see their group as read-only text
                                      <div className="px-3 py-2 border rounded-md bg-muted text-sm">
                                        {filteredGroups[0]?.name || 'Your Group'}
                                      </div>
                                    ) : (
                                      // Full Admins see dropdown with all groups
                                      <Select
                                        value={field.value && field.value > 0 ? field.value.toString() : undefined}
                                        onValueChange={(value) =>
                                          field.onChange(parseInt(value))
                                        }
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select a group" />
                                        </SelectTrigger>
                                        <SelectContent className="z-[9999]">
                                          {!sortedGroups || sortedGroups.length === 0 ? (
                                            <div className="px-3 py-2 text-sm text-muted-foreground">
                                              No groups available
                                            </div>
                                          ) : (
                                            sortedGroups.map((group) => (
                                              <SelectItem
                                                key={group.id}
                                                value={group.id.toString()}
                                              >
                                                {group.name} (Org:{" "}
                                                {
                                                  sortedOrganizations?.find(
                                                    (o) =>
                                                      o.id === group.organizationId,
                                                  )?.name
                                                }
                                                )
                                              </SelectItem>
                                            ))
                                          )}
                                        </SelectContent>
                                      </Select>
                                    )}
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
                                      onChange={(e) =>
                                        field.onChange(parseInt(e.target.value))
                                      }
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <Button
                              type="submit"
                              disabled={createTeamMutation.isPending}
                            >
                              {createTeamMutation.isPending
                                ? "Creating..."
                                : "Create Team"}
                            </Button>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                    {visibleTeams?.map((team) => (
                      <Card key={team.id}>
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              {editingTeam?.id === team.id ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const formData = new FormData(
                                      e.currentTarget,
                                    );
                                    const name = formData.get("name") as string;
                                    const description = formData.get(
                                      "description",
                                    ) as string;
                                    const maxSize =
                                      parseInt(
                                        formData.get("maxSize") as string,
                                      ) || 6;
                                    const groupId = selectedGroupId
                                      ? parseInt(selectedGroupId)
                                      : undefined;
                                    const statusValue = formData.get(
                                      "status",
                                    ) as string;
                                    const parsedStatus = statusValue
                                      ? parseInt(statusValue)
                                      : 1;
                                    const status =
                                      parsedStatus === 0 || parsedStatus === 1
                                        ? parsedStatus
                                        : 1;

                                    if (!name || !selectedGroupId) {
                                      toast({
                                        title: "Error",
                                        description:
                                          "Please fill in all required fields",
                                        variant: "destructive",
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
                                      },
                                    });
                                  }}
                                >
                                  <div className="space-y-2">
                                    <Input
                                      name="name"
                                      defaultValue={team.name}
                                      className="font-semibold"
                                    />
                                    <Textarea
                                      name="description"
                                      defaultValue={team.description || ""}
                                      className="text-sm"
                                    />
                                    <Select
                                      value={selectedGroupId}
                                      onValueChange={setSelectedGroupId}
                                    >
                                      <SelectTrigger className="w-full">
                                        <SelectValue placeholder="Select a group" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {filteredGroups?.map((group) => (
                                          <SelectItem
                                            key={group.id}
                                            value={group.id.toString()}
                                          >
                                            {group.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Input
                                      name="maxSize"
                                      type="number"
                                      min="1"
                                      defaultValue={
                                        team.maxSize?.toString() || "6"
                                      }
                                      placeholder="Maximum team size"
                                      className="text-sm"
                                    />
                                    <Select
                                      name="status"
                                      defaultValue={
                                        team.status?.toString() || "1"
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="1">
                                          Active
                                        </SelectItem>
                                        <SelectItem value="0">
                                          Inactive
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <div className="flex gap-2">
                                      <Button type="submit" size="sm">
                                        Save
                                      </Button>
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
                                    <CardTitle className="text-lg">
                                      {team.name}
                                    </CardTitle>
                                  </div>
                                  <CardDescription className="line-clamp-2 text-sm">
                                    {team.description}
                                  </CardDescription>
                                  <p className="text-sm mt-2">
                                    <span className="font-medium">
                                      Status:{" "}
                                    </span>
                                    <span
                                      className={
                                        team.status === 1
                                          ? "text-green-600"
                                          : "text-red-600"
                                      }
                                    >
                                      {team.status === 1
                                        ? "Active"
                                        : "Inactive"}
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
                                  setSelectedGroupId(
                                    team.groupId?.toString() || "",
                                  );
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogTitle>
                                    Delete Team?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete the team "
                                    {team.name}"? This action cannot be undone.
                                    {sortedUsers?.filter(
                                      (u) => u.teamId === team.id,
                                    ).length > 0 && (
                                      <p className="mt-2 text-amber-600 font-medium">
                                        Warning: This team has{" "}
                                        {
                                          sortedUsers?.filter(
                                            (u) => u.teamId === team.id,
                                          ).length
                                        }{" "}
                                        members. Deleting it will remove these
                                        users from the team.
                                      </p>
                                    )}
                                  </AlertDialogDescription>
                                  <div className="flex items-center justify-end gap-2 mt-4">
                                    <AlertDialogCancel className="h-10 px-4 py-2 flex items-center justify-center">
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 hover:bg-red-700 text-white h-10 px-4 py-2 flex items-center justify-center"
                                      onClick={() =>
                                        deleteTeamMutation.mutate(team.id)
                                      }
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
                            {sortedGroups?.find((g) => g.id === team.groupId)
                              ?.name || "No Group"}
                          </p>
                          <p className="text-sm">
                            <span className="font-medium">Members: </span>
                            {filteredUsers.filter((u) => u.teamId === team.id)
                              .length || 0}
                          </p>
                          <p className="text-sm">
                            <span className="font-medium">Max Size: </span>
                            {team.maxSize || 6}
                          </p>
                          <p className="text-sm">
                            <span className="font-medium">Status: </span>
                            <span
                              className={
                                team.status === 1
                                  ? "text-green-600"
                                  : "text-red-600"
                              }
                            >
                              {team.status === 1 ? "Active" : "Inactive"}
                            </span>
                          </p>
                          <div className="mt-4 pt-4 border-t">
                            <p className="text-sm font-medium mb-2">Invite Codes:</p>
                            <div className="space-y-2">
                              <InviteQRCode
                                type="team_admin"
                                id={team.id}
                                name={team.name}
                              />
                              <InviteQRCode
                                type="team_member"
                                id={team.id}
                                name={team.name}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
              )}

              <Collapsible 
                open={usersPanelOpen} 
                onOpenChange={setUsersPanelOpen}
                className="w-full border rounded-lg p-4 min-h-[60px]"
              >
                <div className="mb-4">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="p-0 h-auto text-2xl font-semibold hover:bg-transparent hover:text-primary mb-4"
                    >
                      Users
                      <ChevronDown className={`h-5 w-5 ml-2 transition-transform ${usersPanelOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2 mb-4">
                        <Checkbox
                          id="show-inactive-users"
                          checked={showInactiveUsers}
                          onCheckedChange={(checked) => setShowInactiveUsers(checked === true)}
                        />
                        <Label
                          htmlFor="show-inactive-users"
                        >
                          Show inactive users
                        </Label>
                      </div>
                      {/* Search and Filter Section */}
                      <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
                        <h3 className="text-lg font-medium">
                          Search & Filter Users
                        </h3>
                        <div className={`grid grid-cols-1 gap-4 ${currentUser?.isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                          {/* Only show Organization dropdown for Full Admins */}
                          {currentUser?.isAdmin && (
                            <div>
                              <label className="block text-sm font-medium mb-2">
                                Organization
                              </label>
                              <Select
                                value={selectedOrgFilter}
                                onValueChange={setSelectedOrgFilter}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="All Organizations" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">
                                    All Organizations
                                  </SelectItem>
                                  {sortedOrganizations?.map((org) => (
                                    <SelectItem
                                      key={org.id}
                                      value={org.id.toString()}
                                    >
                                      {org.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          {/* Group Admins see their group name but can't change it */}
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Group
                            </label>
                            {currentUser?.isGroupAdmin && !currentUser?.isAdmin ? (
                              <div className="px-3 py-2 border rounded-md bg-muted text-sm">
                                {filteredGroups[0]?.name || 'Your Group'}
                              </div>
                            ) : (
                              <Select
                                value={selectedGroupFilter}
                                onValueChange={setSelectedGroupFilter}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="All Groups" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="all">All Groups</SelectItem>
                                  {sortedGroups?.map((group) => (
                                    <SelectItem
                                      key={group.id}
                                      value={group.id.toString()}
                                    >
                                      {group.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">
                              Team
                            </label>
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
                                  <SelectItem
                                    key={team.id}
                                    value={team.id.toString()}
                                  >
                                    {team.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-4">
                            <div className="text-sm text-gray-600">
                              Showing {visibleUsers?.length || 0} of{" "}
                              {filteredUsersForDisplay?.length || 0} users
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // For Group Admins, reset to their group's defaults
                                if (currentUser?.isGroupAdmin && !currentUser?.isAdmin && groups) {
                                  const adminGroup = groups.find(g => g.id === currentUser.adminGroupId);
                                  if (adminGroup) {
                                    setSelectedOrgFilter(adminGroup.organizationId.toString());
                                    setSelectedGroupFilter(adminGroup.id.toString());
                                  }
                                } else {
                                  setSelectedOrgFilter("all");
                                  setSelectedGroupFilter("all");
                                }
                                setSelectedTeamFilter("all");
                              }}
                            >
                              Clear Filters
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {visibleUsers.map((user) => (
                        <Card key={user.id}>
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <div>
                                {editingUser?.id === user.id ? (
                                  <form
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        const formData = new FormData(
                                          e.currentTarget,
                                        );

                                        // Get the program start date from state or hidden input
                                        let programStartDateValue: string | null = null;
                                        if (selectedProgramStartDate[user.id]) {
                                          // Use the state value if available
                                          const offset = selectedProgramStartDate[user.id]!.getTimezoneOffset();
                                          const localDate = new Date(selectedProgramStartDate[user.id]!.getTime() - (offset * 60 * 1000));
                                          programStartDateValue = localDate.toISOString().split("T")[0];
                                        } else {
                                          // Fall back to form data
                                          programStartDateValue = formData.get("programStartDate") as string;
                                        }

                                        updateUserMutation.mutate({
                                          userId: user.id,
                                          data: {
                                            preferredName: formData.get('preferredName') as string,
                                            email: formData.get('email') as string,
                                            status: ((statusValue) => {
                                              const parsed = statusValue
                                                ? parseInt(statusValue)
                                                : 1;
                                              return parsed === 0 || parsed === 1
                                                ? parsed
                                                : 1;
                                            })(formData.get("status") as string),
                                            programStartDate: programStartDateValue ? new Date(programStartDateValue) : null,
                                          },
                                        }, {
                                          onSuccess: () => {
                                            setEditingUser(null);
                                            setSelectedProgramStartDate(prev => {
                                              const newState = { ...prev };
                                              delete newState[user.id];
                                              return newState;
                                            });
                                          }
                                        });
                                      }}
                                    >
                                    <div className="space-y-2">
                                      <div>
                                        <Label className="text-sm font-medium mb-1 block">Preferred Name</Label>
                                        <Input
                                          name="preferredName" // Changed from username to preferredName
                                          defaultValue={user.preferredName || user.username} // Use preferredName or username as fallback
                                          className="font-semibold"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-sm font-medium mb-1 block">Email</Label>
                                        <Input
                                          name="email"
                                          defaultValue={user.email}
                                          type="email"
                                          className="text-sm"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-sm font-medium mb-1 block">
                                          Program Start Date (Mondays only)
                                        </Label>
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <Button
                                              variant="outline"
                                              className="w-full justify-start text-left font-normal text-sm"
                                            >
                                              {selectedProgramStartDate[user.id]
                                                ? selectedProgramStartDate[user.id]!.toLocaleDateString()
                                                : user.programStartDate
                                                  ? (() => {
                                                      const date = new Date(user.programStartDate);
                                                      const offset = date.getTimezoneOffset();
                                                      const localDate = new Date(date.getTime() - (offset * 60 * 1000));
                                                      return localDate.toLocaleDateString();
                                                    })()
                                                  : "Select a Monday"}
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                              mode="single"
                                              selected={
                                                selectedProgramStartDate[user.id] ||
                                                (user.programStartDate ? new Date(user.programStartDate) : undefined)
                                              }
                                              onSelect={(date) => {
                                                if (date) {
                                                  // Update state to show selected date in button
                                                  setSelectedProgramStartDate(prev => ({
                                                    ...prev,
                                                    [user.id]: date
                                                  }));

                                                  // Format date as YYYY-MM-DD for hidden input
                                                  const offset = date.getTimezoneOffset();
                                                  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
                                                  const formattedDate = localDate.toISOString().split("T")[0];

                                                  // Update hidden input value
                                                  const hiddenInput = document.querySelector(`input[name="programStartDate"][data-user-id="${user.id}"]`) as HTMLInputElement;
                                                  if (hiddenInput) {
                                                    hiddenInput.value = formattedDate;
                                                  }
                                                }
                                              }}
                                              disabled={(date) => {
                                                // Only allow Mondays (getDay() === 1)
                                                return date.getDay() !== 1;
                                              }}
                                            />
                                          </PopoverContent>
                                        </Popover>
                                        <input
                                          type="hidden"
                                          name="programStartDate"
                                          data-user-id={user.id}
                                          defaultValue={
                                            user.programStartDate
                                              ? (() => {
                                                  const date = new Date(user.programStartDate);
                                                  const offset = date.getTimezoneOffset();
                                                  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
                                                  return localDate.toISOString().split("T")[0];
                                                })()
                                              : ""
                                          }
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-sm font-medium mb-1 block">Status</Label>
                                        <Select
                                          name="status"
                                          defaultValue={
                                            user.status?.toString() || "1"
                                          }
                                        >
                                          <SelectTrigger>
                                            <SelectValue placeholder="Select status" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="1">
                                              Active
                                            </SelectItem>
                                            <SelectItem value="0">
                                              Inactive
                                            </SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="flex gap-2">
                                        <Button type="submit" size="sm">
                                          Save
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setEditingUser(null);
                                            setSelectedProgramStartDate(prev => {
                                              const newState = { ...prev };
                                              delete newState[user.id];
                                              return newState;
                                            });
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
                                      <CardTitle>
                                        {user.preferredName || user.username}
                                      </CardTitle>
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
                                            <AlertDialogTitle>
                                              Are you sure?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This action cannot be undone. This
                                              will permanently delete the user
                                              account and all associated data.
                                            </AlertDialogDescription>
                                            <div className="flex items-center justify-end gap-2 mt-4">
                                              <AlertDialogCancel>
                                                Cancel
                                              </AlertDialogCancel>
                                              <AlertDialogAction
                                                className="bg-red-600 hover:bg-red-700 text-white"
                                                onClick={() =>
                                                  deleteUserMutation.mutate(
                                                    user.id,
                                                  )
                                                }
                                              >
                                                Delete User
                                              </AlertDialogAction>
                                            </div>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      <span className="font-medium">
                                        Username:
                                      </span>{" "}
                                      {user.username}
                                    </div>
                                    <CardDescription>
                                      {user.email}
                                    </CardDescription>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                      Date Joined:{" "}
                                      {new Date(
                                        user.createdAt!,
                                      ).toLocaleDateString()}
                                    </div>
                                    {user.programStartDate && (
                                      <div className="mt-1 text-sm text-muted-foreground">
                                        Program Start Date:{" "}
                                        {new Date(
                                          user.programStartDate,
                                        ).toLocaleDateString()}
                                      </div>
                                    )}
                                    <div className="mt-1 text-sm text-muted-foreground">
                                      Progress: Week{" "}
                                      {userProgress[user.id]?.week ??
                                        user.currentWeek}
                                      , Day{" "}
                                      {userProgress[user.id]?.day ??
                                        user.currentDay}
                                    </div>
                                    <p className="text-sm mt-2">
                                      <span className="font-medium">
                                        Status:{" "}
                                      </span>
                                      <span
                                        className={
                                          user.status === 1
                                            ? "text-green-600"
                                            : "text-red-600"
                                        }
                                      >
                                        {user.status === 1
                                          ? "Active"
                                          : "Inactive"}
                                      </span>
                                    </p>
                                  </>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="space-y-2">
                              <p className="text-sm font-medium">
                                Team Assignment
                              </p>
                              <Select
                                defaultValue={user.teamId?.toString() || "none"}
                                onValueChange={(value) => {
                                  const teamId =
                                    value === "none" ? null : parseInt(value);
                                  updateUserTeamMutation.mutate({
                                    userId: user.id,
                                    teamId,
                                  });
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select a team" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No Team</SelectItem>
                                  {visibleTeams?.map((team) => (
                                    <SelectItem
                                      key={team.id}
                                      value={team.id.toString()}
                                    >
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
                                    variant={
                                      user.isAdmin ? "default" : "outline"
                                    }
                                    size="sm"
                                    className={`text-xs ${user.isAdmin ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
                                    onClick={() => {
                                      // Prevent removing admin from the admin user with username "admin"
                                      if (
                                        user.username === "admin" &&
                                        user.isAdmin
                                      ) {
                                        toast({
                                          title: "Cannot Remove Admin",
                                          description:
                                            "This is the main administrator account and cannot have admin rights removed.",
                                          variant: "destructive",
                                        });
                                        return;
                                      }
                                      updateUserRoleMutation.mutate({
                                        userId: user.id,
                                        role: "isAdmin",
                                        value: !user.isAdmin,
                                      });
                                    }}
                                  >
                                    Admin
                                  </Button>
                                )}
                                {/* Group Admin button - show if current logged-in user is Admin or Group Admin */}
                                {(currentUser?.isAdmin ||
                                  currentUser?.isGroupAdmin) && (
                                  <Button
                                    variant={
                                      user.isGroupAdmin ? "default" : "outline"
                                    }
                                    size="sm"
                                    className={`text-xs ${user.isGroupAdmin ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
                                    onClick={() => {
                                      updateUserRoleMutation.mutate({
                                        userId: user.id,
                                        role: "isGroupAdmin",
                                        value: !user.isGroupAdmin,
                                      });
                                    }}
                                  >
                                    Group Admin
                                  </Button>
                                )}
                                {/* Team Lead button - show for Admin, Group Admin, or Team Lead */}
                                {(currentUser?.isAdmin ||
                                  currentUser?.isGroupAdmin ||
                                  currentUser?.isTeamLead) && (
                                  <Button
                                    variant={
                                      user.isTeamLead ? "default" : "outline"
                                    }
                                    size="sm"
                                    className={`text-xs ${user.isTeamLead ? "bg-green-600 text-white hover:bg-green-700" : ""}`}
                                    disabled={!user.teamId}
                                    onClick={() => {
                                      if (!user.teamId) {
                                        toast({
                                          title: "Team Required",
                                          description:
                                            "User must be assigned to a team before becoming a Team Lead.",
                                          variant: "destructive",
                                        });
                                        return;
                                      }
                                      updateUserRoleMutation.mutate({
                                        userId: user.id,
                                        role: "isTeamLead",
                                        value: !user.isTeamLead,
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
        <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Enter a new password for the user.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (selectedUserId && newPassword) {
                  resetPasswordMutation.mutate({
                    userId: selectedUserId,
                    newPassword,
                  });
                }
              }}
            >
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
                <Button
                  type="submit"
                  disabled={resetPasswordMutation.isPending}
                >
                  {resetPasswordMutation.isPending
                    ? "Resetting..."
                    : "Reset Password"}
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