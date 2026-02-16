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
- **Role Hierarchy**: Admin > Organization Admin > Group Admin > Team Lead > User. Organization Admins manage groups, teams, and users within their assigned organization. Role-based UI controls hide buttons/sections based on the logged-in user's role level. `adminOrganizationId` is auto-set from the user's team when the Organization Admin role is assigned.
- **Email Service**: Gmail integration for transactional emails (verification codes, password resets), automatic fallback to console logging for development.
- **Invite Codes**: Organization-level invite codes (routes new users to the correct org before team assignment via `pendingOrganizationId`), group-level invite codes (admin and member), team-level invite codes (admin and member), QR code support for easy onboarding. Org invite codes displayed in Admin Dashboard per organization card with copy/regenerate buttons. Auto-association: if only one non-Admin organization exists, new teamless users are automatically associated with it. An "Admin" organization is auto-created on startup and the admin user is assigned to it; it is hidden from all org listings in the admin dashboard.
- **Division Management**: Divisions (groups) are managed directly within each Organization card in the Admin Dashboard — no standalone Divisions section. A default Division (named after the org) is auto-created when a new Organization is created via `storage.createOrganization()`. The "Create Division" button inside each org card opens a dialog scoped to that organization. Expandable division list shows name, status, teams count, competitive flag, invite codes, and full edit/delete capabilities. Group Admins manage their division via the separate Group Admin page.
- **User Blocking**: Admin-only feature to block users from logging in via `isBlocked` field. Blocked users cannot authenticate even if their status is active. Checkbox UI in Admin Dashboard under each user's Status section.
- **File Storage**: Google Cloud Storage via Replit sidecar (bucket: DEFAULT_OBJECT_STORAGE_BUCKET_ID env var), automatic thumbnail generation, `shared/uploads/` path strategy. Storage client initialized in `server/replit_integrations/object_storage/objectStorage.ts`.
- **Media Processing**: Sharp for images, custom MOV extractor for video thumbnails, MIME type validation.
- **Real-time**: WebSocket for notifications, presence tracking, automatic reconnection.
- **Post Management**: Create text, image, or video posts; support for general, memory_verse, and workout tracking types; reaction system; post deletion with cascade cleanup.
- **Messaging**: Private messaging, file attachments, image pasting, message history.
- **Onboarding**: Introductory video onboarding for team-less users, restricting posts to video only until team assignment. New User filter on Home page scoped by organization — org admins, group admins, and team leads only see new users pending for their organization. Hybrid "claim + review" system: new users can self-select their organization from a dropdown on the Join page (`POST /api/user/connect-organization`), setting their `pendingOrganizationId` for admin review before team assignment. Visual onboarding highlights guide new users: pulsing violet ring on Home button and + button (with "Start here"/"Post intro" tooltips) until intro video is posted, then highlights shift to Menu button and Join a Team button (with "Next step"/"Tap here" tooltips) until user joins a team. Hook: `use-onboarding.ts`. CSS animation: `onboarding-pulse` in `index.css`.
- **Name Uniqueness**: Division names must be unique within their organization and cannot match the parent organization's name. Team names must be unique within their division (enforced on both create and update, including when moving teams between divisions).
- **Notifications**: Daily reminders for missed posts via external cron service (cron-job.org calls `/api/check-notifications` endpoint hourly), SMS notifications via Twilio (opt-in only), user-configurable daily and confirmation message toggles. Works reliably with Autoscale deployments. See `EXTERNAL_CRON_SETUP.md` for setup instructions.
- **Display Settings**: Font size control (Small/Medium/Large/Extra Large) and dark/light mode toggle in user profile. Settings persisted in localStorage, applied via CSS classes on html element. Hook: `use-display-settings.ts`, initialized in `App.tsx`.
- **Mobile UI**: Dedicated scroll container architecture for iOS momentum scrolling, header/nav auto-hide on scroll, pull-to-refresh on Home page (80px threshold), scroll position restoration when returning from video player.
- **Donations & Autonomous Mode**: Stripe integration for donation processing with embedded payment form (Stripe Elements). Users without a team can donate any amount ($1 minimum) to unlock "autonomous mode" allowing them to create their own Organization, Group, and Team. Payment form is embedded inline (no redirects) for compatibility with Expo Go webview. Dual redundancy: client-side confirmation for fast UX + webhook backup for reliability. Key files: `stripeClient.ts`, `stripeWebhookHandlers.ts`, `stripe-donation-routes.ts`.

### Data Flow
- **File Upload**: Client uploads, server validates, stores in Object Storage, generates thumbnail, records in DB, responds to client.
- **Authentication**: User submits credentials, Passport.js validates, session created, subsequent requests authenticated via session.
- **Post Creation**: Client submits post data, media processed/stored, DB transaction creates record, thumbnails generated, WebSocket notification sent.

## External Dependencies

### Core
- **@neondatabase/serverless**: PostgreSQL connection.
- **@google-cloud/storage**: Cloud file storage via Replit sidecar endpoint.
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