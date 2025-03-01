
import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    select: (data) => {
      return [...data].sort((a, b) => {
        const nameA = a.preferredName || a.username || '';
        const nameB = b.preferredName || b.username || '';
        return nameA.localeCompare(nameB);
      });
    }
  });

  return (
    <div className="container py-6">
      <h1 className="text-3xl font-bold mb-6">Users</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((user) => (
          <Card key={user.id} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center p-4">
                <Avatar className="h-12 w-12 mr-4">
                  <AvatarImage src={user.imageUrl || ""} alt={user.username} />
                  <AvatarFallback>{user.username?.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{user.preferredName || user.username}</p>
                  {currentUser?.isAdmin && (
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  )}
                  <p className="text-sm">
                    <span className="text-muted-foreground">Points: </span>
                    <span className="font-medium">{user.points || 0}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
