import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { useEffect, useState, useRef } from 'react';

// Define API URL for the backend - replace with your server URL when deployed
const API_URL = 'http://localhost:5000';

// Connection status types
const ConnectionStatus = {
  CONNECTED: 'connected',
  CONNECTING: 'connecting',
  DISCONNECTED: 'disconnected'
};

export default function App() {
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState(ConnectionStatus.DISCONNECTED);
  const [user, setUser] = useState(null);
  
  // WebSocket reference to keep connection alive between renders
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Fetch user data
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/me`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const userData = await response.json();
        setUser(userData);
      } catch (err) {
        console.error('Error fetching user data:', err);
      }
    };

    fetchUser();
  }, []);

  // Setup WebSocket connection
  useEffect(() => {
    if (!user) return;

    // Function to establish WebSocket connection
    const connectWebSocket = () => {
      try {
        setConnectionStatus(ConnectionStatus.CONNECTING);
        
        // Close existing connection if any
        if (socketRef.current) {
          socketRef.current.close();
        }
        
        // Create new WebSocket connection
        const wsProtocol = API_URL.startsWith('https') ? 'wss' : 'ws';
        const wsUrl = `${wsProtocol}://${API_URL.replace(/^https?:\/\//, '')}/ws`;
        
        console.log(`Connecting to WebSocket at ${wsUrl}`);
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;
        
        socket.onopen = () => {
          console.log('WebSocket connection established');
          setConnectionStatus(ConnectionStatus.CONNECTED);
          reconnectAttemptsRef.current = 0;
          
          // Authenticate with the WebSocket server
          if (user) {
            socket.send(JSON.stringify({
              type: 'auth',
              userId: user.id
            }));
          }
        };
        
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
              case 'notification':
                if (data.data) {
                  // Add notification to state
                  setNotifications(prev => [...prev, data.data]);
                  
                  // Show an alert with the notification
                  Alert.alert(
                    data.data.title,
                    data.data.message,
                    [{ text: 'OK' }]
                  );
                  
                  // Refresh posts to see any updates
                  fetchPosts();
                }
                break;
                
              case 'auth_success':
                console.log('WebSocket authentication successful');
                break;
                
              case 'error':
                console.error('WebSocket error:', data.message);
                break;
                
              default:
                console.log('Received WebSocket message:', data);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
        
        socket.onclose = () => {
          console.log('WebSocket connection closed');
          setConnectionStatus(ConnectionStatus.DISCONNECTED);
          
          // Attempt to reconnect with exponential backoff
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
            console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})`);
            
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current++;
              connectWebSocket();
            }, delay);
          } else {
            console.error('Max reconnect attempts reached');
          }
        };
        
        socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          setConnectionStatus(ConnectionStatus.DISCONNECTED);
        };
      } catch (error) {
        console.error('Error setting up WebSocket:', error);
        setConnectionStatus(ConnectionStatus.DISCONNECTED);
      }
    };
    
    // Connect to WebSocket
    connectWebSocket();
    
    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [user]);

  // Fetch posts from the API
  const fetchPosts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/posts`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      setPosts(data);
    } catch (err) {
      console.error('Error fetching posts:', err);
      setError('Failed to load posts. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch posts on component mount
  useEffect(() => {
    fetchPosts();
  }, []);

  // Render connection status indicator
  const renderConnectionStatus = () => {
    let color;
    let text;
    
    switch (connectionStatus) {
      case ConnectionStatus.CONNECTED:
        color = '#4CAF50'; // Green
        text = 'Connected';
        break;
      case ConnectionStatus.CONNECTING:
        color = '#FF9800'; // Orange
        text = 'Connecting...';
        break;
      case ConnectionStatus.DISCONNECTED:
        color = '#F44336'; // Red
        text = 'Offline';
        break;
      default:
        color = '#9E9E9E'; // Gray
        text = 'Unknown';
    }
    
    return (
      <View style={styles.connectionIndicator}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <Text style={styles.statusText}>{text}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Fitness Community</Text>
        {renderConnectionStatus()}
      </View>
      
      {isLoading ? (
        <View style={styles.centerContent}>
          <Text>Loading posts...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={fetchPosts}>
            <Text style={styles.buttonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          {posts.length === 0 ? (
            <View style={styles.centerContent}>
              <Text>No posts available</Text>
            </View>
          ) : (
            posts.map((post) => (
              <View key={post.id} style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Text style={styles.authorName}>{post.author.username}</Text>
                  <Text style={styles.postType}>{post.type}</Text>
                </View>
                <Text style={styles.postContent}>{post.content}</Text>
                {post.imageUrl && (
                  <View style={styles.imageContainer}>
                    <Text>Image: {post.imageUrl}</Text>
                  </View>
                )}
                <View style={styles.postFooter}>
                  <Text style={styles.pointsText}>{post.points} points</Text>
                  <Text style={styles.dateText}>
                    {new Date(post.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
      
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#e63946',
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  scrollView: {
    padding: 15,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#e63946',
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#e63946',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  postCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  authorName: {
    fontWeight: 'bold',
    fontSize: 16,
  },
  postType: {
    backgroundColor: '#e9ecef',
    padding: 5,
    borderRadius: 5,
    fontSize: 12,
  },
  postContent: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
  },
  imageContainer: {
    marginVertical: 10,
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 5,
  },
  postFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  pointsText: {
    fontWeight: 'bold',
    color: '#e63946',
  },
  dateText: {
    color: '#6c757d',
  },
  connectionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
});