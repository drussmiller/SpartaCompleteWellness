# Team Fitness Tracker - Replit Architecture Guide

## Overview

This is a full-stack fitness tracking application built with modern web technologies. The application allows users to create posts, share media (images and videos), track fitness activities, send messages, and manage team-based fitness goals. The system is designed to run on Replit with cloud-based file storage and PostgreSQL database.

## System Architecture

The application follows a monorepo structure with clear separation between client, server, and shared components:

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Components**: Radix UI primitives with custom styling
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: React Query (@tanstack/react-query) for server state
- **Routing**: Client-side routing for SPA functionality

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for HTTP server
- **Authentication**: Passport.js with local strategy and session-based auth
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Real-time**: WebSocket support for live notifications and updates
- **File Processing**: Sharp for image manipulation, custom video thumbnail extraction

### Database Design
- **Primary Database**: PostgreSQL (Neon serverless)
- **ORM**: Drizzle with migrations support
- **Schema Location**: `shared/schema.ts` for type sharing between client/server
- **Connection Pooling**: Neon serverless with connection management

## Key Components

### Authentication System
- Session-based authentication using Passport.js
- Password hashing with scrypt and salt
- User session management with express-session
- Protected routes and middleware for authentication

### File Storage System
- **Primary Storage**: Replit Object Storage for media files
- **File Types**: Images (JPEG, PNG) and videos (MOV, MP4)
- **Thumbnail Generation**: Automatic thumbnail creation for images and videos
- **Path Strategy**: Uses `shared/uploads/` prefix for cross-environment compatibility
- **Fallback**: Local file system as backup (disabled to save space)

### Media Processing
- **Image Processing**: Sharp library for resizing and thumbnail generation
- **Video Processing**: Custom MOV frame extractor for video thumbnails
- **File Validation**: MIME type checking and file extension validation
- **Error Handling**: SVG placeholder generation for failed thumbnail extraction

### Real-time Features
- WebSocket integration for live notifications
- Connection status monitoring
- Automatic reconnection with exponential backoff
- User presence and activity tracking

### Post Management
- Create posts with text, images, or videos
- Post types: general, memory_verse, workout tracking
- Media upload with automatic thumbnail generation
- Reaction system (likes, comments)
- Post deletion with cascade file cleanup

### Messaging System
- Private messaging between users
- File attachment support in messages
- Image paste functionality with proper MIME type handling
- Message history and pagination

## Data Flow

### File Upload Process
1. Client uploads file via multipart form data
2. Server validates file type and size
3. File stored in Replit Object Storage with unique filename
4. Thumbnail generated (for images/videos) and stored separately
5. Database record created with file reference
6. Response sent to client with file URL

### Authentication Flow
1. User submits credentials via login form
2. Passport.js validates against database
3. Session created and stored
4. Subsequent requests authenticated via session middleware
5. Protected routes check authentication status

### Post Creation Flow
1. Client submits post data (text + optional media)
2. Media files processed and stored in Object Storage
3. Database transaction creates post record
4. Thumbnails generated for media files
5. WebSocket notification sent to relevant users
6. Client receives confirmation and updates UI

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: PostgreSQL database connection
- **@replit/object-storage**: Cloud file storage
- **drizzle-orm**: Database ORM and migrations
- **passport**: Authentication framework
- **sharp**: Image processing library
- **@tanstack/react-query**: Client-side data fetching

