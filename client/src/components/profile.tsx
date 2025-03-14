
import React from 'react';
import { User, Team } from '@shared/schema';

interface ProfileProps {
  user: User;
  teams?: Team[];
}

function UserProfile({ user, teams }: ProfileProps) {
  const userTeam = teams?.find(t => t.id === user.teamId);
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col space-y-2">
        <div className="text-sm text-muted-foreground">Email</div>
        <div className="text-sm font-medium">{user.email}</div>
      </div>
      
      <div className="flex flex-col space-y-2">
        <div className="text-sm text-muted-foreground">Team</div>
        <div className="text-sm font-medium">
          {userTeam ? userTeam.name : 'No Team Assigned'}
        </div>
      </div>
    </div>
  );
}

export default UserProfile;
