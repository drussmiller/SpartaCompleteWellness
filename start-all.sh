#!/bin/bash

# Start the server and web app in the background
echo "Starting web application server..."
npm run dev &
WEB_PID=$!

# Wait a moment to let the server start
echo "Waiting for server to start..."
sleep 5

# Start the Expo app
echo "Starting Expo mobile app..."
cd mobile-app && ./start-expo.sh

# If Expo is terminated, also terminate the web server
kill $WEB_PID