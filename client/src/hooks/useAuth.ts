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
      try {
        const response = await apiRequest("POST", "/auth/login", data);
        return response.json();
      } catch (error) {
        // Если API недоступен или возвращает 404, все равно показываем ошибку пользователю
        console.error('❌ [LOGIN] API request failed:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('✅ [LOGIN] Login successful:', data);
      
      // Сначала обновляем состояние
      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
      
      // Показываем уведомление
      toast({
        title: "Success",
        description: "Login successful! Redirecting to dashboard...",
      });
      
      // Сразу делаем редирект
      window.location.href = '/dashboard';
    },
    onError: (error: Error) => {
      console.error('❌ [LOGIN] Login failed:', error);
      console.error('❌ [LOGIN] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      // Улучшенный вывод ошибок авторизации
      let errorMessage = "Произошла ошибка при входе";
      
      if (error.message.includes("Invalid email or password")) {
        errorMessage = "Неверный email или пароль";
      } else if (error.message.includes("User not found")) {
        errorMessage = "Пользователь не найден";
      } else if (error.message.includes("Too many authentication attempts")) {
        errorMessage = "Слишком много попыток входа. Попробуйте позже";
      } else if (error.message.includes("Validation error")) {
        errorMessage = "Ошибка валидации данных";
      } else if (error.message.includes("Internal server error")) {
        errorMessage = "Ошибка сервера. Попробуйте позже";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      console.log('🔍 [LOGIN] Final error message for user:', errorMessage);
      
      toast({
        title: "Ошибка входа",
        description: errorMessage,
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
      try {
        const response = await apiRequest("POST", "/auth/register", data);
        return response.json();
      } catch (error) {
        // Если API недоступен или возвращает 404, все равно показываем ошибку пользователю
        console.error('❌ [REGISTER] API request failed:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('✅ [REGISTER] Registration successful:', data);
      
      // Сначала обновляем состояние
      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
      
      // Показываем уведомление
      toast({
        title: "Success",
        description: "Registration successful! Redirecting to dashboard...",
      });
      
      // Сразу делаем редирект
      window.location.href = '/dashboard';
    },
    onError: (error: Error) => {
      console.error('❌ [REGISTER] Registration failed:', error);
      console.error('❌ [REGISTER] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      // Улучшенный вывод ошибок регистрации
      let errorMessage = "Произошла ошибка при регистрации";
      
      if (error.message.includes("User already exists")) {
        errorMessage = "Пользователь с таким email уже существует";
      } else if (error.message.includes("Invalid email format")) {
        errorMessage = "Неверный формат email";
      } else if (error.message.includes("Password too short")) {
        errorMessage = "Пароль должен содержать минимум 8 символов";
      } else if (error.message.includes("Validation error")) {
        errorMessage = "Ошибка валидации данных";
      } else if (error.message.includes("Too many authentication attempts")) {
        errorMessage = "Слишком много попыток регистрации. Попробуйте позже";
      } else if (error.message.includes("Internal server error")) {
        errorMessage = "Ошибка сервера. Попробуйте позже";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Ошибка регистрации",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Делаем API запрос, но игнорируем ошибки
      try {
        await apiRequest("POST", "/auth/logout");
      } catch (error) {
        // Игнорируем все ошибки - делаем локальный logout
        console.log('⚠️ [LOGOUT] Server logout failed, continuing with local logout');
      }
    },
    onSuccess: () => {
      // Очищаем локальное состояние
      queryClient.setQueryData(["/auth/me"], null);
      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
      
      // Сразу делаем редирект на страницу авторизации
      window.location.href = '/auth';
    },
    onError: () => {
      // Даже при ошибке очищаем состояние и делаем редирект
      queryClient.setQueryData(["/auth/me"], null);
      queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
      
      // Редирект на страницу авторизации
      window.location.href = '/auth';
    },
  });
}
