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

export async function apiRequest<T = any>(
  url: string, 
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = '/api';
  const fullUrl = url.startsWith('/') ? `${baseUrl}${url}` : `${baseUrl}/${url}`;

  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };

  const response = await fetch(fullUrl, {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  });

  // Check content type before trying to parse JSON
  const contentType = response.headers.get('content-type');
  let data;
  
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (parseError) {
      console.error('Error parsing JSON response:', parseError);
      throw new Error('Invalid JSON response from server');
    }
  } else {
    // Not JSON, get text and report error
    const text = await response.text();
    console.error('Received non-JSON response:', text.substring(0, 100) + '...');
    throw new Error(`Expected JSON response but received: ${contentType || 'unknown content type'}`);
  }

  if (!response.ok) {
    const error = new Error(data?.message || 'Something went wrong');
    throw Object.assign(error, { status: response.status, data });
  }

  return data as T;
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