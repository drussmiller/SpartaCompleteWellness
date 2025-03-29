import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from './hooks/use-auth';
import { apiRequest } from './lib/queryClient';

export function DebugApi() {
  const { user } = useAuth();
  const [postsData, setPostsData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get current date and previous week
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      
      const formattedStartDate = startDate.toISOString().split('T')[0];
      const formattedEndDate = endDate.toISOString().split('T')[0];
      
      console.log(`Fetching posts for user ${user?.id} from ${formattedStartDate} to ${formattedEndDate}`);
      
      const response = await apiRequest(
        "GET", 
        `/api/debug/posts?userId=${user?.id}&startDate=${formattedStartDate}&endDate=${formattedEndDate}&type=all`
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${errorText}`);
      }
      
      const data = await response.json();
      console.log(`API Debug: Received ${data.length} posts`);
      setPostsData(data);
    } catch (err) {
      console.error('Error fetching posts:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto mt-8">
      <CardHeader>
        <CardTitle>API Debug Tool</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p>Current user: {user ? `ID: ${user.id}, Username: ${user.username}` : 'Not logged in'}</p>
        </div>
        
        <Button 
          onClick={fetchPosts} 
          disabled={loading || !user}
        >
          {loading ? 'Loading...' : 'Test Posts API'}
        </Button>
        
        {error && (
          <div className="p-4 bg-red-100 text-red-800 rounded">
            {error}
          </div>
        )}
        
        {postsData && (
          <div className="p-4 bg-green-100 text-green-800 rounded">
            <p>Successfully fetched {postsData.length} posts!</p>
            <pre className="text-xs mt-2 overflow-auto max-h-40">
              {JSON.stringify(postsData.slice(0, 2), null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}