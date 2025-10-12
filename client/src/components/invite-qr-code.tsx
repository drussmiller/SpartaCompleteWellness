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
      : `/api/invite-codes/team/${id}?type=${type}`;

  const { data: inviteCodes, isLoading } = useQuery<{ inviteCode: string }>({
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
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG 
                  value={currentCode} 
                  size={200} 
                  level="H"
                  data-testid={`qr-code-${type}`}
                />
              </div>
              <div className="flex items-center space-x-2 w-full">
                <div className="flex-1 bg-muted p-3 rounded-md font-mono text-sm text-center" data-testid={`text-invite-code-${type}`}>
                  {currentCode}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(currentCode)}
                  data-testid={`button-copy-${type}`}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
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
      </DialogContent>
    </Dialog>
  );
}
