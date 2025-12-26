import { useAuth } from "@/hooks/use-auth";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InsertUser, insertUserSchema } from "@shared/schema";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type LoginForm = {
  username: string; // Will be used for either username or email
  password: string;
};

const forgotPasswordSchema = z.object({
  userIdentifier: z.string().min(1, "User ID or Preferred Name is required"),
  verificationCode: z.string().optional(),
  newPassword: z.string().optional(),
  confirmPassword: z.string().optional(),
}).refine(
  (data) => !data.newPassword || data.newPassword === data.confirmPassword,
  {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  }
);

export default function AuthPage() {
  const { user, loginMutation } = useAuth();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");

  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(insertUserSchema.pick({ username: true, password: true })),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const forgotPasswordForm = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onChange",
    defaultValues: {
      userIdentifier: "",
      verificationCode: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const sendResetCodeMutation = useMutation({
    mutationFn: async (userIdentifier: string) => {
      const res = await apiRequest("POST", "/api/auth/send-reset-code", { userIdentifier });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send reset code");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCodeSent(true);
      if (data.email) {
        setMaskedEmail(data.email);
      }
      toast({
        title: "Code Sent",
        description: "A password reset code has been sent to your email. Please check your inbox.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send reset code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: { userIdentifier: string; code: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/auth/verify-reset-code", {
        userIdentifier: data.userIdentifier,
        code: data.code,
        newPassword: data.newPassword,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to reset password");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your password has been reset. You can now log in with your new password.",
      });
      setShowForgotPassword(false);
      setCodeSent(false);
      setMaskedEmail("");
      forgotPasswordForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">Sparta Complete Wellness</CardTitle>
          </CardHeader>
          <CardContent>
                {!showForgotPassword ? (
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
                      <FormField
                        control={loginForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name or Email</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="Enter your name or email" 
                                autoComplete="username"
                                data-testid="input-username"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loginForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input 
                                type="password" 
                                {...field} 
                                data-testid="input-password"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      {loginMutation.error && (
                        <p className="text-red-500 text-sm mb-2">
                          Please check your username/email and password and try again.
                        </p>
                      )}
                      <Button type="submit" className="w-full" disabled={loginMutation.isPending} data-testid="button-login">
                        {loginMutation.isPending ? "Logging in..." : "Login"}
                      </Button>
                      <Button 
                        type="button" 
                        variant="link" 
                        className="w-full" 
                        onClick={() => {
                          setShowForgotPassword(true);
                          setCodeSent(false);
                          setMaskedEmail("");
                          forgotPasswordForm.reset({
                            userIdentifier: "",
                            verificationCode: "",
                            newPassword: "",
                            confirmPassword: "",
                          });
                        }}
                        data-testid="button-forgot-password"
                      >
                        Forgot Password?
                      </Button>
                    </form>
                  </Form>
                ) : (
                  <Form {...forgotPasswordForm} key="forgot-password-form">
                    <form onSubmit={forgotPasswordForm.handleSubmit((data) => {
                      if (!codeSent) {
                        sendResetCodeMutation.mutate(data.userIdentifier);
                      } else {
                        resetPasswordMutation.mutate({
                          userIdentifier: data.userIdentifier,
                          code: data.verificationCode || "",
                          newPassword: data.newPassword || "",
                        });
                      }
                    })} className="space-y-4">
                      <div className="mb-4">
                        <h3 className="font-semibold text-lg mb-2">Reset Password</h3>
                        <p className="text-sm text-muted-foreground">
                          {!codeSent 
                            ? "Enter your User ID or Preferred Name and we'll send a verification code to your registered email address."
                            : `A verification code has been sent to ${maskedEmail || "your email"}. Enter the code and your new password below.`
                          }
                        </p>
                      </div>
                      <FormField
                        control={forgotPasswordForm.control}
                        name="userIdentifier"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>User ID or Preferred Name</FormLabel>
                            <FormControl>
                              <Input 
                                {...field}
                                placeholder="Enter your User ID or Preferred Name"
                                data-testid="input-reset-identifier"
                                disabled={codeSent}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      {!codeSent ? (
                        <div className="flex gap-2">
                          <Button 
                            type="submit" 
                            className="flex-1" 
                            disabled={sendResetCodeMutation.isPending}
                            data-testid="button-send-code"
                          >
                            {sendResetCodeMutation.isPending ? "Sending..." : "Send Code"}
                          </Button>
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => {
                              setShowForgotPassword(false);
                              setCodeSent(false);
                              setMaskedEmail("");
                              forgotPasswordForm.reset();
                            }}
                            data-testid="button-cancel-reset"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <FormField
                            control={forgotPasswordForm.control}
                            name="verificationCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Verification Code</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field}
                                    placeholder="Enter 6-digit code"
                                    maxLength={6}
                                    data-testid="input-verification-code"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={forgotPasswordForm.control}
                            name="newPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>New Password</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="password"
                                    {...field}
                                    placeholder="Enter new password (min 8 characters)"
                                    data-testid="input-new-password"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={forgotPasswordForm.control}
                            name="confirmPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Confirm Password</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="password"
                                    {...field}
                                    placeholder="Confirm new password"
                                    data-testid="input-confirm-password"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex gap-2">
                            <Button 
                              type="submit" 
                              className="flex-1" 
                              disabled={resetPasswordMutation.isPending}
                              data-testid="button-reset-password"
                            >
                              {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                            </Button>
                            <Button 
                              type="button" 
                              variant="outline" 
                              onClick={() => {
                                setCodeSent(false);
                                setMaskedEmail("");
                                forgotPasswordForm.reset();
                              }}
                              data-testid="button-back"
                            >
                              Back
                            </Button>
                          </div>
                          <Button
                            type="button"
                            variant="link"
                            className="w-full text-sm"
                            onClick={() => sendResetCodeMutation.mutate(forgotPasswordForm.getValues("userIdentifier"))}
                            disabled={sendResetCodeMutation.isPending}
                            data-testid="button-resend-code"
                          >
                            Resend Code
                          </Button>
                        </>
                      )}
                    </form>
                  </Form>
                )}
                <div className="mt-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <Link href="/register" className="font-semibold text-primary hover:underline" data-testid="link-create-account">
                      Create account
                    </Link>
                  </p>
                </div>
          </CardContent>
        </Card>
      </div>
      <div className="hidden md:flex flex-col items-center justify-center p-8 bg-primary text-primary-foreground">
        <img 
          src="/Spartans_LOGO.png"
          alt="Spartans Logo"
          className="h-32 w-auto mb-8 object-contain"
          onError={(e) => {
            console.error('Error loading logo:', e);
            e.currentTarget.src = '/fallback-logo.png';
          }}
        />
        <h1 className="text-4xl font-bold mb-4">Welcome to Sparta</h1>
        <p className="text-lg text-center max-w-md">
          Join our community of wellness enthusiasts. Track your fitness journey, share your progress,
          and get inspired by scripture and fellow members.
        </p>
      </div>
    </div>
  );
}