import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, Plus, Edit, Trash2, Users, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { insertTeamSchema, insertGroupSchema, type Team, type Group } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/app-layout";
import { z } from "zod";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";

interface TeamWithCount extends Team {
  memberCount: number;
}

interface GroupAdminPageProps {
  onClose?: () => void;
}

const teamFormSchema = insertTeamSchema.omit({ groupId: true });
type TeamFormData = z.infer<typeof teamFormSchema>;

const groupFormSchema = insertGroupSchema.omit({ organizationId: true });
type GroupFormData = z.infer<typeof groupFormSchema>;

export default function GroupAdminPage({ onClose }: GroupAdminPageProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [editTeamOpen, setEditTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithCount | null>(null);
  const [selectedProgramStartDate, setSelectedProgramStartDate] = useState<Date | undefined>(undefined);
  const [editGroupOpen, setEditGroupOpen] = useState(false);
  const [groupProgramStartDate, setGroupProgramStartDate] = useState<Date | undefined>(undefined);

  // Get group information
  const { data: group } = useQuery<Group>({
    queryKey: ["/api/group-admin/group"],
    enabled: !!user?.isGroupAdmin
  });

  // Get teams in the group
  const { data: teams, isLoading: teamsLoading } = useQuery<TeamWithCount[]>({
    queryKey: ["/api/group-admin/teams"],
    enabled: !!user?.isGroupAdmin
  });

  // Create team form
  const createForm = useForm<TeamFormData>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: "",
      description: "",
      maxSize: 6,
      programStartDate: undefined
    }
  });

  // Edit team form
  const editForm = useForm<TeamFormData>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: "",
      description: "",
      maxSize: 6,
      programStartDate: undefined
    }
  });

  // Edit group form
  const editGroupForm = useForm<GroupFormData>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: "",
      description: "",
      programStartDate: undefined,
      competitive: false
    }
  });

  // Create team mutation
  const createTeamMutation = useMutation({
    mutationFn: async (data: TeamFormData) => {
      const res = await apiRequest("POST", "/api/group-admin/teams", data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create team");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Team created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/group-admin/teams"] });
      setCreateTeamOpen(false);
      createForm.reset();
      setSelectedProgramStartDate(undefined);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Update team mutation
  const updateTeamMutation = useMutation({
    mutationFn: async ({ teamId, data }: { teamId: number; data: Partial<TeamFormData> }) => {
      const res = await apiRequest("PATCH", `/api/group-admin/teams/${teamId}`, data);
      if (!res.ok) {
        let errorMessage = "Failed to update team";
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
    onSuccess: (updatedTeam) => {
      toast({ title: "Success", description: "Team updated successfully" });
      
      // Update the teams cache with the new data
      queryClient.setQueryData(["/api/group-admin/teams"], (oldTeams: TeamWithCount[] | undefined) => {
        if (!oldTeams) return [updatedTeam];
        return oldTeams.map(team => 
          team.id === updatedTeam.id ? { ...team, ...updatedTeam } : team
        );
      });
      
      setEditTeamOpen(false);
      setEditingTeam(null);
      setSelectedProgramStartDate(undefined);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Delete team mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: number) => {
      const res = await apiRequest("DELETE", `/api/group-admin/teams/${teamId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to delete team");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Team deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/group-admin/teams"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Update group mutation
  const updateGroupMutation = useMutation({
    mutationFn: async (data: Partial<GroupFormData>) => {
      if (!group?.id) throw new Error("No group ID");
      const res = await apiRequest("PATCH", `/api/groups/${group.id}`, data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update group");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Group updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/group-admin/group"] });
      setEditGroupOpen(false);
      setGroupProgramStartDate(undefined);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleEditTeam = (team: TeamWithCount) => {
    setEditingTeam(team);
    editForm.reset({
      name: team.name,
      description: team.description || "",
      maxSize: team.maxSize || 6,
      programStartDate: team.programStartDate ? new Date(team.programStartDate) : undefined
    });
    setSelectedProgramStartDate(team.programStartDate ? new Date(team.programStartDate) : undefined);
    setEditTeamOpen(true);
  };

  const onCreateSubmit = (data: TeamFormData) => {
    createTeamMutation.mutate(data);
  };

  const onEditSubmit = (data: TeamFormData) => {
    if (!editingTeam) return;
    updateTeamMutation.mutate({
      teamId: editingTeam.id,
      data
    });
  };

  const handleEditGroup = () => {
    if (group) {
      editGroupForm.reset({
        name: group.name,
        description: group.description || "",
        competitive: group.competitive || false,
        programStartDate: group.programStartDate ? new Date(group.programStartDate) : undefined
      });
      setGroupProgramStartDate(group.programStartDate ? new Date(group.programStartDate) : undefined);
      setEditGroupOpen(true);
    }
  };

  const onEditGroupSubmit = (data: GroupFormData) => {
    updateGroupMutation.mutate(data);
  };

  // Check if user is a group admin
  if (!user?.isGroupAdmin) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>
                You need Group Admin permissions to access this page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => setLocation("/menu")}
                className="w-full"
              >
                Return to Menu
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col min-h-screen pb-20">
        {/* Main content */}
        <div className="flex-1 p-4 md:px-8">
          <div className="space-y-6">
            {/* Page title */}
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-2">Group Admin Dashboard</h1>
              {group && (
                <div className="space-y-1">
                  <p className="text-muted-foreground">
                    You are Group Admin for: <span className="font-semibold text-purple-700">{group.name}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Managing teams in this group
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4 justify-center">
              <Button 
                size="default" 
                variant="outline"
                onClick={handleEditGroup}
                data-testid="button-group-settings"
              >
                <Settings className="h-4 w-4 mr-2" />
                Group Settings
              </Button>
              <Dialog open={createTeamOpen} onOpenChange={setCreateTeamOpen}>
                <DialogTrigger asChild>
                  <Button size="default" className="px-4 bg-purple-700 text-white hover:bg-purple-800" data-testid="button-add-team">
                    <Plus className="h-4 w-4 mr-2" />
                    New Team
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Team</DialogTitle>
                </DialogHeader>
                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                    <FormField
                      control={createForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Team Name</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-team-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description (Optional)</FormLabel>
                          <FormControl>
                            <Textarea {...field} data-testid="input-team-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
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
                              data-testid="input-team-max-size"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createForm.control}
                      name="programStartDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Program Start Date (Mondays only)</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  className="w-full justify-start text-left font-normal"
                                  data-testid="button-team-program-start-date"
                                >
                                  {field.value
                                    ? new Date(field.value).toLocaleDateString()
                                    : "Select a Monday"}
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value ? new Date(field.value) : undefined}
                                onSelect={(date) => {
                                  field.onChange(date);
                                }}
                                disabled={(date) => {
                                  // Only allow Mondays (getDay() === 1)
                                  return date.getDay() !== 1;
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                          <p className="text-xs text-muted-foreground">
                            When set, new members will inherit this date as their program start date (if it hasn't passed)
                          </p>
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCreateTeamOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createTeamMutation.isPending}
                        className="bg-purple-700 text-white hover:bg-purple-800"
                        data-testid="button-create-team"
                      >
                        Create Team
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 gap-6 mt-6">
            {/* Teams Section */}
            <div className="border rounded-lg p-4">
              <h2 className="text-2xl font-semibold mb-4">Teams</h2>
              <div className="space-y-4">
                {teamsLoading ? (
                  <div className="text-center py-8">Loading teams...</div>
                ) : teams && teams.length > 0 ? (
                  teams.map((team) => (
                <Card key={team.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold">{team.name}</h3>
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {team.memberCount}/{team.maxSize || 6}
                          </Badge>
                        </div>
                        {team.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {team.description}
                          </p>
                        )}
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div>Max Size: {team.maxSize || 6} members</div>
                          {team.programStartDate && (
                            <div>Program Start: {new Date(team.programStartDate).toLocaleDateString()}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditTeam(team)}
                          data-testid={`button-edit-team-${team.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              data-testid={`button-delete-team-${team.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Team</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{team.name}"? This action cannot be undone.
                                {team.memberCount > 0 && (
                                  <div className="mt-2 p-2 bg-destructive/10 rounded text-destructive">
                                    Warning: This team has {team.memberCount} members. Move them to other teams first.
                                  </div>
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteTeamMutation.mutate(team.id)}
                                disabled={team.memberCount > 0}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
                ) : (
                  <Card>
                    <CardContent className="text-center py-8">
                      <p className="text-muted-foreground mb-4">No teams found in this group.</p>
                      <Button 
                        onClick={() => setCreateTeamOpen(true)}
                        className="bg-purple-700 text-white hover:bg-purple-800"
                      >
                        Create Your First Team
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Edit Team Dialog */}
        <Dialog open={editTeamOpen} onOpenChange={setEditTeamOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Team</DialogTitle>
              </DialogHeader>
              <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Team Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-team-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea {...field} data-testid="input-edit-team-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
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
                            data-testid="input-edit-team-max-size"
                          />
                        </FormControl>
                        <FormMessage />
                        {editingTeam && editingTeam.memberCount > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Current members: {editingTeam.memberCount}. 
                            New max size must be at least {editingTeam.memberCount}.
                          </p>
                        )}
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="programStartDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Program Start Date (Mondays only)</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className="w-full justify-start text-left font-normal"
                                data-testid="button-edit-team-program-start-date"
                              >
                                {field.value
                                  ? new Date(field.value).toLocaleDateString()
                                  : "Select a Monday"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) => {
                                field.onChange(date);
                              }}
                              disabled={(date) => {
                                // Only allow Mondays (getDay() === 1)
                                return date.getDay() !== 1;
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">
                          When set, new members will inherit this date as their program start date (if it hasn't passed)
                        </p>
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditTeamOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={updateTeamMutation.isPending}
                      className="bg-purple-700 text-white hover:bg-purple-800"
                      data-testid="button-update-team"
                    >
                      Update Team
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Edit Group Dialog */}
          <Dialog open={editGroupOpen} onOpenChange={setEditGroupOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Group Settings</DialogTitle>
              </DialogHeader>
              <Form {...editGroupForm}>
                <form onSubmit={editGroupForm.handleSubmit(onEditGroupSubmit)} className="space-y-4">
                  <FormField
                    control={editGroupForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Group Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-group-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editGroupForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea {...field} data-testid="input-edit-group-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editGroupForm.control}
                    name="programStartDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Program Start Date (Mondays only)</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className="w-full justify-start text-left font-normal"
                                data-testid="button-edit-group-program-start-date"
                              >
                                {field.value
                                  ? new Date(field.value).toLocaleDateString()
                                  : "Select a Monday"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) => {
                                field.onChange(date);
                              }}
                              disabled={(date) => {
                                // Only allow Mondays (getDay() === 1)
                                return date.getDay() !== 1;
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">
                          When set, this date will be inherited by all new members in teams that don't have their own program start date
                        </p>
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditGroupOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={updateGroupMutation.isPending}
                      className="bg-purple-700 text-white hover:bg-purple-800"
                      data-testid="button-update-group"
                    >
                      Update Group
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </AppLayout>
  );
}