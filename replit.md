# Sparta Fitness Application

## Overview

This is a full-stack web application for fitness tracking and team-based challenges. The application features a React frontend with TypeScript, Express.js backend, PostgreSQL database with Drizzle ORM, and uses Replit Object Storage for file management. The app supports user authentication, team management, workout tracking, memory verse sharing, prayer requests, and real-time messaging.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with custom plugins including shadcn theme support
- **UI Library**: Radix UI components with Tailwind CSS for styling
- **State Management**: TanStack React Query for server state management
- **Rich Text Editing**: TipTap editor for content creation
- **Real-time Updates**: WebSocket client for live notifications and messaging

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Authentication**: Passport.js with local strategy and express-session
- **File Processing**: FFmpeg for video thumbnail generation, Sharp for image processing
- **Logging**: Custom logger with file rotation and structured logging
- **Real-time Communication**: WebSocket server for live updates

### Data Storage Solutions
- **Primary Database**: PostgreSQL via Neon serverless with connection pooling
- **ORM**: Drizzle ORM with type-safe queries and migrations
- **File Storage**: Replit Object Storage for media files (images, videos)
- **Session Storage**: Express session with database persistence

## Key Components

### Authentication System
- Passport.js local strategy with scrypt password hashing
- Session-based authentication with secure cookie management
- Role-based access control (admin, team lead, regular user)
- User profiles with team associations and measurement tracking

### File Management
- **SpartaObjectStorage**: Custom wrapper around Replit Object Storage
- **File Processing**: Automated thumbnail generation for videos using FFmpeg
- **Upload Handling**: Multer middleware with memory storage, files uploaded directly to Object Storage
- **File Serving**: Direct serving from Object Storage with proper MIME type detection

### Database Schema
- **Users**: Authentication, profiles, team membership, fitness data
- **Posts**: Content sharing with support for images, videos, and rich text
- **Teams**: Group management with scoring and leaderboards
- **Messages**: Direct messaging between users with file attachments
- **Reactions**: Post engagement system
- **Notifications**: Achievement and activity alerts
- **Measurements**: Fitness tracking data

### Real-time Features
- WebSocket server for live notifications
- Real-time messaging with file sharing
- Live activity updates and team scoring
- Connection status indicators

## Data Flow

1. **User Registration/Login**: Frontend form → Express auth routes → Passport.js → Database
2. **File Upload**: Frontend form → Multer middleware → Object Storage → Database URL storage
3. **Content Creation**: TipTap editor → API endpoint → Database → WebSocket broadcast
4. **Real-time Updates**: Database changes → WebSocket server → Connected clients
5. **File Serving**: Client request → Object Storage key lookup → Direct file streaming

## External Dependencies

### Core Services
- **Neon PostgreSQL**: Serverless database hosting
- **Replit Object Storage**: File storage and CDN
- **SendGrid**: Email notifications (configured but not actively used)

### Media Processing
- **FFmpeg**: Video thumbnail extraction and processing
- **Sharp**: Image resizing and optimization
- **Mammoth**: Document processing for rich content

### Development Tools
- **Drizzle Kit**: Database migrations and schema management
- **ESBuild**: Production bundling for server-side code
- **PostCSS**: CSS processing with Tailwind

## Deployment Strategy

### Development Environment
- **Runtime**: Replit with Node.js 20, PostgreSQL 16, and web modules
- **Hot Reload**: Vite dev server with HMR for frontend development
- **Database**: Automatic Neon PostgreSQL provisioning via DATABASE_URL
- **File Storage**: Automatic Replit Object Storage configuration

### Production Deployment
- **Target**: Google Cloud Run (configured in .replit)
- **Build Process**: Vite build for frontend, ESBuild for backend
- **Entry Point**: Compiled JavaScript from dist/index.js
- **Environment**: All secrets managed through Replit environment variables

### File Organization
- `client/`: React frontend application
- `server/`: Express.js backend with routes and middleware
- `shared/`: Common TypeScript types and database schema
- `uploads/`: Local development file storage (backed up, not used in production)
- `logs/`: Application logs with automatic rotation

## Changelog
- June 26, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.