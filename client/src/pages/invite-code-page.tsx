import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { Loader2, QrCode, Camera, X } from "lucide-react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/app-layout";
import { Html5QrcodeScanner } from "html5-qrcode";
import { useAuth } from "@/hooks/use-auth";

interface InviteCodePageProps {
  onClose?: () => void;
}

export default function InviteCodePage({ onClose }: InviteCodePageProps) {
  const [inviteCode, setInviteCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const scannerDivRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  // If user is already a Group Admin, Team Lead, or in a team, redirect them
  useEffect(() => {
    if (user && (user.isGroupAdmin || user.isTeamLead || user.teamId)) {
      toast({
        title: "Already Assigned",
        description: "You are already a Group Admin, Team Lead, or part of a team.",
      });
      if (onClose) {
        onClose();
      } else {
        setLocation("/");
      }
    }
  }, [user, onClose, setLocation, toast]);

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

  useEffect(() => {
    if (isScanning && scannerDivRef.current) {
      scannerRef.current = new Html5QrcodeScanner(
        "qr-reader",
        { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        false
      );

      scannerRef.current.render(
        (decodedText) => {
          setInviteCode(decodedText.toUpperCase());
          setIsScanning(false);
          if (scannerRef.current) {
            scannerRef.current.clear();
          }
          toast({
            title: "QR Code Scanned",
            description: "Code captured successfully",
          });
        },
        (error) => {
          console.log("QR scan error:", error);
        }
      );
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
      }
    };
  }, [isScanning, toast]);

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

  const toggleScanner = () => {
    if (isScanning && scannerRef.current) {
      scannerRef.current.clear();
    }
    setIsScanning(!isScanning);
  };

  return (
    <AppLayout>
      <div className="flex flex-col items-center p-6 pt-4">
        <Card className="w-full max-w-md">
          <CardHeader className="relative">
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="absolute right-4 top-4 h-8 w-8"
                data-testid="button-close-invite-code"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            <CardTitle>Join with Invite Code</CardTitle>
            <CardDescription>
              Enter the invite code you received or scan a QR code to join a team or become an admin
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isScanning ? (
              <>
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
                  <p className="text-sm text-muted-foreground text-center mb-4">
                    Or scan a QR code
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={toggleScanner}
                    data-testid="button-scan-qr"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    Scan QR Code
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-medium">Scan QR Code</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleScanner}
                    data-testid="button-close-scanner"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div id="qr-reader" ref={scannerDivRef} className="w-full"></div>
                {inviteCode && (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">Scanned code:</p>
                    <p className="font-mono font-bold text-lg">{inviteCode}</p>
                    <Button
                      className="w-full mt-4"
                      onClick={() => {
                        redeemCodeMutation.mutate(inviteCode);
                        setIsScanning(false);
                      }}
                      disabled={redeemCodeMutation.isPending}
                      data-testid="button-redeem-scanned-code"
                    >
                      {redeemCodeMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Redeem Scanned Code
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
