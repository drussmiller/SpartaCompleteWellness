# Team Fitness Tracker

A full-stack fitness tracking application built with modern web technologies. This application allows users to create posts, share media (images and videos), track fitness activities, send messages, and manage team-based fitness goals within a three-level organizational hierarchy.

## 🏗️ Architecture

The application follows a **Organization → Group → Team** hierarchy where:
- **Users** belong to **Teams** (fundamental working unit)
- **Teams** belong to **Groups** 
- **Groups** belong to **Organizations**
- **Prayer Requests** are scoped to Organization level (users see prayer requests from anyone in their organization)
- **Other features** remain team-scoped for focused collaboration

## ⚡ Tech Stack

### Frontend
- **React** with TypeScript
- **Vite** for fast development and optimized builds
- **Tailwind CSS** with shadcn/ui components
- **Radix UI** primitives for accessible components
- **React Query** (@tanstack/react-query) for server state management
- **Wouter** for client-side routing

### Backend
- **Node.js** with TypeScript
- **Express.js** HTTP server
- **Passport.js** authentication with session-based auth
- **Drizzle ORM** for type-safe database operations
- **WebSocket** support for real-time notifications
- **Sharp** for image processing and thumbnails

### Database & Storage
- **PostgreSQL** (Neon serverless) as primary database
- **Replit Object Storage** for media files with automatic thumbnail generation
- **Drizzle migrations** for schema management

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- Replit Object Storage token (for media files)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd team-fitness-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   DATABASE_URL=your_postgresql_connection_string
   REPLIT_OBJECT_STORAGE_TOKEN=your_replit_storage_token
   SESSION_SECRET=your_session_secret
   ```

4. **Set up the database**
   ```bash
   npm run db:push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5000`

## 📱 Features

### Core Functionality
- **Multi-level Organization Management**: Create and manage Organizations, Groups, and Teams
- **User Authentication**: Secure session-based authentication with password hashing
- **Post Creation**: Share text, images, and videos with automatic thumbnail generation
- **Real-time Messaging**: Private messaging between users with file attachments
- **Media Processing**: Automatic image resizing and video thumbnail extraction
- **Activity Tracking**: Track fitness activities and team progress with individual program start dates
  - Personalized week and day calculations based on each user's program start date
  - Monday-aligned program schedules for consistency
  - Dynamic progress tracking across Activity and Admin pages
- **Prayer Requests**: Organization-wide prayer request sharing
- **Admin Dashboard**: Complete CRUD operations for all organizational levels

### Administrative Features
- **Organization Management**: Create, edit, and delete organizations
- **Group Management**: Manage groups within organizations 
- **Team Management**: Handle team creation and assignment
- **User Management**: User administration with role management, including:
  - Individual program start date assignment (Monday-only selection)
  - Custom progress tracking based on user's program start date
  - Editable user profiles with date joined and program start information
- **Real-time Notifications**: WebSocket-based live updates

## 🗂️ Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/         # Application pages
│   │   ├── hooks/         # Custom React hooks
│   │   └── lib/           # Utilities and configurations
├── server/                # Backend Express application
│   ├── routes.ts          # API route definitions
│   ├── storage.ts         # Database operations
│   └── vite.ts           # Vite integration
├── shared/                # Shared types and schemas
│   └── schema.ts         # Database schema and types
└── dist/                 # Production build output
```

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run db:push` - Push database schema changes
- `npm run db:push --force` - Force push schema (data loss warning)

### Database Management

The application uses Drizzle ORM for database operations. Schema changes should be made in `shared/schema.ts` and deployed using:

```bash
npm run db:push
```

#### Key Schema Features
- **User Table**: Includes `program_start_date` field for individualized program tracking
- **Activity Tracking**: Week and day calculations use user-specific program start dates
- **Timezone Handling**: UTC offset calculations for accurate local time tracking

### File Storage

Media files are stored in Replit Object Storage with automatic processing:
- **Images**: Resized and optimized with Sharp
- **Videos**: Thumbnail extraction for previews
- **Path Strategy**: Uses `shared/uploads/` prefix for cross-environment compatibility

## 🔐 Authentication & Security

- **Session-based authentication** using Passport.js
- **Password hashing** with scrypt and salt
- **Protected routes** with middleware authentication
- **Input validation** using Zod schemas
- **File type validation** for uploads

## 🌐 Deployment

The application is designed to run on Replit with:
- **Single Node.js process** serving both static files and API
- **Environment-specific configurations** for database and storage
- **Automatic file cleanup** and thumbnail caching
- **WebSocket support** for real-time features

### Production Build
```bash
npm run build
```

This creates optimized builds in `dist/`:
- Client: `dist/public/`
- Server: `dist/index.js`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Replit Object Storage Documentation](https://docs.replit.com/hosting/object-storage)
- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Radix UI Components](https://www.radix-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)

---

Built with ❤️ for team fitness and spiritual growth