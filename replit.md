# Team Fitness Tracker - Replit Architecture Guide

## Overview
The Team Fitness Tracker is a full-stack application enabling users to create posts, share media, track fitness activities, send messages, and manage team-based fitness goals. It leverages Replit for hosting, cloud-based file storage, and a PostgreSQL database. The project aims to provide a comprehensive fitness tracking and social platform for teams.

## User Preferences
Preferred communication style: Simple, everyday language.

### UI/UX Preferences
- **Close buttons**: Never add borders to close buttons in the media player (video-player.tsx, image-viewer.tsx) or Create Post dialog (create-post-dialog.tsx). These buttons should remain borderless.

## System Architecture

The application uses a monorepo structure, separating client, server, and shared components.

### Frontend
- **Framework**: React with TypeScript.
- **Build**: Vite.
- **UI**: Radix UI primitives, Tailwind CSS, shadcn/ui.
- **State Management**: React Query for server state.
- **Routing**: Client-side routing.

### Backend
- **Runtime**: Node.js with TypeScript.
- **Framework**: Express.js.
- **Authentication**: Passport.js (local strategy, session-based).
- **ORM**: Drizzle ORM.
- **Real-time**: WebSocket support.
- **File Processing**: Sharp for image, custom for video.

### Database
- **Type**: PostgreSQL (Neon serverless).
- **ORM**: Drizzle with migrations.
- **Schema**: `shared/schema.ts`.

### Key Features
- **Authentication**: Session-based using Passport.js, scrypt for password hashing, protected routes, email verification with OTP codes (6-digit, 10-minute expiration).
- **Email Service**: Gmail integration for transactional emails (verification codes, password resets), automatic fallback to console logging for development.
- **Invite Codes**: Group-level invite codes (admin and member), team-level invite codes (admin and member), QR code support for easy onboarding. Both admin and member codes displayed in Admin Dashboard.
- **User Blocking**: Admin-only feature to block users from logging in via `isBlocked` field. Blocked users cannot authenticate even if their status is active. Checkbox UI in Admin Dashboard under each user's Status section.
- **File Storage**: Replit Object Storage for media (images, videos), automatic thumbnail generation, `shared/uploads/` path strategy.
- **Media Processing**: Sharp for images, custom MOV extractor for video thumbnails, MIME type validation.
- **Real-time**: WebSocket for notifications, presence tracking, automatic reconnection.
- **Post Management**: Create text, image, or video posts; support for general, memory_verse, and workout tracking types; reaction system; post deletion with cascade cleanup.
- **Messaging**: Private messaging, file attachments, image pasting, message history.
- **Onboarding**: Introductory video onboarding for team-less users, restricting posts to video only until team assignment.
- **Notifications**: Daily reminders for missed posts, SMS notifications via Twilio (opt-in only), user-configurable daily and confirmation message toggles.
- **Mobile UI**: Dedicated scroll container architecture for iOS momentum scrolling, header/nav auto-hide on scroll, pull-to-refresh on Home page (80px threshold), scroll position restoration when returning from video player.

### Data Flow
- **File Upload**: Client uploads, server validates, stores in Object Storage, generates thumbnail, records in DB, responds to client.
- **Authentication**: User submits credentials, Passport.js validates, session created, subsequent requests authenticated via session.
- **Post Creation**: Client submits post data, media processed/stored, DB transaction creates record, thumbnails generated, WebSocket notification sent.

## External Dependencies

### Core
- **@neondatabase/serverless**: PostgreSQL connection.
- **@replit/object-storage**: Cloud file storage.
- **drizzle-orm**: ORM.
- **passport**: Authentication.
- **sharp**: Image processing.
- **@tanstack/react-query**: Client-side data fetching.
- **twilio**: SMS notifications.

### UI
- **@radix-ui/***: UI component primitives.
- **tailwindcss**: CSS framework.
- **@tiptap/***: Rich text editor.

### Development
- **vite**: Build tool.
- **typescript**: Type checking.
- **tsx**: TypeScript execution.