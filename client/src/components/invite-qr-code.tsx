import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Copy, Check, QrCode, Loader2 } from "lucide-react";
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

interface InviteQRCodeProps {
  type: "group_admin" | "team_admin" | "team_member";
  id: number;
  name: string;
}

export function InviteQRCode({ type, id, name }: InviteQRCodeProps) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const endpoint =
    type === "group_admin"
      ? `/api/invite-codes/group/${id}`
      : `/api/invite-codes/team/${id}`;

  const { data: inviteCodes, isLoading } = useQuery({
    queryKey: [endpoint],
    enabled: isOpen,
  });

  const createCodeMutation = useMutation({
    mutationFn: async () => {
      const createEndpoint =
        type === "group_admin"
          ? `/api/invite-codes/group-admin/${id}`
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
      queryClient.invalidateQueries({ queryKey: [endpoint] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCopy = async (inviteCode: string) => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Invite code copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy invite code",
        variant: "destructive",
      });
    }
  };

  const roleLabel =
    type === "group_admin"
      ? "Group Admin"
      : type === "team_admin"
        ? "Team Admin"
        : "Team Member";

  const currentCode = inviteCodes?.find((c: any) => c.type === type)?.code;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-show-qr-${role.toLowerCase().replace(/\s+/g, '-')}`}>
          Show QR Code
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{role} Invite Code</DialogTitle>
          <DialogDescription>
            Share this QR code or invite code to add someone as {role} to {name}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4 py-4">
          <div className="bg-white p-4 rounded-lg">
            <QRCodeSVG 
              value={inviteCode} 
              size={200} 
              level="H"
              data-testid={`qr-code-${role.toLowerCase().replace(/\s+/g, '-')}`}
            />
          </div>
          <div className="flex items-center space-x-2 w-full">
            <div className="flex-1 bg-muted p-3 rounded-md font-mono text-sm text-center" data-testid={`text-invite-code-${role.toLowerCase().replace(/\s+/g, '-')}`}>
              {inviteCode}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              data-testid={`button-copy-${role.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Users can scan this QR code or manually enter the code to join
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
