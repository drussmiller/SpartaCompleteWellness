
import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Loader2 } from "lucide-react";

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const { data: users = [], isLoading, error } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("/api/users"),
    select: (data) => {
      return [...data].sort((a, b) => {
        const nameA = a.preferredName || a.username || '';
        const nameB = b.preferredName || b.username || '';
        return nameA.localeCompare(nameB);
      });
    }
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-6 flex justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="container py-6">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold text-red-500">Error loading users</h2>
              <p className="mt-2">{error instanceof Error ? error.message : "Unknown error occurred"}</p>
              <Button 
                className="mt-4" 
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-6">
        <h1 className="text-2xl font-bold mb-6">Users</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((user) => (
            <Card key={user.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={user.imageUrl || undefined} alt={user.username} />
                    <AvatarFallback>{user.username?.[0]?.toUpperCase() || '?'}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">{user.preferredName || user.username}</h3>
                    <p className="text-sm text-muted-foreground">Points: {user.points}</p>
                    {user.teamId && <p className="text-xs text-muted-foreground">Team ID: {user.teamId}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {users.length === 0 && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No users found</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
