import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface TeamForInvite {
  id: number;
  name: string;
  groupId: number;
  groupName: string;
  organizationName: string;
  status: number;
}

interface SendTeamInviteDialogProps {
  recipientUserId: number;
  recipientName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendTeamInviteDialog({
  recipientUserId,
  recipientName,
  isOpen,
  onOpenChange,
}: SendTeamInviteDialogProps) {
  const { toast } = useToast();
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedRole, setSelectedRole] = useState("");

  const { data: teams = [], isLoading: teamsLoading } = useQuery<TeamForInvite[]>({
    queryKey: ["/api/teams/for-invite"],
    enabled: isOpen,
  });

  const sendInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/invite-codes/send-email", {
        recipientUserId,
        teamId: parseInt(selectedTeamId),
        role: selectedRole,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send invite");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Invite Sent",
        description: `Invite code sent to ${recipientName} for ${data.teamName}`,
      });
      resetAndClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetAndClose = () => {
    setSelectedTeamId("");
    setSelectedRole("");
    onOpenChange(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedTeamId("");
      setSelectedRole("");
    }
    onOpenChange(open);
  };

  const handleSend = () => {
    if (!selectedTeamId || !selectedRole) {
      toast({
        title: "Missing Selection",
        description: "Please select both a team and a role",
        variant: "destructive",
      });
      return;
    }
    sendInviteMutation.mutate();
  };

  const groupedTeams = teams.reduce<Record<string, TeamForInvite[]>>((acc, team) => {
    const key = `${team.organizationName} - ${team.groupName}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(team);
    return acc;
  }, {});

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Team Invite</DialogTitle>
          <DialogDescription>
            Send an invite code to <strong>{recipientName}</strong> via email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Team</Label>
            {teamsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading teams...
              </div>
            ) : teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">No teams available</p>
            ) : (
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger data-testid="select-invite-team">
                  <SelectValue placeholder="Select a team..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(groupedTeams).map(([groupLabel, groupTeams]) => (
                    <SelectGroup key={groupLabel}>
                      <SelectLabel>{groupLabel}</SelectLabel>
                      {groupTeams.map((team) => (
                        <SelectItem key={team.id} value={team.id.toString()}>
                          {team.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger data-testid="select-invite-role">
                <SelectValue placeholder="Select a role..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team_admin">Team Lead</SelectItem>
                <SelectItem value="team_member">Team Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={sendInviteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!selectedTeamId || !selectedRole || sendInviteMutation.isPending}
            data-testid="button-send-invite"
          >
            {sendInviteMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            Send Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
