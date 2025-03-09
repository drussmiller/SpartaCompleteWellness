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
  method: string, 
  url: string,
  data?: any
): Promise<any> {
  // Ensure URL properly formatted
  const baseUrl = url.startsWith('/api') ? '' : '/api';
  const fullUrl = `${baseUrl}${url}`;

  const options: RequestInit = {
    method: method,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };

  // Add body if data is provided and method is not GET
  if (data && method.toUpperCase() !== 'GET') {
    options.body = JSON.stringify(data);
  }

  try {
    console.log(`Making ${method} request to ${fullUrl}`);
    const response = await fetch(fullUrl, options);

    // Check if the response is JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const jsonData = await response.json();

      // Handle error responses with proper status
      if (!response.ok) {
        throw new Error(jsonData.message || `Error ${response.status}: ${response.statusText}`);
      }

      return jsonData;
    } else {
      // Not JSON, handle as text
      const text = await response.text();
      console.error('Received non-JSON response:', text.substring(0, 100) + '...');

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      // Return a structured response for non-JSON success responses
      return { 
        ok: response.ok,
        status: response.status,
        text: text,
        contentType: contentType || 'unknown' 
      };
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