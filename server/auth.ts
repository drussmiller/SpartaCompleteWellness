import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
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
const KEY_LENGTH = 64; // Consistent key length for both hashing and comparison

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

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy({
      usernameField: 'email',
      passwordField: 'password'
    }, async (email, password, done) => {
      try {
        console.log('Attempting login for email:', email);
        const user = await storage.getUserByEmail(email);

        if (!user) {
          console.log('User not found:', email);
          return done(null, false);
        }

        const isValid = await comparePasswords(password, user.password);
        console.log('Password validation result:', isValid);

        if (!isValid) {
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
    console.log('Serializing user:', user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      console.log('Deserializing user:', id);
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

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      console.log('Unauthenticated request to /api/user');
      return res.sendStatus(401);
    }
    console.log('Authenticated user:', req.user.id);
    res.json(req.user);
  });

  app.post("/api/login", (req, res, next) => {
    console.log('Login attempt for:', req.body.username);
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error('Login error:', err);
        return next(err);
      }
      if (!user) {
        console.log('Login failed for:', req.body.username);
        return res.status(401).json({ error: "Invalid username or password" });
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
}