import { useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, QrCode, Loader2, ChevronDown, ChevronUp, Plus, Building2, Users, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Organization, Group, Team } from "@shared/schema";

interface InviteQRCodeProps {
  type: "group_admin" | "group_member" | "team_admin" | "team_member";
  id: number;
  name: string;
}

export function InviteQRCode({ type, id, name }: InviteQRCodeProps) {
  const [copiedQR, setCopiedQR] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const baseEndpoint =
    type === "group_admin" || type === "group_member"
      ? `/api/invite-codes/group/${id}`
      : `/api/invite-codes/team/${id}`;

  const { data: inviteCodes, isLoading } = useQuery<{ inviteCode: string }>({
    queryKey: [baseEndpoint, type],
    queryFn: async () => {
      const endpoint = `${baseEndpoint}?type=${type}&_t=${Date.now()}`;
      console.log(`[InviteQRCode] Fetching ${type} code from:`, endpoint);
      const res = await fetch(endpoint, { credentials: 'include' });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      console.log(`[InviteQRCode] Received ${type} code:`, data);
      return data;
    },
    enabled: isOpen,
  });

  const createCodeMutation = useMutation({
    mutationFn: async () => {
      const createEndpoint =
        type === "group_admin"
          ? `/api/invite-codes/group-admin/${id}`
          : type === "group_member"
            ? `/api/invite-codes/group-member/${id}`
            : type === "team_admin"
              ? `/api/invite-codes/team-admin/${id}`
              : `/api/invite-codes/team-member/${id}`;

      const res = await apiRequest("POST", createEndpoint, {});
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Invite code created successfully",
      });
      queryClient.invalidateQueries({ queryKey: [baseEndpoint, type] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCopyText = async (inviteCode: string | undefined) => {
    if (!inviteCode) {
      toast({
        title: "Error",
        description: "No invite code to copy",
        variant: "destructive",
      });
      return;
    }
    
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopiedText(true);
      toast({
        title: "Copied!",
        description: "Invite code copied to clipboard",
      });
      setTimeout(() => setCopiedText(false), 2000);
    } catch (error) {
      console.error("Copy error:", error);
      toast({
        title: "Error",
        description: "Failed to copy invite code",
        variant: "destructive",
      });
    }
  };

  const handleCopyQR = async () => {
    try {
      if (!qrRef.current) return;
      
      const svg = qrRef.current.querySelector('svg');
      if (!svg) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const svgData = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      
      img.onload = async () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob(async (blob) => {
          if (blob) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            setCopiedQR(true);
            toast({
              title: "Copied!",
              description: "QR code copied as image",
            });
            setTimeout(() => setCopiedQR(false), 2000);
          }
        });
      };
      
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy QR code image",
        variant: "destructive",
      });
    }
  };

  const roleLabel =
    type === "group_admin"
      ? "Group Admin"
      : type === "group_member"
        ? "Group Member"
        : type === "team_admin"
          ? "Team Lead"
          : "Team Member";

  const currentCode = inviteCodes?.inviteCode;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-show-qr-${type}`}>
          <QrCode className="h-4 w-4 mr-2" />
          {roleLabel} Code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{roleLabel} Invite Code</DialogTitle>
          <DialogDescription>
            Share this QR code or invite code to add someone as {roleLabel} to {name}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4 py-4">
          {isLoading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : currentCode ? (
            <>
              <div className="flex items-center space-x-2">
                <div className="bg-white p-4 rounded-lg" ref={qrRef}>
                  <QRCodeSVG 
                    value={currentCode} 
                    size={200} 
                    level="H"
                    data-testid={`qr-code-${type}`}
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyQR}
                  data-testid={`button-copy-qr-${type}`}
                >
                  {copiedQR ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center space-x-2 w-full">
                <div 
                  className="flex-1 bg-muted p-3 rounded-md font-mono text-sm text-center cursor-pointer hover:bg-muted/80 transition-colors select-none" 
                  onClick={(e) => {
                    e.preventDefault();
                    console.log("Invite code clicked:", currentCode);
                    handleCopyText(currentCode);
                  }}
                  data-testid={`text-invite-code-${type}`}
                  role="button"
                  aria-label="Click to copy invite code"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleCopyText(currentCode);
                    }
                  }}
                >
                  {currentCode}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopyText(currentCode)}
                  data-testid={`button-copy-${type}`}
                >
                  {copiedText ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Users can scan this QR code or manually enter the code to join
              </p>
            </>
          ) : (
            <Button
              onClick={() => createCodeMutation.mutate()}
              disabled={createCodeMutation.isPending}
              data-testid={`button-generate-code-${type}`}
            >
              {createCodeMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Generate {roleLabel} Invite Code
            </Button>
          )}
        </div>
        
        <JoinOrBuildTeamPanel />
      </DialogContent>
    </Dialog>
  );
}

function JoinOrBuildTeamPanel() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [showNewOrgInput, setShowNewOrgInput] = useState(false);
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [showNewTeamInput, setShowNewTeamInput] = useState(false);
  const { toast } = useToast();

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ['/api/organizations'],
    enabled: isExpanded,
  });

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ['/api/groups', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const res = await fetch(`/api/groups?organizationId=${selectedOrgId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch groups');
      return res.json();
    },
    enabled: isExpanded && !!selectedOrgId,
  });

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ['/api/teams/by-group', selectedGroupId],
    queryFn: async () => {
      if (!selectedGroupId) return [];
      const res = await fetch(`/api/teams/by-group/${selectedGroupId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch teams');
      return res.json();
    },
    enabled: isExpanded && !!selectedGroupId,
  });

  const filteredOrganizations = organizations.filter(
    org => !org.name.toLowerCase().includes('admin') && org.status === 1
  );

  const filteredGroups = groups.filter(
    group => !group.name.toLowerCase().includes('admin') && group.status === 1
  );

  const filteredTeams = teams.filter(
    team => !team.name.toLowerCase().includes('admin') && team.status === 1
  );

  const joinTeamMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      
      if (showNewOrgInput && newOrgName) {
        payload.organizationName = newOrgName;
      } else if (selectedOrgId) {
        payload.organizationId = selectedOrgId;
      }
      
      if (showNewGroupInput && newGroupName) {
        payload.groupName = newGroupName;
      } else if (selectedGroupId) {
        payload.groupId = selectedGroupId;
      }
      
      if (showNewTeamInput && newTeamName) {
        payload.teamName = newTeamName;
      } else if (selectedTeamId) {
        payload.teamId = selectedTeamId;
      }
      
      const res = await apiRequest("POST", "/api/self-service/join-team", payload);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to join team');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success!",
        description: data.message || "You are now the Team Admin!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      setIsExpanded(false);
      setSelectedOrgId(null);
      setSelectedGroupId(null);
      setSelectedTeamId(null);
      setNewOrgName("");
      setNewGroupName("");
      setNewTeamName("");
      setShowNewOrgInput(false);
      setShowNewGroupInput(false);
      setShowNewTeamInput(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const canSubmit = () => {
    const hasOrg = selectedOrgId || (showNewOrgInput && newOrgName.trim());
    const hasGroup = selectedGroupId || (showNewGroupInput && newGroupName.trim());
    const hasTeam = selectedTeamId || (showNewTeamInput && newTeamName.trim());
    return hasOrg && hasGroup && hasTeam;
  };

  const handleOrgChange = (value: string) => {
    if (value === "add-new") {
      setShowNewOrgInput(true);
      setSelectedOrgId(null);
    } else {
      setShowNewOrgInput(false);
      setNewOrgName("");
      setSelectedOrgId(parseInt(value));
    }
    setSelectedGroupId(null);
    setSelectedTeamId(null);
    setShowNewGroupInput(false);
    setShowNewTeamInput(false);
  };

  const handleGroupChange = (value: string) => {
    if (value === "add-new") {
      setShowNewGroupInput(true);
      setSelectedGroupId(null);
    } else {
      setShowNewGroupInput(false);
      setNewGroupName("");
      setSelectedGroupId(parseInt(value));
    }
    setSelectedTeamId(null);
    setShowNewTeamInput(false);
  };

  const handleTeamChange = (value: string) => {
    if (value === "add-new") {
      setShowNewTeamInput(true);
      setSelectedTeamId(null);
    } else {
      setShowNewTeamInput(false);
      setNewTeamName("");
      setSelectedTeamId(parseInt(value));
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="mt-4 border-t pt-4">
      <CollapsibleTrigger asChild>
        <Button 
          variant="ghost" 
          className="w-full flex items-center justify-between p-3 hover:bg-muted/50"
          data-testid="button-join-or-build-team"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            <span className="font-medium">Join a Team or Build Your Own</span>
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-4 pt-4">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Church or Organization
            </Label>
            {!showNewOrgInput ? (
              <Select onValueChange={handleOrgChange} value={selectedOrgId?.toString() || ""}>
                <SelectTrigger data-testid="select-organization">
                  <SelectValue placeholder="Select an organization..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredOrganizations.map((org) => (
                    <SelectItem key={org.id} value={org.id.toString()} data-testid={`org-option-${org.id}`}>
                      {org.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="add-new" className="text-primary" data-testid="org-option-add-new">
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Add new organization...
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Enter organization name..."
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  data-testid="input-new-organization"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setShowNewOrgInput(false);
                    setNewOrgName("");
                  }}
                  data-testid="button-cancel-new-org"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Group
            </Label>
            {!showNewGroupInput ? (
              <Select 
                onValueChange={handleGroupChange} 
                value={selectedGroupId?.toString() || ""}
                disabled={!selectedOrgId && !showNewOrgInput}
              >
                <SelectTrigger data-testid="select-group">
                  <SelectValue placeholder={selectedOrgId || showNewOrgInput ? "Select a group..." : "Select organization first"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id.toString()} data-testid={`group-option-${group.id}`}>
                      {group.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="add-new" className="text-primary" data-testid="group-option-add-new">
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Add new group...
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Enter group name..."
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  data-testid="input-new-group"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setShowNewGroupInput(false);
                    setNewGroupName("");
                  }}
                  data-testid="button-cancel-new-group"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team
            </Label>
            {!showNewTeamInput ? (
              <Select 
                onValueChange={handleTeamChange} 
                value={selectedTeamId?.toString() || ""}
                disabled={!selectedGroupId && !showNewGroupInput}
              >
                <SelectTrigger data-testid="select-team">
                  <SelectValue placeholder={selectedGroupId || showNewGroupInput ? "Select a team..." : "Select group first"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id.toString()} data-testid={`team-option-${team.id}`}>
                      {team.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="add-new" className="text-primary" data-testid="team-option-add-new">
                    <span className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Add new team...
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Enter team name..."
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  data-testid="input-new-team"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setShowNewTeamInput(false);
                    setNewTeamName("");
                  }}
                  data-testid="button-cancel-new-team"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>

        <Button 
          className="w-full" 
          onClick={() => joinTeamMutation.mutate()}
          disabled={!canSubmit() || joinTeamMutation.isPending}
          data-testid="button-submit-join-team"
        >
          {joinTeamMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="mr-2 h-4 w-4" />
          )}
          Join Team as Admin
        </Button>
        
        <p className="text-xs text-muted-foreground text-center">
          You will become the Team Admin for the selected or newly created team.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
