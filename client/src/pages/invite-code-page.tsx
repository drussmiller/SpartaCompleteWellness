import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { Loader2, QrCode } from "lucide-react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/app-layout";

interface InviteCodePageProps {
  onClose?: () => void;
}

export default function InviteCodePage({ onClose }: InviteCodePageProps) {
  const [inviteCode, setInviteCode] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const redeemCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/redeem-invite-code", {
        inviteCode: code.trim().toUpperCase(),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to redeem invite code");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success!",
        description: `You have been added as ${data.role} to ${data.groupName || data.teamName}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setTimeout(() => {
        if (onClose) {
          onClose();
        } else {
          setLocation("/");
        }
      }, 1500);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      toast({
        title: "Error",
        description: "Please enter an invite code",
        variant: "destructive",
      });
      return;
    }
    redeemCodeMutation.mutate(inviteCode);
  };

  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Join with Invite Code</CardTitle>
            <CardDescription>
              Enter the invite code you received to join a team or become an admin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="invite-code" className="text-sm font-medium">
                  Invite Code
                </label>
                <Input
                  id="invite-code"
                  placeholder="Enter invite code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  disabled={redeemCodeMutation.isPending}
                  className="font-mono"
                  data-testid="input-invite-code"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={redeemCodeMutation.isPending}
                data-testid="button-redeem-code"
              >
                {redeemCodeMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Redeem Code
              </Button>
            </form>
            <div className="mt-6 pt-6 border-t">
              <p className="text-sm text-muted-foreground text-center">
                You can also scan a QR code if you have one
              </p>
              <div className="flex justify-center mt-4">
                <QrCode className="h-12 w-12 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                QR code scanning coming soon
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
