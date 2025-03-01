#!/bin/bash

# Start the minimal server in the background
echo "Starting minimal server..."
tsx server/minimal-server.ts &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server to start..."
sleep 2

# Test the ping endpoint
echo "Testing /ping endpoint..."
curl -v http://localhost:5000/ping

# Kill the server process
echo "Shutting down server..."
kill $SERVER_PID

# Wait for server to shutdown
sleep 1
