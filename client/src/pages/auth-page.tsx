import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InsertUser, insertUserSchema } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

type LoginForm = {
  username: string; // Will be used for either username or email
  password: string;
};

// Define the register schema with password confirmation
const registerSchema = z.object({
  username: z.string().min(1, "Username is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});


const forgotPasswordSchema = z.object({
  userIdentifier: z.string().min(1, "User ID or Preferred Name is required"),
});

export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [showForgotPassword, setShowForgotPassword] = useState(false);

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

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const forgotPasswordForm = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onChange",
    defaultValues: {
      userIdentifier: "",
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: z.infer<typeof forgotPasswordSchema>) => {
      const response = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to send reset email');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Email Sent",
        description: "If that user exists, a password reset email has been sent to the registered email address. Please check your inbox.",
      });
      setShowForgotPassword(false);
      forgotPasswordForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process password reset request. Please try again.",
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
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              <TabsContent value="login">
                {!showForgotPassword ? (
                  <Form {...loginForm}>
                    <form onSubmit={loginForm.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
                      <FormField
                        control={loginForm.control}
                        name="username"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Username or Email</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="Enter your username or email" 
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
                          forgotPasswordForm.reset({ userIdentifier: "" });
                          setShowForgotPassword(true);
                        }}
                        data-testid="button-forgot-password"
                      >
                        Forgot Password?
                      </Button>
                    </form>
                  </Form>
                ) : (
                  <Form {...forgotPasswordForm} key="forgot-password-form">
                    <form onSubmit={forgotPasswordForm.handleSubmit((data) => forgotPasswordMutation.mutate(data))} className="space-y-4">
                      <div className="mb-4">
                        <h3 className="font-semibold text-lg mb-2">Reset Password</h3>
                        <p className="text-sm text-muted-foreground">
                          Enter your User ID or Preferred Name and we'll send a temporary password to your registered email address.
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
                          disabled={forgotPasswordMutation.isPending}
                          data-testid="button-send-reset"
                        >
                          {forgotPasswordMutation.isPending ? "Sending..." : "Send Reset Email"}
                        </Button>
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => {
                            setShowForgotPassword(false);
                            forgotPasswordForm.reset();
                          }}
                          data-testid="button-cancel-reset"
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </Form>
                )}
              </TabsContent>
              <TabsContent value="register">
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit((data) => registerMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={registerForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                      {registerMutation.isPending ? "Creating account..." : "Create Account"}
                    </Button>
                    {registerMutation.error && (
                      <p className="text-red-500 text-sm mt-2">
                        {registerMutation.error instanceof Error
                          ? registerMutation.error.message
                          : "Failed to create account"}
                      </p>
                    )}
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
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