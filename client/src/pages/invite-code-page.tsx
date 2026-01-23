import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, X, ChevronDown, ChevronUp, Plus, Building2, Users, UserPlus, Heart, DollarSign, CheckCircle } from "lucide-react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/app-layout";
import QrScanner from "qr-scanner";
import { useAuth } from "@/hooks/use-auth";
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
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

interface InviteCodePageProps {
  onClose?: () => void;
}

export default function InviteCodePage({ onClose }: InviteCodePageProps) {
  const [inviteCode, setInviteCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const scannerRef = useRef<QrScanner | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { user } = useAuth();
  
  // Check if user has posted an introductory video
  const { data: introVideoPosts = [] } = useQuery({
    queryKey: ["/api/posts", "introductory_video", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const response = await fetch(`/api/posts?type=introductory_video&userId=${user.id}`, {
        credentials: 'include'
      });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : (data.posts ?? []);
    },
    enabled: !!user,
    staleTime: 30000,
  });
  
  const hasPostedIntroVideo = introVideoPosts.length > 0;
  
  // Check if autonomous mode is enabled (admin setting)
  const { data: autonomousModeData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/autonomous-mode"],
    staleTime: 60000,
  });
  
  const isAutonomousModeEnabled = autonomousModeData?.enabled ?? false;
  
  // Check if user has donated (allows autonomous mode for that specific user)
  const userHasDonated = user?.hasDonated ?? false;
  const userHasNoTeam = !user?.teamId;

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
        tzOffset: new Date().getTimezoneOffset(), // Send user's timezone offset in minutes
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
        description: `You have been added as ${data.role} to ${data.displayName || data.teamName || data.groupName}`,
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
    if (isScanning && videoRef.current) {
      scannerRef.current = new QrScanner(
        videoRef.current,
        (result) => {
          setInviteCode(result.data.toUpperCase());
          setIsScanning(false);
          if (scannerRef.current) {
            scannerRef.current.stop();
          }
          toast({
            title: "QR Code Scanned",
            description: "Code captured successfully",
          });
        },
        {
          highlightScanRegion: true,
          highlightCodeOutline: true,
        }
      );

      scannerRef.current.start().catch((error) => {
        console.error("QR scan error:", error);
        toast({
          title: "Camera Error",
          description: "Failed to access camera",
          variant: "destructive",
        });
      });
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current.destroy();
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
      scannerRef.current.stop();
    }
    setIsScanning(!isScanning);
  };

  return (
    <AppLayout>
      <div className="flex flex-col items-center p-4 pt-2 pb-24">
        <Card className="w-full max-w-md">
          <CardHeader className="relative pb-4">
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
            <CardDescription className="mb-0">
              Enter the invite code you received or scan a QR code to join the program.
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
                    Scan QR Code
                  </Button>
                </div>
                
                {/* Donation section for users without a team */}
                {userHasNoTeam && !userHasDonated && (
                  <DonationSection />
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
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
                <div className="w-full max-w-sm mx-auto overflow-hidden rounded-lg bg-black">
                  <video ref={videoRef} className="w-full h-auto"></video>
                </div>
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
        
        {hasPostedIntroVideo && (isAutonomousModeEnabled || (userHasDonated && userHasNoTeam)) && <JoinOrBuildTeamPanel />}
      </div>
    </AppLayout>
  );
}

function DonationSection() {
  const [donationAmount, setDonationAmount] = useState("25");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch('/api/stripe/publishable-key')
      .then(res => res.json())
      .then(data => {
        if (data.publishableKey) {
          setStripePromise(loadStripe(data.publishableKey));
        }
      })
      .catch(err => console.error('Failed to load Stripe key:', err));
  }, []);

  const handleStartPayment = async () => {
    const amount = parseFloat(donationAmount);
    if (isNaN(amount) || amount < 1) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a donation amount of at least $1.00",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingIntent(true);
    try {
      const response = await apiRequest('POST', '/api/stripe/create-payment-intent', {
        amount: Math.round(amount * 100),
      });
      const data = await response.json();

      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.paymentIntentId);
      } else {
        throw new Error(data.error || 'Failed to initialize payment');
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreatingIntent(false);
    }
  };

  const handlePaymentSuccess = () => {
    setPaymentSuccess(true);
    queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    toast({
      title: "Thank you!",
      description: "Your donation was successful. You can now create your own team!",
    });
  };

  if (paymentSuccess) {
    return (
      <div className="mt-6 pt-6 border-t">
        <div className="text-center py-4">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <p className="text-lg font-medium text-green-700">Thank you for your donation!</p>
          <p className="text-sm text-muted-foreground mt-2">
            You can now create your own Organization, Group, and Team.
          </p>
        </div>
      </div>
    );
  }

  if (clientSecret && stripePromise && paymentIntentId) {
    return (
      <div className="mt-6 pt-6 border-t">
        <p className="text-sm text-muted-foreground text-center mb-4">
          Complete your ${donationAmount} donation
        </p>
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <PaymentForm 
            paymentIntentId={paymentIntentId} 
            onSuccess={handlePaymentSuccess}
            onCancel={() => {
              setClientSecret(null);
              setPaymentIntentId(null);
            }}
          />
        </Elements>
      </div>
    );
  }

  return (
    <div className="mt-6 pt-6 border-t">
      <p className="text-sm text-muted-foreground text-center mb-4">
        Want to start your own team? Make a donation to unlock the ability to create your own Organization, Group, and Team.
      </p>
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="number"
            min="1"
            step="1"
            value={donationAmount}
            onChange={(e) => setDonationAmount(e.target.value)}
            placeholder="Amount"
            className="pl-8"
            disabled={isCreatingIntent}
          />
        </div>
        <Button
          variant="default"
          onClick={handleStartPayment}
          disabled={isCreatingIntent || !stripePromise}
          data-testid="button-donate"
        >
          {isCreatingIntent ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Heart className="mr-2 h-4 w-4" />
          )}
          Donate
        </Button>
      </div>
      <div className="flex gap-2 justify-center">
        {[10, 25, 50, 100].map((amount) => (
          <Button
            key={amount}
            variant="outline"
            size="sm"
            onClick={() => setDonationAmount(String(amount))}
            disabled={isCreatingIntent}
          >
            ${amount}
          </Button>
        ))}
      </div>
    </div>
  );
}

