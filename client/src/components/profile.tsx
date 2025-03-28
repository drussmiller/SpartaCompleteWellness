import React from 'react';
import { User, Team } from '@shared/schema';
import { useQuery } from '@tanstack/react-query';

interface ProfileProps {
  user: User;
}

function UserProfile({ user }: ProfileProps) {
  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const userTeam = teams?.find(t => t.id === user.teamId);

  return (
    <div className="space-y-4 pt-12"> {/* Added padding here */}
      <div className="flex flex-col space-y-2">
        <div className="text-sm text-muted-foreground">Email</div>
        <div className="text-sm font-medium">{user.email}</div>
      </div>

      <div className="flex flex-col space-y-2">
        <div className="text-sm text-muted-foreground">Team</div>
        <div className="text-sm font-medium">
          {userTeam?.name || 'No Team Assigned'}
        </div>
      </div>
    </div>
  );
}

export default UserProfile;