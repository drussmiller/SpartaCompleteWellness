import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

/**
 * Make API requests with automatic error handling
 */
export async function apiRequest(
  method: string, 
  url: string, 
  data?: any
): Promise<any> {
  console.log(`Making ${method} request to ${url}`);

  // Configure request options
  const options: RequestInit = {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    credentials: 'include',
  };

  // Add body data for non-GET requests
  if (method !== 'GET' && data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);

    // Check content type to see if we received JSON or HTML
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      // Process JSON response
      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.message || `Error ${response.status}: ${response.statusText}`);
      }

      return responseData;
    } else {
      // Handle non-JSON response (likely HTML)
      const text = await response.text();
      console.log("Received non-JSON response:", text.substring(0, 100) + "...");

      // Create a more helpful error
      throw new Error(`Received HTML instead of JSON. Server might be restarting or experiencing issues.`);
    }
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
}