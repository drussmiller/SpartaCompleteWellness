import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  console.log(`Making ${method} request to ${url}`);
  console.log('Request headers:', {
    'Content-Type': data ? 'application/json' : undefined,
    'Credentials': 'include'
  });

  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    console.error(`Request failed: ${res.status} ${res.statusText}`);
    console.error('Response headers:', Object.fromEntries(res.headers.entries()));
    console.error('Request URL:', url);
  }

  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      console.log(`Fetching data for queryKey: ${queryKey[0]}`);
      const res = await fetch(queryKey[0] as string, {
        credentials: "include",
      });

      if (res.status === 401) {
        console.log("Received 401 response, handling according to behavior:", unauthorizedBehavior);
        if (unauthorizedBehavior === "returnNull") {
          return null;
        }
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 0,
      retry: 1,
    },
    mutations: {
      retry: 1,
    },
  },
});