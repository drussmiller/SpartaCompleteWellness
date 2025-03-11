import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Enhanced error handling for authentication errors
    if (res.status === 401) {
      throw new Error("Unauthorized - Please log in to continue");
    }
    const contentType = res.headers.get("content-type");
    const text = await res.text();

    // Try to parse JSON error if possible
    if (contentType?.includes("application/json")) {
      try {
        const errorData = JSON.parse(text);
        throw new Error(errorData.message || `${res.status}: ${text}`);
      } catch {
        throw new Error(`${res.status}: ${text}`);
      }
    }

    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: HeadersInit = {
    'Accept': 'application/json'
  };

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

    // Log failed API requests for debugging
    if (!response.ok) {
      const contentType = response.headers.get("content-type");
      const errorText = await response.text();
      console.error(`API ${method} request to ${path} failed:`, {
        status: response.status,
        statusText: response.statusText,
        contentType,
        body: errorText
      });

      // Try to parse JSON error if possible
      if (contentType?.includes("application/json")) {
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.message || "Request failed");
        } catch {
          throw new Error(`Request failed: ${errorText}`);
        }
      }

      throw new Error(`Request failed: ${errorText}`);
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
        credentials: "include",
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