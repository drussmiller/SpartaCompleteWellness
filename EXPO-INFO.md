# Expo Mobile App Info

The Expo mobile application has been temporarily disabled and backed up in the `mobile-app-backup` directory. This was done to focus development efforts on the web application.

## Mobile App Details

- The mobile app used Expo SDK for React Native development
- It included WebSocket support for real-time notifications
- The app had connection status indicators similar to the web version
- It used React Native components for the UI

## How to Restore

If you wish to re-enable the Expo mobile app:

1. Rename the `mobile-app-backup` directory back to `mobile-app`:

```bash
mv mobile-app-backup mobile-app
```

2. Restore the original start-all.sh script:

```bash
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
```

3. Then run the start script to launch both web and mobile apps:

```bash
./start-all.sh
```

## Notes

- The mobile app was configured to connect to the backend at http://localhost:5000.
- For testing on physical devices, you would need to modify the API_URL in mobile-app/App.js.