### UI Dependencies
- **@radix-ui/***: Accessible UI component primitives
- **tailwindcss**: Utility-first CSS framework
- **@tiptap/***: Rich text editor components

### Development Dependencies
- **vite**: Build tool and development server
- **typescript**: Type checking and compilation
- **tsx**: TypeScript execution for server

## Deployment Strategy

### Production Build
- Client built with Vite to `dist/public/`
- Server compiled with esbuild to `dist/index.js`
- Single Node.js process serves both static files and API

### Environment Configuration
- Environment variables for database connection
- Replit-specific configurations for Object Storage
- Session secrets and authentication keys
- Development vs production mode handling

### Database Management
- Drizzle migrations for schema changes
- Connection pooling for performance
- Error handling and reconnection logic

### File Storage
- Object Storage as primary storage solution
- Environment-agnostic file paths with `shared/` prefix
- Automatic cleanup of orphaned files
- Thumbnail generation and caching

## Changelog
```
Changelog:
- July 03, 2025. Initial setup
- July 03, 2025. Fixed broken image display issue - Object Storage was returning image data in array format that wasn't being handled correctly. Enhanced serve-file endpoint to properly extract Buffer data, added CORS headers, and implemented cache-busting for browser compatibility.
- July 03, 2025. Fixed memory verse video thumbnail rendering in development environment - Added missing `ne` function import for API filtering, updated video display conditions to include memory verse posts alongside is_video flag, resolved React Query caching issues that prevented posts from appearing in dev environment while working correctly in deployment.
- July 03, 2025. Fixed mobile video loading issue in comment pages - VideoPlayer was navigating to separate video player page that wasn't using createMediaUrl. Added createMediaUrl import to video player page for proper Object Storage URL formatting and updated video source handling for consistent mobile playback.
- July 03, 2025. Fixed admin page "can't find variable Users" error - Added missing Users and FileText icon imports from lucide-react to resolve undefined variable errors in admin page components.
- August 22, 2025. Fixed critical password change functionality - Added missing server endpoints /api/user/change-password for user password changes and /api/users/:userId/password for admin password resets. Created updateUser function in storage.ts to handle password updates. Both user profile password change and admin dashboard password reset now work properly with proper authentication and validation.
- October 17, 2025. Fixed critical notification system failure - Restored accidentally deleted /api/check-daily-scores endpoint that was preventing ALL notifications from being sent. The endpoint checks all users (including admins) for missed posts at their preferred notification time. System now reliably sends daily reminders at 8:00 AM (or user's set time) about missing food, workout, scripture, and memory verse posts from the previous day. Also implemented Facebook-style image viewer popup with zoom, pan, rotate, and fullscreen capabilities for post images.
- October 28, 2025. Built SMS notification infrastructure with phone number field in user profile and database - Added phoneNumber, smsCarrierGateway, and smsEnabled fields to users table. Created complete SMS service with automatic carrier detection (Verizon, AT&T, T-Mobile, Sprint, US Cellular, Google Fi, Cricket). Successfully tested carrier detection for Russ (9729787871, Verizon detected). Disabled actual SMS sending via Gmail because Gmail blocks emails to SMS gateways (error: 552 5.2.0 blocked AUP#BL). Infrastructure remains in place for future Twilio integration. Phone number field is available in user profile page for data entry, but SMS notification UI removed from notification settings until Twilio account is set up.
- October 30, 2025. Added Daily Notifications toggle to Notification Settings - Users can now disable daily reminder notifications entirely through the Notification Settings page. Added dailyNotificationsEnabled field to users database schema (defaults to true). Updated notification settings UI with a new toggle above Achievement Notifications. Backend /api/users/notification-schedule endpoint now saves this preference, and the daily score check scheduler respects the setting before sending notifications. Toast close button visibility improved (changed from opacity-0 to opacity-100) for better mobile accessibility.
- October 31, 2025. Fixed Toast popup rendering in Expo Go Web App Wrapper - Toasts were not appearing in Notification Settings, Admin Dashboard, and Post Comment slide cards when deployed in Expo Go wrapper, while working fine in dev environment and in Message slide cards. The issue was that Sheet components (used by the broken pages) create their own portal which was blocking toasts in the Expo Go environment. Fixed by modifying Toaster component to use React's createPortal to render all toasts into the dedicated toast-portal-root element with z-index 2147483647, ensuring toasts always appear on top regardless of Sheet/Dialog overlays. Message slide cards worked because they use custom div-based implementation without Sheet portals.
- October 31, 2025. Added Confirmation Messages toggle to Notification Settings - Users can now turn off success/confirmation messages (toast popups) while keeping error messages visible. Added confirmationMessagesEnabled field to users database schema (defaults to true). Updated Notification Settings page with "Confirmation Messages" toggle that shows/hides success messages like "Message sent successfully." The toggle stores preference in both database and localStorage. Modified toast function to check this preference - when disabled, only error/destructive messages are shown. This helps users who find pop-up messages distracting while ensuring critical error messages are never hidden.
- November 12, 2025. Migrated SMS notifications from Gmail/carrier gateway approach to Twilio integration - Replaced the email-to-SMS carrier gateway system (which was blocked by Gmail) with direct Twilio API integration. Installed Twilio package and rewrote smsService to use Twilio's messages API with proper phone number normalization. Re-enabled SMS notifications in notification service that were previously disabled. Removed smsCarrierGateway field from users schema since carrier detection is no longer needed. Updated API routes to simplify SMS testing (no more carrier detection) and sending. Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) are stored as Replit secrets for secure access.
- November 12, 2025. Added SMS notification settings UI - Created complete SMS management interface in Notification Settings page with phone number input, SMS toggle, and test SMS button. Implemented client-side validation (10+ digits required) with immediate feedback before server submission. Updated /api/users/notification-schedule endpoint to handle phoneNumber and smsEnabled fields with server-side validation that prevents enabling SMS without valid phone number. Created /api/users/test-sms endpoint for testing SMS delivery. System auto-disables SMS when phone number is cleared. Error handling shows specific server validation messages and restores previous state on failure. SMS notifications are sent ONLY for important alerts (daily reminders, new user notifications for admins/leads), NOT for toast/confirmation messages.
```

## User Preferences
```
Preferred communication style: Simple, everyday language.
```