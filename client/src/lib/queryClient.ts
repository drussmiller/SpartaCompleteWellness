
import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Enhanced error handling for authentication errors
    if (res.status === 401) {
      throw new Error("Unauthorized - Please log in to continue");
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      const res = await fetch(queryKey[0] as string, {
        credentials: "include", // Ensure cookies are sent with queries
        headers: {
          "Accept": "application/json",
        },
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }
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

/**
 * Make API requests with automatic error handling
 */
export async function apiRequest(
  method: string | RequestInit, 
  url?: string | RequestInit, 
  data?: any
): Promise<any> {
  // Handle different parameter patterns
  let requestMethod: string;
  let requestUrl: string;
  let requestOptions: RequestInit = {};
  
  if (typeof method === 'string' && typeof url === 'string') {
    // Case: apiRequest("GET", "/api/users")
    requestMethod = method;
    requestUrl = url;
    requestOptions.body = data ? JSON.stringify(data) : undefined;
  } else if (typeof method === 'string' && typeof url === 'object') {
    // Case: apiRequest("/api/users", { method: "GET" })
    requestUrl = method;
    requestOptions = url;
  } else if (typeof method === 'object') {
    // Case: apiRequest({ method: "GET", url: "/api/users" })
    requestOptions = method;
    requestUrl = '';
  } else {
    throw new Error("Invalid arguments for apiRequest");
  }

  // Ensure method is set correctly
  requestOptions.method = requestOptions.method || requestMethod || "GET";
  
  // Prepare the full URL
  const baseUrl = '/api';
  const fullUrl = requestUrl.startsWith('/') 
    ? `${baseUrl}${requestUrl}` 
    : `${baseUrl}/${requestUrl}`;

  // Default options for all requests
  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    credentials: 'include',
  };

  // Combine options
  const combinedOptions: RequestInit = {
    ...defaultOptions,
    ...requestOptions,
    headers: {
      ...defaultOptions.headers,
      ...requestOptions.headers,
    },
  };

  try {
    const response = await fetch(fullUrl, combinedOptions);

    // Check content type before trying to parse JSON
    const contentType = response.headers.get('content-type');
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized - Please log in to continue");
      }
      
      // Try to get error message
      let errorMessage: string;
      try {
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          errorMessage = errorData.message || `Error ${response.status}: ${response.statusText}`;
        } else {
          errorMessage = await response.text();
        }
      } catch {
        errorMessage = `Error ${response.status}: ${response.statusText}`;
      }
      
      throw new Error(errorMessage);
    }
    
    // For success responses, parse accordingly
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      const text = await response.text();
      console.warn('Received non-JSON response:', text.substring(0, 100) + '...');
      return { success: true, text };
    }
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}
