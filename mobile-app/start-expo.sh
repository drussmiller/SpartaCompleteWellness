#!/bin/bash

# Make the script executable if it's not already
chmod +x ./start-expo.sh

# Check if npm modules are installed
if [ ! -d "node_modules" ]; then
  echo "First run detected. Installing dependencies..."
  npm install
fi

# Start the Expo project
npx expo start