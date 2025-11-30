import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, Check } from "lucide-react";

// Registration schema
const insertUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  preferredName: z.string().optional(),
  verificationCode: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});


function RegistrationForm() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const form = useForm({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      preferredName: "",
      verificationCode: "",
    },
  });

  // Send verification code
  const sendCodeMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/auth/send-verification-code", { email });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send verification code");
      }
      return res.json();
    },
    onSuccess: () => {
      setEmailSent(true);
      setCooldown(60);
      const timer = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      toast({
        title: "Verification Code Sent",
        description: "Please check your email for the verification code",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send verification code",
        variant: "destructive",
      });
    },
  });

  // Verify code
  const verifyCodeMutation = useMutation({
    mutationFn: async ({ email, code }: { email: string; code: string }) => {
      const res = await apiRequest("POST", "/api/auth/verify-email-code", { email, code });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Invalid verification code");
      }
      return res.json();
    },
    onSuccess: () => {
      setIsVerified(true);
      toast({
        title: "Email Verified",
        description: "You can now complete your registration",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message || "Invalid verification code",
        variant: "destructive",
      });
    },
  });

  // Register user
  const registerMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertUserSchema>) => {
      const res = await apiRequest("POST", "/api/register", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create account");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Registration Successful",
        description: "Welcome to Team Fitness Tracker!",
      });
      navigate("/");
    },
    onError: (error: Error) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const handleSendCode = () => {
    const email = form.getValues("email");
    if (!email || !email.includes("@")) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }
    // Reset verification state when sending new code
    setIsVerified(false);
    setEmailSent(false);
    sendCodeMutation.mutate(email);
  };

  const handleVerifyCode = () => {
    const email = form.getValues("email");
    const code = form.getValues("verificationCode");
    if (!code || code.length !== 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter the 6-digit verification code",
        variant: "destructive",
      });
      return;
    }
    verifyCodeMutation.mutate({ email, code });
  };

  const onSubmit = (data: z.infer<typeof insertUserSchema>) => {
    if (!isVerified) {
      toast({
        title: "Email Not Verified",
        description: "Please verify your email before registering",
        variant: "destructive",
      });
      return;
    }
    registerMutation.mutate(data);
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 pt-16">
      <h2 className="text-2xl font-bold mb-6">Create Account</h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input placeholder="username" {...field} data-testid="input-username" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input 
                      type="email" 
                      placeholder="email@example.com" 
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        // Reset verification when email changes
                        if (isVerified) {
                          setIsVerified(false);
                          setEmailSent(false);
                        }
                      }}
                      data-testid="input-email" 
                    />
                  </FormControl>
                  <Button
                    type="button"
                    onClick={handleSendCode}
                    disabled={sendCodeMutation.isPending || cooldown > 0 || isVerified}
                    variant="outline"
                    size="sm"
                    data-testid="button-send-code"
                  >
                    {sendCodeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isVerified ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <>
                        <Mail className="h-4 w-4 mr-1" />
                        {cooldown > 0 ? `${cooldown}s` : "Send Code"}
                      </>
                    )}
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {emailSent && !isVerified && (
            <FormField
              control={form.control}
              name="verificationCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Verification Code</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input 
                        placeholder="Enter 6-digit code" 
                        maxLength={6}
                        {...field} 
                        data-testid="input-verification-code"
                      />
                    </FormControl>
                    <Button
                      type="button"
                      onClick={handleVerifyCode}
                      disabled={verifyCodeMutation.isPending}
                      size="sm"
                      data-testid="button-verify-code"
                    >
                      {verifyCodeMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Verify"
                      )}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="At least 8 characters" {...field} data-testid="input-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Confirm password" {...field} data-testid="input-confirm-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="preferredName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preferred Name (optional)</FormLabel>
                <FormControl>
                  <Input placeholder="How you'd like to be called" {...field} data-testid="input-preferred-name" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button 
            type="submit" 
            className="w-full" 
            disabled={!isVerified || registerMutation.isPending}
            data-testid="button-register"
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Account...
              </>
            ) : (
              "Create Account"
            )}
          </Button>
          
          <Button 
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => navigate("/auth")}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
        </form>
      </Form>
    </div>
  );
}

export default RegistrationForm;