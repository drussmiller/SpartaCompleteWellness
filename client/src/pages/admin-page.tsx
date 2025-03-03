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
import { insertTeamSchema, type Team, type Activity, type User, type InsertTeam } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { BottomNav } from "@/components/bottom-nav";
import { queryClient, apiRequest } from "@/lib/queryClient";


export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // Query data with proper error handling
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

  // Show loading state
  if (teamsLoading || usersLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show error state
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

  // Verify admin access
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
                  <div key={team.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-lg">{team.name}</h3>
                      <div className="flex gap-1">
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
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{team.description}</p>
                    <div className="text-sm">
                      <span className="font-medium">Members: </span>
                      {users?.filter((u) => u.teamId === team.id).length || 0}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Points</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admin</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users?.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{user.preferredName || user.username}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{user.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {teams?.find((t) => t.id === user.teamId)?.name || "No Team"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{user.points}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{user.isAdmin ? "Yes" : "No"}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedUserId(user.id);
                              setResetPasswordOpen(true);
                            }}
                          >
                            <Lock className="h-4 w-4 mr-1" />
                            Reset Password
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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