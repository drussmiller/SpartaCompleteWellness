import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

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
    cookie: {
      secure: !isDevelopment,
      sameSite: isDevelopment ? 'lax' : 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
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
        console.log('Attempting login for:', username);

        // Special handling for admin user
        if (username.toLowerCase() === 'admin') {
          const adminUser = await storage.getUserByUsername('admin');
          if (adminUser && await comparePasswords(password, adminUser.password)) {
            return done(null, adminUser);
          }
          return done(null, false);
        }

        // Try to find user by username (case insensitive)
        let user = await storage.getUserByUsername(username);

        // If not found by username, try email (case insensitive)
        if (!user) {
          user = await storage.getUserByEmail(username);
        }

        if (!user) {
          console.log('User not found:', username);
          return done(null, false);
        }

        const isValid = await comparePasswords(password, user.password);
        if (!isValid) {
          console.log('Invalid password for user:', username);
          return done(null, false);
        }

        return done(null, user);
      } catch (error) {
        console.error('Login error:', error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      // Only log deserialization errors, not routine operations
      const user = await storage.getUser(id);
      if (!user) {
        console.log('User not found during deserialization:', id);
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

  app.post("/api/login", (req, res, next) => {
    console.log('Login attempt for:', req.body.username);
    passport.authenticate("local", (err, user) => {
      if (err) {
        console.error('Login error:', err);
        return next(err);
      }
      if (!user) {
        console.log('Login failed for:', req.body.username);
        return res.status(401).json({ message: "Invalid username/email or password" });
      }
      req.login(user, (err) => {
        if (err) {
          console.error('Session creation error:', err);
          return next(err);
        }
        console.log('Login successful for:', user.username);
        res.json(user);
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
    if (!req.isAuthenticated()) {
      console.log('Unauthenticated request to /api/user');
      return res.sendStatus(401);
    }
    console.log('Authenticated user:', req.user?.id);
    res.json(req.user);
  });
}