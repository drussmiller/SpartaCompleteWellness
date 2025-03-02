import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import cookieParser from 'cookie-parser';

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

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
    console.log('Generated new session secret');
  }

  app.use(cookieParser(process.env.SESSION_SECRET));

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: false, // Set to false for development
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    name: 'sid'
  };

  console.log('Setting up session middleware with store:', sessionSettings.store.constructor.name);

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy({
      usernameField: 'email',
      passwordField: 'password'
    }, async (emailOrUsername, password, done) => {
      try {
        console.log('Login attempt:', { emailOrUsername });
        let user = await storage.getUserByEmail(emailOrUsername);

        if (!user) {
          console.log('Trying username lookup for:', emailOrUsername);
          user = await storage.getUserByUsername(emailOrUsername);
        }

        if (!user) {
          console.log('User not found:', emailOrUsername);
          return done(null, false);
        }

        const isValid = await comparePasswords(password, user.password);
        console.log('Password validation result:', { userId: user.id, isValid });

        if (!isValid) {
          return done(null, false);
        }

        console.log('Login successful for user:', { id: user.id, email: user.email });
        return done(null, user);
      } catch (error) {
        console.error('Login error:', error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    console.log('Serializing user:', { id: user.id });
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
      console.log('Successfully deserialized user:', { id: user.id });
      done(null, user);
    } catch (error) {
      console.error('Deserialization error:', error);
      done(error);
    }
  });

  app.get("/api/user", (req, res) => {
    console.log('GET /api/user:', {
      sessionId: req.sessionID,
      isAuthenticated: req.isAuthenticated(),
      user: req.user?.id,
      cookies: req.cookies,
      signedCookies: req.signedCookies
    });

    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    res.json(req.user);
  });

  app.post("/api/login", (req, res, next) => {
    console.log('POST /api/login attempt:', { email: req.body.email });
    passport.authenticate("local", (err: any, user: any) => {
      if (err) {
        console.error('Authentication error:', err);
        return res.status(500).json({ error: "Internal server error" });
      }
      if (!user) {
        console.log('Login failed - invalid credentials');
        return res.status(401).json({ error: "Invalid credentials" });
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return res.status(500).json({ error: "Failed to establish session" });
        }
        console.log('Login successful:', { 
          userId: user.id,
          sessionId: req.sessionID,
          cookies: req.cookies,
          signedCookies: req.signedCookies
        });
        res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    const userId = req.user?.id;
    console.log('Logout request:', { userId, sessionId: req.sessionID });
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: "Failed to logout" });
      }
      console.log('Logout successful:', { userId });
      res.sendStatus(200);
    });
  });
}