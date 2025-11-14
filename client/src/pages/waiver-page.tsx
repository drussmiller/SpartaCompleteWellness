
import React, { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { SignaturePad } from '@/components/signature-pad';
import { ScrollArea } from '@/components/ui/scroll-area';
import { queryClient } from '@/lib/queryClient';

// Add Google Fonts link for Dancing Script
if (!document.querySelector('link[href*="Dancing+Script"]')) {
  const link = document.createElement('link');
  link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap';
  link.rel = 'stylesheet';
  document.head.appendChild(link);
}

export default function WaiverPage() {
  const { user } = useAuth();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [hasReadWaiver, setHasReadWaiver] = useState(false);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [signatureType, setSignatureType] = useState<'draw' | 'type'>('draw');
  const [typedSignature, setTypedSignature] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignatureSave = (dataURL: string) => {
    setSignature(dataURL);
    toast({
      title: "Signature captured",
      description: "Your signature has been saved.",
    });
  };

  const handleSignatureClear = () => {
    setSignature(null);
    setTypedSignature('');
  };

  const generateTypedSignature = async (name: string): Promise<string> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    canvas.width = 400;
    canvas.height = 100;
    
    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Set font and style for cursive signature
    ctx.font = '32px "Dancing Script", "Brush Script MT", cursive';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw the typed signature
    ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    
    return canvas.toDataURL('image/png');
  };

  const handleSubmit = async () => {
    const hasValidSignature = signatureType === 'draw' ? signature : typedSignature.trim();
    
    if (!hasReadWaiver || !hasAgreed || !hasValidSignature) {
      toast({
        title: "Incomplete waiver",
        description: "Please read the waiver, agree to the terms, and provide your signature.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/users/waiver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          signature: signatureType === 'draw' ? signature : await generateTypedSignature(typedSignature),
          agreedAt: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        // Update the cached user data to reflect waiver has been signed
        const updatedUser = { ...user, waiverSigned: true };
        queryClient.setQueryData(["/api/user"], updatedUser);
        
        toast({
          title: "Waiver signed successfully",
          description: "Welcome to Sparta Complete Wellness!",
        });
        setLocation('/menu');
      } else {
        throw new Error('Failed to submit waiver');
      }
    } catch (error) {
      console.error('Error submitting waiver:', error);
      toast({
        title: "Error",
        description: "Failed to submit waiver. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    setLocation('/auth');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-primary">
            Liability Waiver & Release
          </CardTitle>
          <p className="text-muted-foreground">
            Please read and sign this waiver to continue using Sparta Complete Wellness
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Waiver Content */}
          <ScrollArea className="h-64 w-full border rounded-md p-4">
            <div className="space-y-4 text-sm">
              <h3 className="font-semibold text-lg">ASSUMPTION OF RISK AND RELEASE OF LIABILITY</h3>
              
              <p>
                <strong>PLEASE READ THIS DOCUMENT CAREFULLY BEFORE SIGNING.</strong> This is a release of liability and waiver of certain legal rights.
              </p>
              
              <p>
                In consideration for being permitted to participate in Sparta Complete Wellness program activities, including but not limited to fitness training, nutritional guidance, spiritual activities, and related wellness programs (the "Activities"), I acknowledge and agree to the following:
              </p>
              
              <h4 className="font-semibold">1. ASSUMPTION OF RISK</h4>
              <p>
                I understand that participation in the Activities involves inherent risks, including but not limited to:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Risk of injury from physical exercise and fitness activities</li>
                <li>Risk of aggravation of pre-existing medical conditions</li>
                <li>Risk of equipment failure or malfunction</li>
                <li>Risk of injury from interaction with other participants</li>
                <li>Other risks that cannot be foreseen or are inherent in physical activities</li>
              </ul>
              
              <h4 className="font-semibold">2. MEDICAL CLEARANCE</h4>
              <p>
                I represent that I am in good physical condition and have no medical condition that would prevent my safe participation in the Activities. I have consulted with a physician regarding my participation in physical activities if I have any concerns about my health.
              </p>
              
              <h4 className="font-semibold">3. RELEASE OF LIABILITY</h4>
              <p>
                I hereby release, waive, discharge, and covenant not to sue Sparta Complete Wellness, its owners, operators, employees, volunteers, participants, and agents (collectively the "Released Parties") from any and all liability, claims, demands, actions, and causes of action whatsoever arising out of or related to any loss, damage, or injury that may be sustained by me while participating in the Activities.
              </p>
              
              <h4 className="font-semibold">4. INDEMNIFICATION</h4>
              <p>
                I agree to indemnify and hold harmless the Released Parties from any loss or liability incurred as a result of my participation in the Activities.
              </p>
              
              <h4 className="font-semibold">5. MEDIA RELEASE</h4>
              <p>
                I grant permission for my likeness to be captured in photographs, videos, or other media during Activities and for such media to be used for promotional purposes by Sparta Complete Wellness.
              </p>
              
              <h4 className="font-semibold">6. SMS TEXT MESSAGE NOTIFICATIONS</h4>
              <p>
                I understand that Sparta Complete Wellness may send SMS text message notifications for important program updates, daily reminders, and alerts. I may opt in or opt out of receiving these text messages at any time through my notification settings in the app. Standard message and data rates may apply. Message frequency may vary.
              </p>
              
              <h4 className="font-semibold">7. SEVERABILITY</h4>
              <p>
                If any portion of this agreement is held invalid, the remainder shall continue in full force and effect.
              </p>
              
              <p className="font-semibold">
                I HAVE READ THIS DOCUMENT AND UNDERSTAND THAT IT GIVES UP SUBSTANTIAL RIGHTS. I SIGN IT VOLUNTARILY.
              </p>
            </div>
          </ScrollArea>
          
          {/* Checkboxes */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="read-waiver" 
                checked={hasReadWaiver}
                onCheckedChange={(checked) => setHasReadWaiver(checked as boolean)}
              />
              <label htmlFor="read-waiver" className="text-sm font-medium">
                I have read and understand the entire waiver above
              </label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="agree-terms" 
                checked={hasAgreed}
                onCheckedChange={(checked) => setHasAgreed(checked as boolean)}
              />
              <label htmlFor="agree-terms" className="text-sm font-medium">
                I agree to the terms and conditions outlined in this waiver
              </label>
            </div>
          </div>
          
          {/* Signature Section */}
          <div className="space-y-4">
            <h3 className="font-semibold">Electronic Signature</h3>
            
            {/* Signature Type Selector */}
            <div className="flex gap-2 mb-4">
              <Button
                type="button"
                variant={signatureType === 'draw' ? 'default' : 'outline'}
                onClick={() => {
                  setSignatureType('draw');
                  setTypedSignature('');
                }}
                className="flex-1"
              >
                Draw Signature
              </Button>
              <Button
                type="button"
                variant={signatureType === 'type' ? 'default' : 'outline'}
                onClick={() => {
                  setSignatureType('type');
                  setSignature(null);
                }}
                className="flex-1"
              >
                Type Name
              </Button>
            </div>

            {signatureType === 'draw' ? (
              <div className="space-y-4">
                <SignaturePad 
                  onSave={handleSignatureSave}
                  onClear={handleSignatureClear}
                />
                
                {signature && (
                  <div className="space-y-2">
                    <p className="text-sm text-green-600 font-medium">✓ Signature captured</p>
                    <img src={signature} alt="Your signature" className="border rounded max-h-20" />
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="typed-signature" className="text-sm font-medium">
                    Type your full legal name
                  </label>
                  <input
                    id="typed-signature"
                    type="text"
                    value={typedSignature}
                    onChange={(e) => setTypedSignature(e.target.value)}
                    placeholder="Enter your full legal name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                
                {typedSignature.trim() && (
                  <div className="space-y-2">
                    <p className="text-sm text-green-600 font-medium">✓ Signature preview:</p>
                    <div 
                      className="border rounded p-4 bg-white text-center"
                      style={{ 
                        fontFamily: '"Dancing Script", "Brush Script MT", cursive',
                        fontSize: '32px',
                        minHeight: '80px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {typedSignature}
                    </div>
                  </div>
                )}
                
                <p className="text-sm text-gray-600">
                  Your typed name will be converted to a cursive signature style
                </p>
              </div>
            )}
          </div>
          
          {/* Submit Button */}
          <div className="flex flex-col gap-3 items-center">
            <Button 
              onClick={handleSubmit}
              disabled={!hasReadWaiver || !hasAgreed || !(signatureType === 'draw' ? signature : typedSignature.trim()) || isSubmitting}
              className="w-full max-w-md"
              size="lg"
            >
              {isSubmitting ? 'Submitting...' : 'Sign Waiver & Continue'}
            </Button>
            
            <Button 
              onClick={async () => {
                try {
                  await fetch('/api/logout', {
                    method: 'POST',
                    credentials: 'include',
                  });
                  window.location.href = '/auth';
                } catch (error) {
                  console.error('Error signing out:', error);
                  window.location.href = '/auth';
                }
              }}
              variant="outline"
              className="w-full max-w-md"
              size="lg"
            >
              Cancel
            </Button>
          </div>
          
          <p className="text-xs text-gray-500 text-center">
            By clicking "Sign Waiver & Continue", you acknowledge that you have read, understood, and agree to be bound by this waiver.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
