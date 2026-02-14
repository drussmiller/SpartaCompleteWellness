import { useState, useRef } from "react";
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
      ? "Division Admin"
      : type === "group_member"
        ? "Division Member"
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
        <div className="flex flex-col items-center space-y-4 py-4 pb-8">
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
      </DialogContent>
    </Dialog>
  );
}
