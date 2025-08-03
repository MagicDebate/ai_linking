import express, { type Express } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { storage } from "./storage";
import { 
  generateTokens, 
  hashPassword, 
  comparePassword, 
  setTokenCookies, 
  clearTokenCookies, 
  authenticateToken 
} from "./auth";
import { registerUserSchema, loginUserSchema, insertProjectSchema, fieldMappingSchema } from "@shared/schema";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import type { AuthRequest } from "./auth";

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  message: { message: "Too many authentication attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(cookieParser());
  app.use(passport.initialize());
  
  // Serve static files from public directory
  app.use("/static", express.static("public/static"));

  // Setup Google OAuth
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (googleClientId && googleClientSecret) {
    passport.use(new GoogleStrategy({
      clientID: googleClientId,
      clientSecret: googleClientSecret,
      callbackURL: "/auth/google/callback"
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) {
          return done(new Error("No email found in Google profile"));
        }

        let user = await storage.getUserByEmail(email);
        
        if (user) {
          // User exists, update Google ID if not set
          if (!user.googleId) {
            user = await storage.updateUser(user.id, { googleId: profile.id });
          }
        } else {
          // Create new user
          user = await storage.createUser({
            email,
            provider: "GOOGLE",
            googleId: profile.id,
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }));
  }

  // Apply rate limiting to all auth routes
  app.use("/auth/*", authLimiter);

  // Registration endpoint
  app.post("/auth/register", async (req, res) => {
    try {
      const validation = registerUserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validation.error.errors 
        });
      }

      const { email, password } = validation.data;

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "User already exists" });
      }

      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        email,
        passwordHash,
        provider: "LOCAL",
      });

      // Generate tokens and set cookies
      const { accessToken, refreshToken } = generateTokens(user.id, user.email);
      setTokenCookies(res, accessToken, refreshToken);

      res.status(200).json({
        message: "Registration successful",
        user: {
          id: user.id,
          email: user.email,
          provider: user.provider,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Login endpoint
  app.post("/auth/login", async (req, res) => {
    try {
      const validation = loginUserSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validation.error.errors 
        });
      }

      const { email, password } = validation.data;

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Verify password
      const isValidPassword = await comparePassword(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Generate tokens and set cookies
      const { accessToken, refreshToken } = generateTokens(user.id, user.email);
      setTokenCookies(res, accessToken, refreshToken);

      res.status(200).json({
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          provider: user.provider,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Google OAuth routes
  app.get("/auth/google", 
    passport.authenticate("google", { scope: ["profile", "email"] })
  );

  app.get("/auth/google/callback",
    passport.authenticate("google", { session: false }),
    (req, res) => {
      const user = req.user as any;
      if (user) {
        const { accessToken, refreshToken } = generateTokens(user.id, user.email);
        setTokenCookies(res, accessToken, refreshToken);
        res.redirect("/");
      } else {
        res.redirect("/auth?error=google_auth_failed");
      }
    }
  );

  // Get current user endpoint
  app.get("/auth/me", authenticateToken, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        id: user.id,
        email: user.email,
        provider: user.provider,
        createdAt: user.createdAt,
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Logout endpoint
  app.post("/auth/logout", (req, res) => {
    clearTokenCookies(res);
    res.json({ message: "Logout successful" });
  });

  // API routes for dashboard
  
  // Get projects
  app.get("/api/projects", authenticateToken, async (req: any, res) => {
    try {
      const projects = await storage.getProjects(req.user.id);
      res.json(projects);
    } catch (error) {
      console.error("Get projects error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get single project
  app.get("/api/projects/:id", authenticateToken, async (req: any, res) => {
    try {
      const project = await storage.getProjectById(req.params.id);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Get project error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create project
  app.post("/api/projects", authenticateToken, async (req: any, res) => {
    try {
      const validation = insertProjectSchema.safeParse({
        ...req.body,
        userId: req.user.id
      });
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validation.error.errors 
        });
      }

      const project = await storage.createProject(validation.data);
      
      // Update user progress
      await storage.updateUserProgress(req.user.id, { createProject: "true" });
      
      res.status(201).json(project);
    } catch (error) {
      console.error("Create project error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete project
  app.delete("/api/projects/:id", authenticateToken, async (req: any, res) => {
    try {
      await storage.deleteProject(req.params.id, req.user.id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete project error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get user progress
  app.get("/api/progress", authenticateToken, async (req: any, res) => {
    try {
      const progress = await storage.getUserProgress(req.user.id);
      
      if (!progress) {
        // Return default progress
        res.json({
          createProject: false,
          uploadTexts: false,
          setPriorities: false,
          generateDraft: false
        });
      } else {
        res.json({
          createProject: progress.createProject === "true",
          uploadTexts: progress.uploadTexts === "true",
          setPriorities: progress.setPriorities === "true",
          generateDraft: progress.generateDraft === "true"
        });
      }
    } catch (error) {
      console.error("Get progress error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get notifications
  app.get("/api/notifications", authenticateToken, async (req: any, res) => {
    try {
      const notifications = await storage.getNotifications(req.user.id);
      res.json(notifications.filter(n => n.dismissed === "false"));
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Dismiss notification
  app.post("/api/notifications/:id/dismiss", authenticateToken, async (req: any, res) => {
    try {
      await storage.dismissNotification(req.params.id, req.user.id);
      res.status(204).send();
    } catch (error) {
      console.error("Dismiss notification error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Configure multer for file uploads
  const upload = multer({
    dest: "./uploads",
    limits: {
      fileSize: 250 * 1024 * 1024, // 250MB
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['.csv', '.json'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedTypes.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error('Only CSV and JSON files are allowed'));
      }
    }
  });

  // In-memory store for import data
  const importStore = new Map<string, {
    headers: string[];
    rows: string[][];
    fileName: string;
    fileSize: number;
  }>();

  // Import endpoints
  
  // Upload file
  app.post("/api/upload", authenticateToken, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const uploadId = crypto.randomUUID();
      const filePath = req.file.path;
      const fileName = req.file.originalname;
      const fileSize = req.file.size;

      // Parse CSV file
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        return res.status(400).json({ message: "File is empty" });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const rows = lines.slice(1, 4).map(line => 
        line.split(',').map(cell => cell.trim().replace(/"/g, ''))
      );

      const projectId = req.body.projectId;
      if (!projectId) {
        return res.status(400).json({ message: "Project ID is required" });
      }

      // Verify project ownership
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Save import record
      await storage.createImport({
        id: uploadId,
        projectId,
        fileName,
        filePath,
        status: "PENDING",
        fieldMapping: null,
        processedAt: null,
      });

      res.json({ uploadId, preview: { headers, rows } });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  // Get preview
  app.get("/api/import/preview", authenticateToken, async (req: any, res) => {
    try {
      const { uploadId } = req.query;
      
      if (!uploadId) {
        return res.status(400).json({ message: "uploadId is required" });
      }

      const importData = importStore.get(uploadId);
      if (!importData) {
        return res.status(404).json({ message: "Import data not found" });
      }

      res.json({
        headers: importData.headers,
        rows: importData.rows
      });
    } catch (error) {
      console.error("Preview error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Field mapping endpoint
  app.post("/api/field-mapping", authenticateToken, async (req: any, res) => {
    try {
      const validation = fieldMappingSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validation.error.errors 
        });
      }

      const { uploadId, fieldMapping } = validation.data;
      
      // Get import record
      const importRecord = await storage.getImportByUploadId(uploadId);
      if (!importRecord) {
        return res.status(404).json({ message: "Import not found" });
      }

      // Verify project ownership
      const project = await storage.getProjectById(importRecord.projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Update field mapping
      await storage.updateImportFieldMapping(uploadId, JSON.stringify(fieldMapping));
      
      // Update user progress
      await storage.updateUserProgress(req.user.id, { uploadTexts: true });

      res.json({ success: true });
    } catch (error) {
      console.error("Field mapping error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get project API key
  app.get("/api/projects/:id/api-key", authenticateToken, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const apiKey = await storage.getProjectApiKey(projectId);
      
      if (!apiKey) {
        return res.status(404).json({ message: "API key not found" });
      }

      res.json({ apiKey: apiKey.apiKey });
    } catch (error) {
      console.error("Get API key error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create project API key
  app.post("/api/projects/:id/api-key", authenticateToken, async (req: any, res) => {
    try {
      const projectId = req.params.id;
      const apiKey = `pk_${crypto.randomBytes(32).toString('hex')}`;
      
      const newApiKey = await storage.createProjectApiKey(projectId, apiKey);
      
      res.json({ apiKey: newApiKey.apiKey });
    } catch (error) {
      console.error("Create API key error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
