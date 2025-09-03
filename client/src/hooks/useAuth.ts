import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  email: string;
  provider: "LOCAL" | "GOOGLE";
  createdAt: string;
}

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<User | null>({
    queryKey: ["/auth/me"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
    error,
  };
}

export function useLogin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/auth/login", data);
      return response.json();
    },
    onSuccess: (data) => {
      console.log('✅ [LOGIN] Login successful:', data);
      
      // Небольшая задержка для установки cookies
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
        
        // Редирект на дашборд после успешного логина
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 200);
      }, 100);
      
      toast({
        title: "Success",
        description: "Login successful! Redirecting to dashboard...",
      });
    },
    onError: (error: Error) => {
      console.error('❌ [LOGIN] Login failed:', error);
      console.error('❌ [LOGIN] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      toast({
        title: "Login Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive",
      });
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/auth/register", data);
      return response.json();
    },
    onSuccess: (data) => {
      console.log('✅ [REGISTER] Registration successful:', data);
      
      // Небольшая задержка для установки cookies
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
        
        // Редирект на дашборд после успешной регистрации
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 200);
      }, 100);
      
      toast({
        title: "Success",
        description: "Registration successful! Redirecting to dashboard...",
      });
    },
    onError: (error: Error) => {
      console.error('❌ [REGISTER] Registration failed:', error);
      console.error('❌ [REGISTER] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      toast({
        title: "Registration Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive",
      });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/auth/me"], null);
      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
      toast({
        title: "Success",
        description: "Logged out successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Logout Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
