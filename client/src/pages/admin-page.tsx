import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ChevronLeft, Plus, Lock, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { insertTeamSchema, type Team, type User } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottomNav } from "@/components/bottom-nav";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: teams, isLoading: teamsLoading, error: teamsError } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: users, isLoading: usersLoading, error: usersError } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const form = useForm<InsertTeam>({
    resolver: zodResolver(insertTeamSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: InsertTeam) => {
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
    mutationFn: async ({ userId, role, value }: { userId: number; role: 'isAdmin' | 'isTeamLead'; value: boolean }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { [role]: value });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update user's role");
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

  if (teamsLoading || usersLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (teamsError || usersError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-xl font-bold text-destructive">Error Loading Data</h1>
          <p className="text-muted-foreground mt-2">
            {teamsError?.message || usersError?.message || "An error occurred while loading the data"}
          </p>
        </div>
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-xl font-bold text-destructive">Access Denied</h1>
          <p className="text-muted-foreground mt-2">
            You do not have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <ScrollArea className="h-[calc(100vh-80px)]">
        <header className="sticky top-0 z-50 bg-background border-b border-border">
          <div className="p-4 flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Button>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          </div>
        </header>

        <main className="p-4 space-y-8">
          <div className="flex gap-2 mt-4 justify-center">
            <Dialog>
              <DialogTrigger asChild>
                <Button size="default" className="px-4">
                  <Plus className="h-4 w-4 mr-2" />
                  New Team
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Team</DialogTitle>
                </DialogHeader>
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
                    <Button type="submit" disabled={createTeamMutation.isPending}>
                      {createTeamMutation.isPending ? "Creating..." : "Create Team"}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Tabs defaultValue="teams">
            <TabsList className="grid grid-cols-2 mb-4">
              <TabsTrigger value="teams">Teams</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
            </TabsList>

            <TabsContent value="teams" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams?.map((team) => (
                  <Card key={team.id}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <CardTitle>{team.name}</CardTitle>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this team?")) {
                              deleteTeamMutation.mutate(team.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <CardDescription className="line-clamp-2">{team.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">
                        <span className="font-medium">Members: </span>
                        {users?.filter((u) => u.teamId === team.id).length || 0}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {users?.map((user) => (
                  <Card key={user.id}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle>{user.preferredName || user.username}</CardTitle>
                          <CardDescription>{user.email}</CardDescription>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {user.isAdmin && <Badge variant="default">Admin</Badge>}
                          {user.isTeamLead && <Badge variant="secondary">Team Lead</Badge>}
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
                            {teams?.map((team) => (
                              <SelectItem key={team.id} value={team.id.toString()}>
                                {team.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium">Roles</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant={user.isAdmin ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              updateUserRoleMutation.mutate({
                                userId: user.id,
                                role: 'isAdmin',
                                value: !user.isAdmin
                              });
                            }}
                          >
                            Admin
                          </Button>
                          <Button
                            variant={user.isTeamLead ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                              updateUserRoleMutation.mutate({
                                userId: user.id,
                                role: 'isTeamLead',
                                value: !user.isTeamLead
                              });
                            }}
                          >
                            Team Lead
                          </Button>
                        </div>
                      </div>

                      <div className="pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
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
            </TabsContent>
          </Tabs>
        </main>
      </ScrollArea>

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
              // Handle password reset
              setResetPasswordOpen(false);
              setNewPassword("");
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
              <Button type="submit">
                Reset Password
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}