import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, Plus, Edit, Trash2, Users, Settings, UserCheck, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { insertTeamSchema, type Team, type Group } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/app-layout";
import { z } from "zod";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface TeamWithCount extends Team {
  memberCount: number;
}

interface UserInGroup {
  id: number;
  username: string;
  email: string;
  imageUrl: string | null;
  isTeamLead: boolean;
  teamId: number | null;
  teamJoinedAt: Date | null;
  teamName: string | null;
}

interface GroupAdminPageProps {
  onClose?: () => void;
}

const teamFormSchema = insertTeamSchema.omit({ groupId: true });
type TeamFormData = z.infer<typeof teamFormSchema>;

export default function GroupAdminPage({ onClose }: GroupAdminPageProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [editTeamOpen, setEditTeamOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithCount | null>(null);
  const [moveUserOpen, setMoveUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserInGroup | null>(null);
  const [targetTeamId, setTargetTeamId] = useState("");

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

  // Get users in the group
  const { data: users, isLoading: usersLoading } = useQuery<UserInGroup[]>({
    queryKey: ["/api/group-admin/users"],
    enabled: !!user?.isGroupAdmin
  });

  // Move user mutation
  const moveUserMutation = useMutation({
    mutationFn: async ({ userId, teamId }: { userId: number; teamId: number }) => {
      const res = await apiRequest("PATCH", `/api/group-admin/users/${userId}/team`, { teamId });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to move user");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User moved successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/group-admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/group-admin/teams"] });
      setMoveUserOpen(false);
      setSelectedUser(null);
      setTargetTeamId("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: number; data: { isTeamLead: boolean } }) => {
      const res = await apiRequest("PATCH", `/api/group-admin/users/${userId}`, data);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update user");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "User updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/group-admin/users"] });
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Create team form
  const createForm = useForm<TeamFormData>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: "",
      description: "",
      maxSize: 6
    }
  });

  // Edit team form
  const editForm = useForm<TeamFormData>({
    resolver: zodResolver(teamFormSchema),
    defaultValues: {
      name: "",
      description: "",
      maxSize: 6
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
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update team");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Team updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/group-admin/teams"] });
      setEditTeamOpen(false);
      setEditingTeam(null);
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

  const handleEditTeam = (team: TeamWithCount) => {
    setEditingTeam(team);
    editForm.reset({
      name: team.name,
      description: team.description || "",
      maxSize: team.maxSize || 6
    });
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

  const onMoveUserSubmit = () => {
    if (!selectedUser || !targetTeamId) return;
    moveUserMutation.mutate({
      userId: selectedUser.id,
      teamId: parseInt(targetTeamId)
    });
  };

  const onToggleTeamLead = (user: UserInGroup, newValue: boolean) => {
    updateUserMutation.mutate({
      userId: user.id,
      data: { isTeamLead: newValue }
    });
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
                <p className="text-muted-foreground">
                  Managing teams for <span className="font-semibold">{group.name}</span>
                </p>
              )}
            </div>

            <Tabs defaultValue="teams" className="space-y-4">
              <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
                <TabsTrigger value="teams" data-testid="tab-teams"><Users className="h-4 w-4 mr-2"/>Teams</TabsTrigger>
                <TabsTrigger value="users" data-testid="tab-users"><UserCheck className="h-4 w-4 mr-2"/>Users</TabsTrigger>
              </TabsList>
              <TabsContent value="teams">
                <div className="flex gap-2 mt-4 justify-center">
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
                        <div className="text-xs text-muted-foreground">
                          Max Size: {team.maxSize || 6} members
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

        </TabsContent>
        <TabsContent value="users">
          {usersLoading ? (
            <div className="text-center py-8">Loading users...</div>
          ) : (
            <div className="border rounded-lg p-4">
              <h2 className="text-2xl font-semibold mb-4">Users</h2>
              <Table data-testid="table-users">
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(users ?? []).map(u => (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={u.imageUrl || ''} />
                            <AvatarFallback>{u.username?.[0]?.toUpperCase() || '?'}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium" data-testid={`text-username-${u.id}`}>{u.username}</div>
                            <div className="text-xs text-muted-foreground">{u.teamJoinedAt ? new Date(u.teamJoinedAt).toLocaleDateString() : '—'}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-email-${u.id}`}>{u.email}</TableCell>
                      <TableCell data-testid={`text-team-${u.id}`}>{u.teamName ?? 'Unassigned'}</TableCell>
                      <TableCell>
                        <Switch checked={u.isTeamLead} onCheckedChange={(v) => onToggleTeamLead(u, v)} data-testid={`switch-team-lead-${u.id}`} />
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => { setSelectedUser(u); setTargetTeamId(''); setMoveUserOpen(true); }} data-testid={`button-move-user-${u.id}`}>Move <ArrowRight className="h-4 w-4 ml-1" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

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

          {/* Move User Dialog */}
          <Dialog open={moveUserOpen} onOpenChange={setMoveUserOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Move User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground">User</div>
                  <div className="font-medium" data-testid="text-move-username">{selectedUser?.username}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Target Team</div>
                  <Select value={targetTeamId} onValueChange={setTargetTeamId}>
                    <SelectTrigger data-testid="select-target-team">
                      <SelectValue placeholder="Select a team" />
                    </SelectTrigger>
                    <SelectContent>
                      {(teams ?? []).filter(t => t.id !== selectedUser?.teamId).map(t => (
                        <SelectItem key={t.id} value={String(t.id)} data-testid={`select-item-team-${t.id}`}>
                          {t.name} ({t.memberCount}/{t.maxSize || 6})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setMoveUserOpen(false)} data-testid="button-cancel-move">Cancel</Button>
                <Button onClick={onMoveUserSubmit} disabled={!targetTeamId || moveUserMutation.isPending} className="bg-purple-700 text-white hover:bg-purple-800" data-testid="button-confirm-move">Move</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </AppLayout>
  );
}