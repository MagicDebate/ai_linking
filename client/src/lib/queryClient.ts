import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    console.log(`❌ [API] Response not OK:`, res.status, res.statusText);
    
    let errorMessage = res.statusText;
    
    try {
      const errorData = await res.json();
      console.log(`❌ [API] Error data:`, errorData);
      
      if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.errors && Array.isArray(errorData.errors)) {
        errorMessage = errorData.errors.map((e: any) => e.message).join(', ');
      }
    } catch (parseError) {
      console.log(`❌ [API] Failed to parse JSON:`, parseError);
      
      // Если не удалось распарсить JSON, используем текст
      try {
        const text = await res.text();
        console.log(`❌ [API] Response text:`, text);
        if (text) errorMessage = text;
      } catch (textError) {
        console.log(`❌ [API] Failed to get text:`, textError);
        // Игнорируем ошибки парсинга
      }
    }
    
    console.log(`❌ [API] Final error message:`, errorMessage);
    throw new Error(errorMessage);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  console.log(`🌐 [API] ${method} ${url}`, data ? 'with data' : 'no data');
  
  let headers: Record<string, string> = {};
  let body: any = undefined;

  if (data instanceof FormData) {
    // Don't set Content-Type for FormData, let browser set it with boundary
    body = data;
  } else if (data) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(data);
  }

  console.log(`🌐 [API] Headers:`, headers);
  console.log(`🌐 [API] Body:`, body);

  const res = await fetch(url, {
    method,
    headers,
    body,
    credentials: "include",
  });

  console.log(`🌐 [API] Response status:`, res.status, res.statusText);
  console.log(`🌐 [API] Response headers:`, Object.fromEntries(res.headers.entries()));

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
