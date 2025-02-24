import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Team, User } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, UserPlus, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTeamSchema } from "@shared/schema";

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const updateUserTeamMutation = useMutation({
    mutationFn: async ({ userId, teamId }: { userId: number; teamId: number }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/team`, { teamId });
      if (!res.ok) throw new Error("Failed to update user team");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User team updated successfully" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/users/${userId}`);
      if (!res.ok) throw new Error("Failed to delete user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted successfully" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: number; password: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/reset-password`, { password });
      if (!res.ok) throw new Error("Failed to reset password");
      toast({
        title: "Success",
        description: "Password has been reset successfully"
      });
      return { success: true };
    },
    onSuccess: () => {
      setResetPasswordOpen(false);
      setNewPassword("");
      setSelectedUserId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ 
        title: "Success",
        description: "User password has been reset successfully"
      });
    },
    onError: (error) => {
      toast({ 
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to reset password",
        variant: "destructive"
      });
    }
  });

  const handleResetPassword = (userId: number) => {
    setSelectedUserId(userId);
    setNewPassword("");
    setResetPasswordOpen(true);
  };

  const form = useForm({
    resolver: zodResolver(insertTeamSchema),
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: Team) => {
      const res = await apiRequest("POST", "/api/teams", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      form.reset();
      toast({
        title: "Success",
        description: "Team created successfully",
      });
    },
  });

  if (!user?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-muted-foreground">Not authorized</p>
      </div>
    );
  }

  if (!teams || !users) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <header className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Team
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
                        <Input {...field} />
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
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="flex items-center justify-between p-2 rounded hover:bg-accent cursor-pointer"
                  onClick={() => setSelectedTeam(selectedTeam === team.id ? null : team.id)}
                >
                  <div>
                    <p className="font-medium">{team.name}</p>
                    <p className="text-sm text-muted-foreground">{team.description}</p>
                  </div>
                  {selectedTeam === team.id && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {users.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center justify-between p-2 gap-2">
                  <div className="min-w-[150px]">
                    <p className="font-medium">{u.username}</p>
                    <p className="text-sm text-muted-foreground">
                      Team: {teams.find((t) => t.id === u.teamId)?.name || "None"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedTeam && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateUserTeamMutation.mutate({ userId: u.id, teamId: selectedTeam })}
                        disabled={updateUserTeamMutation.isPending}
                      >
                        {updateUserTeamMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Assign to Team"
                        )}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResetPassword(u.id)}
                    >
                      Reset Password
                    </Button>
                    <Button
                      variant={u.isAdmin ? "destructive" : "outline"}
                      size="sm"
                      onClick={async () => {
                        try {
                          await apiRequest("POST", `/api/users/${u.id}/toggle-admin`, {
                            isAdmin: !u.isAdmin
                          });
                          queryClient.invalidateQueries({ queryKey: ["/api/users"] });
                          toast({ 
                            title: "Success", 
                            description: `Admin status ${!u.isAdmin ? 'granted' : 'revoked'}`
                          });
                        } catch (error) {
                          toast({
                            title: "Error",
                            description: "Failed to update admin status",
                            variant: "destructive"
                          });
                        }
                      }}
                    >
                      {u.isAdmin ? "Remove Admin" : "Make Admin"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this user?")) {
                          deleteUserMutation.mutate(u.id);
                        }
                      }}
                    >
                      Delete User
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
          </DialogHeader>
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Button
            onClick={() => {
              if (selectedUserId) {
                resetPasswordMutation.mutate({
                  userId: selectedUserId,
                  password: newPassword,
                });
              }
            }}
            disabled={resetPasswordMutation.isPending || !newPassword}
          >
            {resetPasswordMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Reset Password
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}