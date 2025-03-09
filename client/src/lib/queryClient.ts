import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
      queryFn: (async ({ queryKey }) => {
        const [url, ...rest] = queryKey as string[];
        const res = await fetch(url, {
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
        });
        await throwIfResNotOk(res);
        return res.json();
      }) as QueryFunction,
    },
  },
});

export { queryClient };

/**
 * Make API requests with proper error handling
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
    if (data && (requestMethod === 'POST' || requestMethod === 'PUT' || requestMethod === 'PATCH')) {
      requestOptions.body = JSON.stringify(data);
    }
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

  // Prepare the full URL - ensure we don't double-add /api prefix
  let fullUrl = requestUrl;
  if (!requestUrl.startsWith('/api')) {
    const baseUrl = '/api';
    fullUrl = requestUrl.startsWith('/') 
      ? `${baseUrl}${requestUrl}` 
      : `${baseUrl}/${requestUrl}`;
  }

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
    console.log(`Making ${requestOptions.method} request to ${fullUrl}`);
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
          const text = await response.text();
          if (text.includes('<!DOCTYPE html>')) {
            console.warn('Received HTML error response');
            errorMessage = `Error ${response.status}: Server returned HTML instead of JSON`;
          } else {
            errorMessage = text || `Error ${response.status}: ${response.statusText}`;
          }
        }
      } catch (parseError) {
        errorMessage = `Error ${response.status}: ${response.statusText}`;
      }

      const error = new Error(errorMessage);
      (error as any).status = response.status;
      throw error;
    }

    // For success responses, parse accordingly
    if (contentType && contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch (jsonError) {
        console.error('Error parsing JSON response:', jsonError);
        throw new Error(`Failed to parse JSON response: ${jsonError.message}`);
      }
    } else {
      const text = await response.text();
      if (text.includes('<!DOCTYPE html>')) {
        console.warn('Received non-JSON response:', text.substring(0, 100) + '...');
        throw new Error('Server returned HTML instead of JSON');
      } else {
        console.warn('Received non-JSON response:', text.substring(0, 100) + '...');
        return { success: true, text };
      }
    }
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const createProtectedQueryFn = (
  unauthorizedBehavior: UnauthorizedBehavior = "throw"
) => {
  return async ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const [url, ...rest] = queryKey as string[];
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (res.status === 401) {
        if (unauthorizedBehavior === "returnNull") {
          return null;
        } else {
          throw new Error("Unauthorized");
        }
      }

      await throwIfResNotOk(res);
      return res.json();
    } catch (e) {
      if (e instanceof Error && e.message === "Unauthorized") {
        throw e;
      }
      console.error(`Error fetching ${url}:`, e);
      throw e;
    }
  };
};