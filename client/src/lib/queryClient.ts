import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    try {
      const contentType = res.headers.get("content-type");

      // If response is JSON, parse it for error details
      if (contentType && contentType.includes("application/json")) {
        const errorData = await res.json();
        throw new Error(errorData.message || `${res.status}: ${res.statusText}`);
      }

      // If response is not JSON (e.g. HTML error page), return generic error
      const text = await res.text();
      if (text.includes("<!DOCTYPE html>")) {
        // Handle HTML error pages (like 404 or 500)
        if (res.status === 401) {
          throw new Error("Your session has expired. Please log in again.");
        }
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      throw new Error(`${res.status}: ${text || res.statusText}`);
    } catch (parseError) {
      // If we can't parse the error response at all
      console.error("Error parsing error response:", parseError);
      throw new Error(`Server error: ${res.status} ${res.statusText}`);
    }
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
      let errorDetails;
      try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          errorDetails = await response.json();
        } else {
          errorDetails = await response.text();
        }
      } catch (parseError) {
        errorDetails = "Could not parse error response";
      }

      console.error(`API ${method} request to ${path} failed:`, {
        status: response.status,
        statusText: response.statusText,
        errorDetails
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
        credentials: "include",
        headers: {
          "Accept": "application/json",
        },
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);

      try {
        return await res.json();
      } catch (jsonError) {
        console.error("Failed to parse JSON response:", jsonError);
        throw new Error("Invalid response format from server");
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
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});