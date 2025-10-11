import { QueryClient, QueryCache } from "@tanstack/react-query";

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

export async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: HeadersInit = {};

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(`${path}`, {
      method,
      headers,
      body: body instanceof FormData ? body : JSON.stringify(body),
      credentials: 'include',
    });

    // Log failed API requests for debugging (clone response before reading)
    if (!response.ok) {
      const clonedResponse = response.clone();
      const errorText = await clonedResponse.text();
      console.error(`API ${method} request to ${path} failed:`, {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
    }

    return response;
  } catch (error) {
    console.error(`API ${method} request to ${path} threw an exception:`, error);
    throw error;
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
      
      // Check if the response is JSON before trying to parse it
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          return await res.json();
        } catch (jsonError) {
          console.error('Failed to parse JSON response:', jsonError);
          const text = await res.text();
          console.error('Response text:', text);
          throw new Error('Invalid JSON response from server');
        }
      } else {
        // For non-JSON responses, try to get the text
        const text = await res.text();
        
        // If it looks like HTML (probably an error page), throw an error
        if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          console.error('Received HTML instead of JSON:', text.substring(0, 100) + '...');
          throw new Error('Server returned HTML instead of JSON data. The server might be restarting or experiencing issues.');
        }
        
        // Otherwise, try to parse it as JSON anyway
        try {
          return JSON.parse(text);
        } catch (parseError) {
          console.error('Response is neither valid JSON nor HTML:', text);
          throw new Error('Unexpected response format from server');
        }
      }
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
      staleTime: 30000, // Added from changes
      refetchOnMount: "if-stale", // Added from changes
      retry: 1, // Added from changes
    },
    mutations: {
      retry: false,
    },
  },
});