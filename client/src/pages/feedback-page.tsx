import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/app-layout";
import { BottomNav } from "@/components/bottom-nav";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSwipeToClose } from "@/hooks/use-swipe-to-close";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FeedbackPageProps {
  onClose?: () => void;
}

export function FeedbackPage({ onClose }: FeedbackPageProps = {}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isSheetMode = Boolean(onClose);
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToClose({
    onSwipeRight: () => {
      if (isSheetMode && onClose) {
        onClose();
      } else {
        navigate("/menu");
      }
    }
  });

  const submitFeedbackMutation = useMutation({
    mutationFn: async (data: { subject: string; message: string }) => {
      return await apiRequest("POST", "/api/feedback", data);
    },
    onSuccess: () => {
      toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback! We'll review it shortly.",
      });
      setSubject("");
      setMessage("");
      if (isSheetMode && onClose) {
        onClose();
      } else {
        navigate("/menu");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (!user) {
    return null;
  }

  const handleBackClick = () => {
    if (isSheetMode && onClose) {
      onClose();
    } else {
      navigate("/menu");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!subject.trim() || !message.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in both subject and message fields.",
        variant: "destructive",
      });
      return;
    }

    submitFeedbackMutation.mutate({ subject, message });
  };

  return (
    <div 
      className="flex flex-col h-[100vh]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      data-swipe-enabled="true"
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border">
        <div className="flex items-center justify-between p-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBackClick}
            className="h-9 w-9"
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Feedback</h1>
          <div className="w-9" />
        </div>
      </div>

      {/* Main content area */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Share Your Feedback</h2>
            <p className="text-muted-foreground">
              We'd love to hear from you! Your feedback helps us improve Sparta Complete Wellness.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="What's your feedback about?"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={submitFeedbackMutation.isPending}
                data-testid="input-subject"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                placeholder="Tell us more..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={submitFeedbackMutation.isPending}
                className="min-h-[200px]"
                data-testid="input-message"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={submitFeedbackMutation.isPending}
              data-testid="button-submit"
            >
              {submitFeedbackMutation.isPending ? (
                <>Submitting...</>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Submit Feedback
                </>
              )}
            </Button>
          </form>
        </div>
      </ScrollArea>

      {/* Bottom Navigation - only show if not in sheet mode */}
      {!isSheetMode && (
        <div className="flex-shrink-0">
          <BottomNav />
        </div>
      )}
    </div>
  );
}
