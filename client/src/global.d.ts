
import { QueryClient } from '@tanstack/react-query';

// Extend the Window interface with our global variables
declare global {
  interface Window {
    __QUERY_CLIENT__: QueryClient;
  }
}

export {};