function PaymentForm({ 
  paymentIntentId, 
  onSuccess, 
  onCancel 
}: { 
  paymentIntentId: string; 
  onSuccess: () => void; 
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (error) {
      setErrorMessage(error.message || 'Payment failed');
      setIsProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      try {
        const response = await apiRequest('POST', '/api/stripe/confirm-donation', {
          paymentIntentId: paymentIntentId,
        });
        const data = await response.json();
        
        if (data.success) {
          onSuccess();
        } else {
          throw new Error(data.error || 'Failed to confirm donation');
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Payment succeeded but failed to update your account. Please contact support.",
          variant: "destructive",
        });
      }
    }

    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="min-h-[200px]">
        <PaymentElement options={{
          layout: 'tabs'
        }} />
      </div>
      {errorMessage && (
        <p className="text-sm text-red-500 text-center">{errorMessage}</p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1"
        >
          {isProcessing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Heart className="mr-2 h-4 w-4" />
          )}
          Complete Donation
        </Button>
      </div>
    </form>
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
  const [, setLocation] = useLocation();

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
      setTimeout(() => {
        setLocation("/");
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
    <Card className="w-full max-w-md mt-4">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                <CardTitle className="text-lg">Join a Team or Build Your Own</CardTitle>
              </div>
              {isExpanded ? (
                <ChevronUp className="h-5 w-5" />
              ) : (
                <ChevronDown className="h-5 w-5" />
              )}
            </div>
            <CardDescription>
              Select an existing team or create a new organization, group, and team
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
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
              {showNewTeamInput && newTeamName.trim() ? "Create Team as Team Lead" : "Join Team"}
            </Button>
            
            <p className="text-xs text-muted-foreground text-center">
              {showNewTeamInput && newTeamName.trim() 
                ? "You will become the Team Lead for the newly created team."
                : "You will join the selected team as a member."}
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
