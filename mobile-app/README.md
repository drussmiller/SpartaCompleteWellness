# Fitness Community Mobile App

This is a React Native mobile application built with Expo for the Fitness Community platform.

## Prerequisites

- Node.js (>= 14.0.0)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- Expo Go app installed on your mobile device (available on App Store or Google Play)

## Installation

1. Install dependencies:

```bash
cd mobile-app
npm install
```

## Running the App

Start the Expo development server:

```bash
npm start
```

This will display a QR code in your terminal. You have several options to run the app:

- Scan the QR code with the Expo Go app on your mobile device (make sure your mobile device is on the same WiFi network as your development machine)
- Press `a` in the terminal to open in an Android emulator (requires Android Studio setup)
- Press `i` in the terminal to open in an iOS simulator (requires Xcode on macOS)
- Press `w` to open in a web browser

## API Connection

The app is currently configured to connect to a local server at `http://localhost:5000`.

For production deployment, you'll need to update the API URL in App.js to point to your deployed backend server address.