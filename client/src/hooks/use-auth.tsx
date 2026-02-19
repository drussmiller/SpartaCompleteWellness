import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  console.log('AuthProvider initializing');
  const { toast } = useToast();

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      console.log('Fetching user data...');
      try {
        const response = await fetch('/api/user', {
          credentials: 'include'
        });
        console.log('User fetch response status:', response.status);

        if (response.status === 401) {
          console.log('User not authenticated');
          return null;
        }

        if (!response.ok) {
          throw new Error('Failed to fetch user data');
        }

        const userData = await response.json();
        console.log('Fetched user data:', userData);
        return userData;
      } catch (error) {
        console.error('Error fetching user:', error);
        throw error;
      }
    },
    retry: false,
    staleTime: 0,
  });

  console.log('AuthProvider state:', { user, isLoading, error });
  if (user) {
    console.log('Current user avatarColor:', user.avatarColor);
  }

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      console.log('Attempting login...');
      const timezoneOffset = -(new Date().getTimezoneOffset());
      const res = await apiRequest("POST", "/api/login", { ...credentials, timezoneOffset });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Invalid username or password");
      }
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      console.log('Login successful:', user);
      queryClient.setQueryData(["/api/user"], user);
      // Reset filter mode to "team" on new login
      sessionStorage.removeItem("homePageFilterMode");
    },
    onError: (error: Error) => {
      console.error('Login error:', error);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      console.log('Attempting registration...');
      const res = await apiRequest("POST", "/api/register", credentials);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Registration failed");
      }
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      console.log('Registration successful:', user);
      queryClient.setQueryData(["/api/user"], user);

      // Check if user needs to sign waiver and redirect
      if (!user.waiverSigned) {
        console.log('User needs to sign waiver, redirecting...');
        window.location.href = '/waiver';
      }
    },
    onError: (error: Error) => {
      console.error('Registration error:', error);
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      console.log('Attempting logout...');
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      console.log('Logout successful');
      queryClient.setQueryData(["/api/user"], null);
      // Clear all React Query cache when user logs out
      queryClient.clear();
    },
    onError: (error: Error) => {
      console.error('Logout error:', error);
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  console.log('useAuth hook called');
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}