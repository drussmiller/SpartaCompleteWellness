import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { emailService } from "./email-service";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

// Authentication middleware
export function authenticate(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string) {
  try {
    const [hashed, salt] = stored.split(".");
    if (!hashed || !salt) return false;
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, KEY_LENGTH)) as Buffer;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
}

export function setupAuth(app: Express) {
  // Ensure we have a session secret
  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = randomBytes(32).toString('hex');
  }

  const isDevelopment = process.env.NODE_ENV !== 'production';
  console.log('Environment:', isDevelopment ? 'development' : 'production');

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    name: 'sparta.sid',
    rolling: true, // Reset expiration on each request
    cookie: {
      secure: !isDevelopment,
      sameSite: isDevelopment ? 'lax' : 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days instead of 24 hours
      httpOnly: true,
      path: '/',
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log('[AUTH] Attempting login for:', username);

        // Special handling for admin user
        if (username.toLowerCase() === 'admin') {
          console.log('[AUTH] Admin login path');
          const adminUser = await storage.getUserByUsername('admin');
          if (adminUser && await comparePasswords(password, adminUser.password)) {
            // Check if admin is blocked
            if (adminUser.isBlocked) {
              console.log('[AUTH] BLOCKED: Admin user is blocked:', username);
              return done(null, false);
            }
            // Check if admin is inactive
            if (adminUser.status === 0) {
              console.log('[AUTH] BLOCKED: Admin user is inactive:', username);
              return done(null, false);
            }
            console.log('[AUTH] Admin login successful');
            return done(null, adminUser);
          }
          console.log('[AUTH] Admin login failed - invalid credentials');
          return done(null, false);
        }

        // Try to find user by username (case insensitive)
        console.log('[AUTH] Looking up user by username:', username);
        let user = await storage.getUserByUsername(username);

        // If not found by username, try email (case insensitive)
        if (!user) {
          console.log('[AUTH] Not found by username, trying email lookup');
          user = await storage.getUserByEmail(username);
        }

        // If not found by email, try preferred name (case insensitive)
        if (!user) {
          console.log('[AUTH] Not found by email, trying preferred name lookup');
          user = await storage.getUserByPreferredName(username);
        }

        if (!user) {
          console.log('[AUTH] User not found:', username);
          return done(null, false);
        }

        console.log('[AUTH] User found:', user.username, 'ID:', user.id);
        
        // CRITICAL: Check if user is blocked - must happen before password check
        if (user.isBlocked) {
          console.log('[AUTH] BLOCKED: User is blocked:', username);
          return done(null, false);
        }
        
        // CRITICAL: Check if user is inactive - must happen before password check
        console.log('[AUTH] Status check - value:', user.status, 'type:', typeof user.status, 'is zero?:', user.status === 0);
        if (user.status === 0 || user.status === null || user.status === undefined) {
          console.log('[AUTH] BLOCKED: User is inactive (status=' + user.status + '):', username);
          return done(null, false);
        }

        console.log('[AUTH] Status check passed, verifying password');
        const isValid = await comparePasswords(password, user.password);
        if (!isValid) {
          console.log('[AUTH] Invalid password for user:', username);
          return done(null, false);
        }

        console.log('[AUTH] Authentication successful for:', username);
        return done(null, user);
      } catch (error) {
        console.error('[AUTH] Login error:', error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      // Fetch user directly from database to ensure fresh status check
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      
      if (!user) {
        console.log('User not found during deserialization:', id);
        return done(null, false);
      }
      
      // CRITICAL: Check if user is blocked - if so, invalidate the session immediately
      if (user.isBlocked) {
        console.log('BLOCKED: User is blocked and attempted to use session:', id, user.username);
        return done(null, false);
      }
      
      // CRITICAL: Check if user is inactive - if so, invalidate the session immediately
      if (user.status === 0) {
        console.log('BLOCKED: Inactive user (status=0) attempted to use session:', id, user.username);
        return done(null, false);
      }
      
      done(null, user);
    } catch (error) {
      console.error('Deserialization error:', error);
      done(error);
    }
  });

  // Auth routes
  app.post("/api/register", async (req, res, next) => {
    try {
      console.log('Registration attempt:', req.body.username);

      const { verificationCode } = req.body;

      // Check for existing username (case insensitive)
      const existingUsername = await storage.getUserByUsername(req.body.username);
      if (existingUsername) {
        console.log('Username already exists:', req.body.username);
        return res.status(400).json({ message: "Username already exists" });
      }

      // Check for existing email (case insensitive)
      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        console.log('Email already exists:', req.body.email);
        return res.status(400).json({ message: "Email already exists" });
      }

      // Verify email with code before creating account
      if (!verificationCode) {
        return res.status(400).json({ 
          message: "Email verification code is required",
          requiresVerification: true 
        });
      }

      // Check if email has been verified
      const { verificationCodes } = await import("@shared/schema");
      const [verification] = await db
        .select()
        .from(verificationCodes)
        .where(eq(verificationCodes.email, req.body.email))
        .orderBy(desc(verificationCodes.createdAt))
        .limit(1);

      if (!verification || !verification.verified) {
        return res.status(400).json({ 
          message: "Please verify your email before registering",
          requiresVerification: true 
        });
      }

      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      console.log('User created successfully:', user.id);

      // Notify all admins about the new user
      try {
        const admins = await storage.getAdminUsers();
        console.log(`Found ${admins.length} admins to notify about new user`);

        const notificationPromises = admins.map(admin =>
          storage.createNotification({
            userId: admin.id,
            title: "New User Registration",
            message: `${user.preferredName || user.username} has joined the platform.`,
            read: false,
            createdAt: new Date()
          })
        );

        await Promise.all(notificationPromises)
          .then(notifications => {
            console.log(`Successfully sent ${notifications.length} admin notifications`);
          })
          .catch(error => {
            console.error('Error sending some admin notifications:', error);
          });
      } catch (notifyError) {
        console.error('Failed to notify admins about new user:', notifyError);
      }

      req.login(user, (err) => {
        if (err) {
          console.error('Login error after registration:', err);
          return next(err);
        }
        res.status(201).json(user);
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  app.post("/api/login", async (req, res, next) => {
    console.log('Login attempt for:', req.body.username);
    
    passport.authenticate("local", (err, user) => {
      if (err) {
        console.error('Login error:', err);
        return next(err);
      }
      if (!user) {
        console.log('Login failed for:', req.body.username);
        return res.status(401).json({ message: "Invalid username/email/preferred name or password" });
      }
      
      // Fetch the user again from database to ensure we have the most current status
      // This prevents race conditions where status changed after authentication
      storage.getUser(user.id).then((freshUser) => {
        if (!freshUser) {
          console.log('User no longer exists:', user.username);
          return res.status(401).json({ message: "Invalid username/email/preferred name or password" });
        }
        
        if (freshUser.isBlocked) {
          console.log('Login blocked for blocked user:', freshUser.username);
          return res.status(403).json({ message: "Account has been blocked. Please contact an administrator." });
        }
        
        if (freshUser.status === 0) {
          console.log('Login blocked for inactive user:', freshUser.username);
          return res.status(403).json({ message: "Account is inactive. Please contact an administrator." });
        }
        
        req.login(freshUser, (err) => {
        if (err) {
          console.error('Session creation error:', err);
          return next(err);
        }
        console.log('Login successful for:', freshUser.username);
          res.json(freshUser);
        });
      }).catch((error) => {
        console.error('Error fetching user during login:', error);
        return res.status(500).json({ message: "Login failed" });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    const userId = req.user?.id;
    console.log('Logout request for user:', userId);
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return next(err);
      }
      console.log('Logout successful for user:', userId);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    console.log('GET /api/user - Session:', req.sessionID);
    console.log('GET /api/user - Is Authenticated:', req.isAuthenticated());
    console.log('GET /api/user - Session userId:', req.session?.userId);
    console.log('GET /api/user - Passport user:', req.user?.id);
    
    if (!req.isAuthenticated() || !req.user) {
      console.log('Unauthenticated request to /api/user');
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    console.log('Authenticated user:', req.user.id);
    console.log('User data being returned:', JSON.stringify({ id: req.user.id, username: req.user.username, avatarColor: req.user.avatarColor }));
    res.json(req.user);
  });

  // Password change endpoint for authenticated users
  app.post("/api/user/change-password", authenticate, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters long" });
      }

      // Get current user from database
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isCurrentPasswordValid = await comparePasswords(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash new password
      const hashedNewPassword = await hashPassword(newPassword);

      // Update password in database
      await storage.updateUser(user.id, { password: hashedNewPassword });

      console.log(`Password changed successfully for user: ${user.username}`);
      res.json({ message: "Password changed successfully" });
      
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // Admin password reset endpoint
  app.patch("/api/users/:userId/password", authenticate, async (req, res) => {
    try {
      const { newPassword } = req.body;
      const targetUserId = parseInt(req.params.userId);
      
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Check authorization
      const currentUser = await storage.getUser(req.user.id);
      if (!currentUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get target user first to check team membership
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Authorization: Admin, Group Admin, or Team Lead (for same team only)
      if (!currentUser.isAdmin && !currentUser.isGroupAdmin && !currentUser.isTeamLead) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Team Leads can only reset passwords for users in their team
      if (currentUser.isTeamLead && !currentUser.isAdmin && !currentUser.isGroupAdmin) {
        if (targetUser.teamId !== currentUser.teamId) {
          return res.status(403).json({ message: "You can only reset passwords for users in your team" });
        }
      }

      if (!newPassword) {
        return res.status(400).json({ message: "New password is required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters long" });
      }

      // Hash new password
      const hashedNewPassword = await hashPassword(newPassword);

      // Update password in database
      await storage.updateUser(targetUserId, { password: hashedNewPassword });

      console.log(`Password reset by user ${currentUser.username} (${currentUser.isAdmin ? 'Admin' : currentUser.isGroupAdmin ? 'Division Admin' : 'Team Lead'}) for user: ${targetUser.username}`);
      res.json({ message: "Password reset successfully" });
      
    } catch (error) {
      console.error('Error resetting password:', error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Forgot password endpoint - generates temporary password and emails it
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { userIdentifier } = req.body;
      
      if (!userIdentifier) {
        return res.status(400).json({ message: "User ID or Preferred Name is required" });
      }

      // Try to find user by ID first (if it's a number), then by preferred name
      let user = null;
      const userId = parseInt(userIdentifier);
      
      if (!isNaN(userId)) {
        // If it's a valid number, try to find by ID
        user = await storage.getUser(userId);
      }
      
      // If not found by ID, try by preferred name
      if (!user) {
        user = await storage.getUserByPreferredName(userIdentifier);
      }
      
      if (!user) {
        // For security, don't reveal if user exists or not
        return res.json({ message: "If an account with that user ID or preferred name exists, a password reset email has been sent." });
      }

      // Check if user has an email
      if (!user.email) {
        console.log(`User ${user.id} has no email address registered`);
        return res.json({ message: "If an account with that user ID or preferred name exists, a password reset email has been sent." });
      }

      // Generate a temporary password (8 characters: mix of letters and numbers)
      const tempPassword = randomBytes(4).toString('hex').toUpperCase();
      
      // Hash the temporary password
      const hashedTempPassword = await hashPassword(tempPassword);
      
      // Update user's password in database
      await storage.updateUser(user.id, { password: hashedTempPassword });
      
      // Send email with temporary password to the user's registered email
      await emailService.sendPasswordResetEmail(user.email, tempPassword);
      
      console.log(`Temporary password generated and sent to email for user ID/name: ${userIdentifier}`);
      res.json({ message: "If an account with that user ID or preferred name exists, a password reset email has been sent." });
      
    } catch (error) {
      console.error('Error in forgot password:', error);
      res.status(500).json({ message: "Failed to process password reset request" });
    }
  });
}