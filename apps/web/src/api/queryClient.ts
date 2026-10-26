import { QueryClient } from '@tanstack/react-query';

// Shared so code outside React (like request()) can refresh queries too.
export const queryClient = new QueryClient();
