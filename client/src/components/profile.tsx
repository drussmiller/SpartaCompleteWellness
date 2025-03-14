import React from 'react';

function UserProfile({ user, teams }) {
  return (
    <div>
      {/* ... other profile details ... */}
      <div className="text-sm">
            {user.email}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Team: {user.teamId ? teams?.find(t => t.id === user.teamId)?.name || 'Loading...' : 'No Team'}
          </div>
      {/* ... rest of the profile details ... */}
    </div>
  );
}

export default UserProfile;