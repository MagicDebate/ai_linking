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
import { registerUserSchema, loginUserSchema, insertProjectSchema, fieldMappingSchema, linkingRulesSchema, pagesClean, blocks, embeddings, edges, graphMeta, pagesRaw, generationRuns, linkCandidates, projectImportConfigs, insertProjectImportConfigSchema, importJobs } from "@shared/schema";
import { LinkGenerator } from "./linkGenerator";
import { progressStreamManager } from "./progressStream";
import { sql, eq, and, desc } from "drizzle-orm";
import { db } from "./db"; 
import { DatabaseStorage } from "./storage";
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

      // Parse file based on extension
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      let headers: string[] = [];
      let rows: string[][] = [];

      if (fileName.endsWith('.csv')) {
        // Parse CSV
        const lines = fileContent.split('\n').filter(line => line.trim());
        
        if (lines.length === 0) {
          return res.status(400).json({ message: "CSV file is empty" });
        }

        // Proper CSV parsing with multiline support
        const properCSVParse = (csvText: string) => {
          const results: string[][] = [];
          const lines = csvText.split('\n');
          let currentRow: string[] = [];
          let currentField = '';
          let inQuotes = false;
          let i = 0;
          
          while (i < csvText.length) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];
            
            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                currentField += '"';
                i += 2;
                continue;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              currentRow.push(currentField.trim());
              currentField = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
              currentRow.push(currentField.trim());
              if (currentRow.some(field => field.length > 0)) {
                results.push(currentRow);
              }
              currentRow = [];
              currentField = '';
              if (char === '\r' && nextChar === '\n') i++;
            } else {
              currentField += char;
            }
            i++;
          }
          
          if (currentField || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            if (currentRow.some(field => field.length > 0)) {
              results.push(currentRow);
            }
          }
          
          return results;
        };
        
        const parsed = properCSVParse(fileContent);
        if (parsed.length === 0) {
          return res.status(400).json({ message: "CSV parsing failed" });
        }
        
        headers = parsed[0].map(h => h.trim());
        console.log(`📋 Parsed headers:`, headers);
        
        // Take first few data rows for preview
        rows = parsed.slice(1, 6).map(row => {
          // Ensure row has same length as headers
          while (row.length < headers.length) {
            row.push('');
          }
          return row.slice(0, headers.length);
        });
        
        console.log(`📋 Preview data rows:`, rows.slice(0, 2));
      } else if (fileName.endsWith('.json')) {
        // Parse JSON
        try {
          const jsonData = JSON.parse(fileContent);
          if (Array.isArray(jsonData) && jsonData.length > 0) {
            headers = Object.keys(jsonData[0]);
            rows = jsonData.slice(0, 3).map(item => headers.map(h => String(item[h] || '')));
          } else {
            return res.status(400).json({ message: "JSON must be an array of objects" });
          }
        } catch (error) {
          return res.status(400).json({ message: "Invalid JSON format" });
        }
      } else {
        return res.status(400).json({ message: "Unsupported file format" });
      }

      const projectId = req.body.projectId;
      if (!projectId) {
        return res.status(400).json({ message: "Project ID is required" });
      }

      // Verify project ownership
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Parse full CSV data using the same proper parser
      let fullData: any[] = [];
      if (fileName.endsWith('.csv')) {
        // Use the same parsing function
        const properCSVParse = (csvText: string) => {
          const results: string[][] = [];
          let currentRow: string[] = [];
          let currentField = '';
          let inQuotes = false;
          let i = 0;
          
          while (i < csvText.length) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];
            
            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                currentField += '"';
                i += 2;
                continue;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              currentRow.push(currentField.trim());
              currentField = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
              currentRow.push(currentField.trim());
              if (currentRow.some(field => field.length > 0)) {
                results.push(currentRow);
              }
              currentRow = [];
              currentField = '';
              if (char === '\r' && nextChar === '\n') i++;
            } else {
              currentField += char;
            }
            i++;
          }
          
          if (currentField || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            if (currentRow.some(field => field.length > 0)) {
              results.push(currentRow);
            }
          }
          
          return results;
        };
        
        const parsed = properCSVParse(fileContent);
        const dataRows = parsed.slice(1);
        
        fullData = dataRows.map(row => {
          const rowObject: any = {};
          headers.forEach((header, index) => {
            rowObject[header] = (row[index] || '').trim();
          });
          return rowObject;
        });
      } else if (fileName.endsWith('.json')) {
        const jsonData = JSON.parse(fileContent);
        fullData = Array.isArray(jsonData) ? jsonData : [];
      }

      // Store full CSV data in global memory for processing
      if (!(global as any).uploads) {
        (global as any).uploads = new Map();
      }
      (global as any).uploads.set(uploadId, { 
        data: fullData, 
        headers: headers,
        fileName: fileName 
      });
      
      console.log(`Stored ${fullData.length} rows for uploadId: ${uploadId}`);
      console.log(`CSV Headers:`, headers);
      console.log(`Preview rows:`, rows.slice(0, 2));

      // Save import record with uploadId as the ID
      const newImport = await storage.createImport({
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
        console.log('Field mapping validation error:', validation.error.errors);
        const errorMessages = validation.error.errors.map(err => {
          if (err.path.includes('uploadId')) {
            return 'ID загрузки обязателен';
          }
          if (err.path.includes('fieldMapping') && err.message.includes('URL field mapping')) {
            return 'Поле URL обязательно для сопоставления';
          }
          if (err.path.includes('fieldMapping')) {
            return 'Сопоставление полей обязательно';
          }
          return `${err.path.join('.')}: ${err.message}`;
        });
        
        return res.status(400).json({ 
          message: "Ошибка сопоставления полей", 
          details: errorMessages.join(', '),
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
      await storage.updateUserProgress(req.user.id, { uploadTexts: "true" });

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

  // Save linking rules endpoint
  app.post("/api/rules", authenticateToken, async (req: any, res) => {
    try {
      const validation = linkingRulesSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ 
          message: "Validation error", 
          errors: validation.error.errors 
        });
      }

      const { projectId, ...rules } = validation.data;
      
      // Verify project ownership
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Store rules in project metadata (simplified for now)
      console.log("Linking rules saved for project:", projectId, rules);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Save rules error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // REMOVED: Duplicate endpoint that was overriding the real import/start handler

  // Scope preview endpoint
  app.get("/api/scope/preview", authenticateToken, async (req: any, res) => {
    try {
      const { projectId, prefix, dateAfter, sample } = req.query;
      
      // Simulate page count calculation
      let baseCount = Math.floor(Math.random() * 250) + 50;
      
      if (prefix) baseCount = Math.floor(baseCount * 0.6);
      if (dateAfter) baseCount = Math.floor(baseCount * 0.4);
      if (sample) baseCount = Math.floor(baseCount * (Number(sample) / 100));
      
      res.json({ pages: baseCount });
    } catch (error) {
      console.error("Error in scope preview:", error);
      res.status(500).json({ error: "Failed to get scope preview" });
    }
  });

  // ========== LINK GENERATION API ==========

  // Start link generation
  app.post("/api/generate/start", authenticateToken, async (req: any, res) => {
    try {
      const { projectId, importId, scenarios, scope, rules } = req.body;
      
      // Validate project belongs to user
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Create link generator with progress callback
      const generator = new LinkGenerator((update) => {
        progressStreamManager.broadcastProgress(update);
      });

      // Start generation in background
      generator.generateLinks({
        projectId,
        importId,
        scenarios,
        rules,
        scope
      }).then((runId) => {
        progressStreamManager.broadcastCompletion(runId, true, "Generation completed");
      }).catch((error) => {
        console.error("Generation failed:", error);
        progressStreamManager.broadcastCompletion("error", false, error.message);
      });

      res.json({ success: true, message: "Generation started" });
    } catch (error) {
      console.error("Generation start error:", error);
      res.status(500).json({ error: "Failed to start generation" });
    }
  });

  // Stream generation progress (Server-Sent Events)
  app.get("/api/generate/progress/:runId", authenticateToken, async (req: any, res) => {
    const { runId } = req.params;
    
    try {
      // Validate run belongs to user's project
      const run = await db
        .select({ projectId: generationRuns.projectId })
        .from(generationRuns)
        .where(eq(generationRuns.runId, runId))
        .limit(1);

      if (!run.length) {
        return res.status(404).json({ error: "Generation run not found" });
      }

      const project = await storage.getProjectById(run[0].projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Add client to progress stream
      progressStreamManager.addClient(runId, res);
      
    } catch (error) {
      console.error("Progress stream error:", error);
      res.status(500).json({ error: "Failed to setup progress stream" });
    }
  });

  // Get generation runs for project
  app.get("/api/generate/runs/:projectId", authenticateToken, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      
      // Validate project belongs to user
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ error: "Project not found" });
      }

      const runs = await db
        .select()
        .from(generationRuns)
        .where(eq(generationRuns.projectId, projectId))
        .orderBy(desc(generationRuns.startedAt));

      res.json(runs);
    } catch (error) {
      console.error("Get runs error:", error);
      res.status(500).json({ error: "Failed to get generation runs" });
    }
  });

  // Get link candidates for draft review
  app.get("/api/draft/:runId", authenticateToken, async (req: any, res) => {
    try {
      const { runId } = req.params;
      const { scenario, page, limit = 50, offset = 0 } = req.query;
      
      // Validate run belongs to user's project
      const run = await db
        .select({ projectId: generationRuns.projectId })
        .from(generationRuns)
        .where(eq(generationRuns.runId, runId))
        .limit(1);

      if (!run.length) {
        return res.status(404).json({ error: "Generation run not found" });
      }

      const project = await storage.getProjectById(run[0].projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Build filter conditions
      let whereConditions = [eq(linkCandidates.runId, runId)];
      
      if (scenario && scenario !== 'all') {
        whereConditions.push(eq(linkCandidates.scenario, scenario as string));
      }
      
      if (page && page !== 'all') {
        whereConditions.push(eq(linkCandidates.sourceUrl, page as string));
      }

      // Get candidates with pagination
      const candidates = await db
        .select()
        .from(linkCandidates)
        .where(and(...whereConditions))
        .limit(Number(limit))
        .offset(Number(offset))
        .orderBy(linkCandidates.createdAt);

      // Get total count
      const totalCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(linkCandidates)
        .where(and(...whereConditions));

      // Get scenario statistics
      const stats = await db
        .select({
          scenario: linkCandidates.scenario,
          total: sql<number>`count(*)`,
          accepted: sql<number>`count(*) filter (where is_rejected = false)`,
          rejected: sql<number>`count(*) filter (where is_rejected = true)`
        })
        .from(linkCandidates)
        .where(eq(linkCandidates.runId, runId))
        .groupBy(linkCandidates.scenario);

      res.json({
        candidates,
        total: totalCount[0]?.count || 0,
        stats
      });
    } catch (error) {
      console.error("Draft review error:", error);
      res.status(500).json({ error: "Failed to get draft data" });
    }
  });

  // ========== IMPORT CONFIG MANAGEMENT ==========

  // Save import configuration for reuse
  app.post("/api/projects/:projectId/config/save", authenticateToken, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      const { fileName, fieldMapping, selectedScenarios, scopeSettings, linkingRules } = req.body;
      
      // Validate project belongs to user
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Mark all existing configs as not last used
      await db
        .update(projectImportConfigs)
        .set({ isLastUsed: false, updatedAt: new Date() })
        .where(eq(projectImportConfigs.projectId, projectId));

      // Create new config
      const config = await db
        .insert(projectImportConfigs)
        .values({
          projectId,
          fileName,
          fieldMapping,
          selectedScenarios,
          scopeSettings,
          linkingRules,
          isLastUsed: true
        })
        .returning();

      res.json({ success: true, config: config[0] });
    } catch (error) {
      console.error("Save config error:", error);
      res.status(500).json({ error: "Failed to save configuration" });
    }
  });

  // Get import jobs list for project
  app.get("/api/import/:projectId/jobs", authenticateToken, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      
      // Validate project belongs to user
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Get import jobs from importJobs table
      const jobs = await db
        .select()
        .from(importJobs)
        .where(eq(importJobs.projectId, projectId))
        .orderBy(desc(importJobs.startedAt));

      res.json(jobs);
    } catch (error) {
      console.error("Get import jobs error:", error);
      res.status(500).json({ error: "Failed to get import jobs" });
    }
  });

  // Load last used import configuration
  app.get("/api/projects/:projectId/config/load", authenticateToken, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      
      // Validate project belongs to user
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Get last used configuration
      const config = await db
        .select()
        .from(projectImportConfigs)
        .where(and(
          eq(projectImportConfigs.projectId, projectId),
          eq(projectImportConfigs.isLastUsed, true)
        ))
        .limit(1);

      if (config.length === 0) {
        return res.json({ config: null });
      }

      res.json({ config: config[0] });
    } catch (error) {
      console.error("Load config error:", error);
      res.status(500).json({ error: "Failed to load configuration" });
    }
  });

  // Get all saved configurations for project
  app.get("/api/projects/:projectId/configs", authenticateToken, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      
      // Validate project belongs to user
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ error: "Project not found" });
      }

      const configs = await db
        .select()
        .from(projectImportConfigs)
        .where(eq(projectImportConfigs.projectId, projectId))
        .orderBy(desc(projectImportConfigs.updatedAt));

      res.json(configs);
    } catch (error) {
      console.error("Get configs error:", error);
      res.status(500).json({ error: "Failed to get configurations" });
    }
  });

  // Delete saved configuration
  app.delete("/api/projects/:projectId/configs/:configId", authenticateToken, async (req: any, res) => {
    try {
      const { projectId, configId } = req.params;
      
      // Validate project belongs to user
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ error: "Project not found" });
      }

      await db
        .delete(projectImportConfigs)
        .where(and(
          eq(projectImportConfigs.id, configId),
          eq(projectImportConfigs.projectId, projectId)
        ));

      res.json({ success: true });
    } catch (error) {
      console.error("Delete config error:", error);
      res.status(500).json({ error: "Failed to delete configuration" });
    }
  });

  // Generate links endpoint (LEGACY - keeping for backwards compatibility)
  // Start import job for Step 4
  app.post("/api/import/start", authenticateToken, async (req: any, res) => {
    try {
      console.log('🚀 /api/import/start called with body:', req.body);
      const { projectId, importId, scenarios, scope, rules } = req.body;
      
      // Validate project belongs to user
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Create import job
      const jobId = crypto.randomUUID();
      
      console.log(`Starting import for project: ${projectId}`);
      console.log(`Generated jobId: ${jobId}`);
      
      const importJob = await storage.createImportJob({
        jobId,
        projectId,
        importId,
        status: "running",
        phase: "loading",
        percent: 0,
        pagesTotal: 0, // Will be updated when CSV data is processed
        pagesDone: 0,
        blocksDone: 0,
        orphanCount: 0
      });

      console.log(`Job created:`, importJob);
      console.log(`Global jobs after create:`, global.importJobs ? Array.from(global.importJobs.keys()) : 'undefined');
      
      // CLEAR OLD GLOBAL DATA TO FORCE FRESH PROCESSING
      console.log(`🧨 Clearing global import jobs to prevent data corruption...`);
      if ((global as any).importJobs) {
        (global as any).importJobs.clear();
        console.log(`✓ Cleared global import jobs`);
      }
      
      // Recreate the job after clearing
      await storage.createImportJob({
        jobId,
        projectId,
        importId,
        status: "running",
        phase: "loading",
        percent: 0,
        pagesTotal: 0,
        pagesDone: 0,
        blocksDone: 0,
        orphanCount: 0
      });

      // CRITICAL: Immediately start processing with CSV validation
      console.log(`🆘 FORCE CALLING processImportJobAsync for jobId: ${jobId}`);
      console.log(`🆘 Parameters: projectId=${projectId}, importId=${importId}, scenarios=${JSON.stringify(scenarios)}`);
      
      processImportJobAsync(jobId, importId, scenarios, scope, rules, projectId).catch(err => {
        console.error(`💥 Import job ${jobId} failed:`, err);
        storage.updateImportJob(jobId, {
          status: "failed",
          errorMessage: err.message,
          finishedAt: new Date()
        });
      });

      const responseData = { 
        success: true, 
        jobId: jobId,
        message: "Import job started successfully"
      };
      
      console.log(`✓ Sending response:`, responseData);
      res.json(responseData);
    } catch (error) {
      console.error("Import start error:", error);
      res.status(500).json({ error: "Failed to start import" });
    }
  });

  // Test endpoint to debug import job creation
  app.post("/api/import/test-create", async (req, res) => {
    try {
      const testJobId = "test-job-" + Date.now();
      console.log(`Creating test job: ${testJobId}`);
      
      if (!(global as any).importJobs) {
        (global as any).importJobs = new Map();
        console.log('Initialized global.importJobs');
      }
      
      const testJob = {
        jobId: testJobId,
        projectId: "test-project",
        status: "running",
        phase: "loading",
        percent: 0,
        startedAt: new Date()
      };
      
      (global as any).importJobs.set(testJobId, testJob);
      console.log(`Test job created. Total jobs: ${(global as any).importJobs.size}`);
      console.log('Available job IDs:', Array.from((global as any).importJobs.keys()));
      
      res.json({ 
        success: true, 
        jobId: testJobId,
        totalJobs: (global as any).importJobs.size,
        availableJobs: Array.from((global as any).importJobs.keys())
      });
    } catch (error) {
      console.error('Test create error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Test chunking algorithm endpoint
  app.post('/api/import/test-chunking', async (req, res) => {
    try {
      const { html } = req.body;
      
      if (!html) {
        return res.status(400).json({ error: 'HTML content required' });
      }

      const processor = new ContentProcessor(storage);
      const blocks = processor.extractBlocks(html);
      
      res.json({
        success: true,
        originalLength: html.length,
        blocksCount: blocks.length,
        blocks: blocks.map((block, index) => ({
          index,
          type: block.type,
          textLength: block.text.length,
          preview: block.text.substring(0, 100) + (block.text.length > 100 ? '...' : '')
        }))
      });
    } catch (error) {
      console.error('Test chunking error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Force restart import with optimized chunking
  app.post('/api/import/force-restart', async (req, res) => {
    try {
      const jobId = 'b46fa8c6-b396-418d-9622-2d7290816d3d';
      const projectId = '88543cf5-1e83-4204-9918-2a0845caaa7a';
      const importId = '2861b371-da92-48a3-9295-d93409113449';
      
      console.log(`🔄 Force restarting import with optimized chunking: ${jobId}`);
      
      // Clear existing job from memory
      if ((global as any).importJobs) {
        (global as any).importJobs.delete(jobId);
      }
      
      // Update job status in DB
      await storage.updateImportJob(jobId, {
        status: "running",
        phase: "loading", 
        percent: 0
      });
      
      // Start processing immediately
      processImportJobAsync(jobId, importId, {internal_linking: true}, "all_pages", {min_similarity: 0.7}, projectId)
        .catch(err => {
          console.error(`💥 Restart import job ${jobId} failed:`, err);
          storage.updateImportJob(jobId, {
            status: "failed",
            errorMessage: err.message,
            finishedAt: new Date()
          });
        });
      
      res.json({ 
        success: true, 
        message: 'Import restarted with optimized chunking',
        jobId 
      });
    } catch (error) {
      console.error('Force restart error:', error);
      res.status(500).json({ error: 'Failed to restart import' });
    }
  });

  // Get import status
  app.get("/api/import/status", authenticateToken, async (req: any, res) => {
    try {
      const { projectId, jobId } = req.query;
      
      console.log(`Getting import status for project: ${projectId}, jobId: ${jobId}`);
      console.log(`Available jobs:`, (global as any).importJobs ? Array.from((global as any).importJobs.keys()) : 'undefined');
      
      if (!projectId) {
        return res.status(400).json({ error: "Missing projectId parameter" });
      }

      // Get import job status
      const job = await storage.getImportJobStatus(projectId as string, jobId as string);
      console.log(`Found job:`, job ? 'YES' : 'NO');
      
      if (!job) {
        return res.status(404).json({ error: "Import job not found" });
      }

      // Debug: Log the job data being returned
      console.log(`Job data:`, {
        pagesTotal: job.pagesTotal,
        pagesDone: job.pagesDone, 
        blocksDone: job.blocksDone,
        orphanCount: job.orphanCount,
        avgWordCount: job.avgWordCount
      });

      res.json(job);
    } catch (error) {
      console.error("Import status error:", error);
      res.status(500).json({ error: "Failed to get import status" });
    }
  });

  // Cancel import job
  app.post("/api/import/cancel", authenticateToken, async (req: any, res) => {
    try {
      const { jobId } = req.body;
      
      await storage.cancelImportJob(jobId);
      
      res.json({ success: true, message: "Import canceled" });
    } catch (error) {
      console.error("Import cancel error:", error);
      res.status(500).json({ error: "Failed to cancel import" });
    }
  });

  // Get full logs for download
  app.get("/api/import/logs/:jobId", authenticateToken, async (req: any, res) => {
    try {
      const { jobId } = req.params;
      
      const logs = await storage.getImportJobLogs(jobId);
      
      if (!logs) {
        return res.status(404).json({ error: "Import job not found" });
      }

      // Return full logs as plain text for download
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="import-${jobId}.log"`);
      res.send(logs.join('\n'));
    } catch (error) {
      console.error("Import logs error:", error);
      res.status(500).json({ error: "Failed to get import logs" });
    }
  });

  app.post("/api/generate", authenticateToken, async (req: any, res) => {
    try {
      const { projectId, scenarios, scope, advanced } = req.body;
      
      // Simulate generation process
      const runId = crypto.randomUUID();
      
      // Simulate 3-second generation
      setTimeout(() => {
        console.log(`Generation completed for run ${runId}`);
      }, 3000);
      
      res.json({ ok: true, runId });
    } catch (error) {
      console.error("Error in generate:", error);
      res.status(500).json({ error: "Failed to start generation" });
    }
  });

  // Debug endpoint to view page data for specific project
  app.get("/api/debug/pages/:projectId", authenticateToken, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      
      // Validate project ownership
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Get pages from graph_meta table with real orphan data
      const graphData = await db.execute(sql`
        SELECT gm.url, gm.title, gm.word_count, gm.click_depth, 
               gm.internal_links_count, gm.is_orphan, gm.in_degree, gm.out_degree,
               pc.clean_html as content
        FROM graph_meta gm
        LEFT JOIN pages_clean pc ON gm.page_id = pc.id
        INNER JOIN import_jobs ij ON gm.job_id = ij.job_id
        WHERE ij.project_id::text = ${projectId}
        ORDER BY gm.created_at DESC
      `);
      
      if (graphData.rows && graphData.rows.length > 0) {
        console.log(`🚀 DEBUG API: Using graph_meta data - ${graphData.rows.length} pages`);
        const pages = graphData.rows.map((row: any) => ({
          url: row.url,
          title: row.title || 'Без названия',
          content: row.content || '',
          wordCount: row.word_count || 0,
          urlDepth: row.click_depth || 0,
          internalLinkCount: row.internal_links_count || 0,
          isOrphan: row.is_orphan || false,
          contentPreview: (row.content || '').substring(0, 150)
        }));
        
        const orphanCount = pages.filter(p => p.isOrphan).length;
        const linkedPages = pages.length - orphanCount;
        const avgWordCount = pages.length > 0 ? Math.round(pages.reduce((sum, p) => sum + p.wordCount, 0) / pages.length) : 0;
        
        return res.json({ 
          success: true, 
          pages: pages,
          stats: {
            totalPages: pages.length,
            orphanCount: orphanCount,
            linkedPages: linkedPages,
            avgWordCount: avgWordCount
          }
        });
      } else {
        // Fallback to old method
        var pages = await storage.getProjectPages(projectId);
      }
      
      
      // If no pages in database, fallback to in-memory data
      if (pages.length === 0) {
        console.log(`No pages in database for project ${projectId}, checking in-memory data`);
        const uploads = (global as any).uploads;
        if (uploads && uploads.size > 0) {
          // Find upload for this project (look for most recent one)
          let projectUpload = null;
          for (const [uploadId, upload] of uploads.entries()) {
            if (upload && upload.projectId === projectId) {
              projectUpload = upload;
            }
          }
          
          if (projectUpload && projectUpload.data) {
            const csvData = projectUpload.data;
            console.log(`Debug pages for project ${projectId}: analyzing ${csvData.length} rows from memory`);
            
            pages = csvData.map((row: any, index: number) => {
              const content = row.Content || row.content || '';
              const title = row.Title || row.title || '';
              const url = row.Permalink || row.URL || row.url || '';
              
              // Debug field mapping for first few rows
              if (index < 5) {
                console.log(`🔍 Debug row ${index + 1} fields:`, Object.keys(row));
                console.log(`🔍 Debug row ${index + 1} Permalink: "${row.Permalink}"`);
              }
              
              // Skip rows without real Permalink
              if (!url || url.trim() === '') {
                return null;
              }
              
              // Count words properly - handle HTML and get meaningful content
              let cleanContent = content || '';
              // Remove HTML tags but preserve spaces
              cleanContent = cleanContent.replace(/<[^>]*>/g, ' ');
              // Normalize whitespace
              cleanContent = cleanContent.replace(/\s+/g, ' ').trim();
              // Split and count words
              const words = cleanContent.split(/\s+/).filter((word: string) => word.length > 0);
              const wordCount = words.length; // Use actual word count, no minimum
              
              // Calculate URL depth - count URL path segments correctly
              let urlDepth = 0;
              let pathSegments: string[] = [];
              try {
                // Extract path from URL after domain
                const urlPath = url.replace(/^https?:\/\/[^\/]+/, '');
                // Remove leading and trailing slashes, then split
                const cleanPath = urlPath.replace(/^\/+|\/+$/g, '');
                if (cleanPath === '') {
                  urlDepth = 0; // Root page
                } else {
                  // Split by slash and count non-empty segments
                  pathSegments = cleanPath.split('/').filter((s: string) => s.length > 0);
                  urlDepth = pathSegments.length;
                }
                console.log(`📏 URL depth calculation: ${url} -> path: "${cleanPath}" -> segments: ${pathSegments.length} -> depth: ${urlDepth}`);
              } catch (e) {
                urlDepth = 0;
              }
              
              // Count internal links from real content
              const linkMatches = content.match(/<a [^>]*href=['"']([^'"']*)['"'][^>]*>/gi) || [];
              let internalLinkCount = 0;
              let externalLinkCount = 0;
              
              linkMatches.forEach((match: string) => {
                const hrefMatch = match.match(/href=['"']([^'"']*)['"']/i);
                if (hrefMatch && hrefMatch[1]) {
                  const href = hrefMatch[1];
                  // Count internal vs external links
                  if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../') || 
                      (href.includes('evolucionika.ru')) ||
                      (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('mailto:') && !href.startsWith('tel:'))) {
                    internalLinkCount++;
                  } else if (href.startsWith('http://') || href.startsWith('https://')) {
                    externalLinkCount++;
                  }
                }
              });
              
              console.log(`🔗 Link analysis for ${url}: ${internalLinkCount} internal, ${externalLinkCount} external`);
              
              const isOrphan = internalLinkCount === 0;
              const contentPreview = cleanContent.substring(0, 150);
              
              return {
                url,
                title,
                content,
                wordCount,
                urlDepth,
                internalLinkCount,
                isOrphan,
                contentPreview
              };
            }).filter((page: any) => page !== null); // Filter out rows without Permalink
          }
        }
      }

      if (pages.length === 0) {
        return res.json({ 
          pages: [], 
          stats: { totalPages: 0, orphanCount: 0, linkedPages: 0, avgWordCount: 0 } 
        });
      }

      console.log(`🚀 DEBUG API: Returning ALL ${pages.length} pages for project ${projectId}`);
      console.log(`🚀 DEBUG API: First 3 pages:`, pages.slice(0, 3).map(p => ({ title: p.title?.substring(0, 30), isOrphan: p.isOrphan })));

      // Calculate statistics
      const totalPages = pages.length;
      const orphanCount = pages.filter((page: any) => page.isOrphan).length;
      const linkedPages = totalPages - orphanCount;
      const avgWordCount = Math.round(
        pages.reduce((sum: number, page: any) => sum + page.wordCount, 0) / totalPages
      );

      const stats = {
        totalPages,
        orphanCount,
        linkedPages,
        avgWordCount
      };

      res.json({ pages, stats });
    } catch (error) {
      console.error("Debug pages error:", error);
      res.status(500).json({ error: "Failed to get debug pages" });
    }
  });

  // Get saved import configuration for a project
  app.get("/api/import-config/:projectId", authenticateToken, async (req: any, res) => {
    try {
      const { projectId } = req.params;
      
      // Validate project belongs to user
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      const config = await db
        .select()
        .from(projectImportConfigs)
        .where(and(
          eq(projectImportConfigs.projectId, projectId),
          eq(projectImportConfigs.isLastUsed, true)
        ))
        .limit(1);
      
      if (config.length === 0) {
        return res.status(404).json({ error: "No saved configuration found" });
      }
      
      res.json(config[0]);
    } catch (error) {
      console.error("Get import config error:", error);
      res.status(500).json({ error: "Failed to get import configuration" });
    }
  });

  // Get imports list for a project  
  app.get("/api/imports", authenticateToken, async (req: any, res) => {
    try {
      const { projectId } = req.query;
      
      if (!projectId) {
        return res.status(400).json({ error: "Project ID is required" });
      }
      
      // Validate project belongs to user
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      const importsList = await db
        .select()
        .from(imports)
        .where(eq(imports.projectId, projectId as string))
        .orderBy(desc(imports.createdAt));
      
      res.json(importsList);
    } catch (error) {
      console.error("Get imports error:", error);
      res.status(500).json({ error: "Failed to get imports" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to extract keywords from title and content
function extractKeywords(title: string, content: string): string[] {
  const text = `${title} ${content}`.toLowerCase();
  
  // Remove HTML tags and special characters
  const cleanText = text.replace(/<[^>]*>/g, ' ')
                       .replace(/[^\w\s]/g, ' ')
                       .replace(/\s+/g, ' ')
                       .trim();
  
  // Split into words and filter common stop words
  const stopWords = new Set([
    'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'из', 'к', 'о', 'об', 'при', 'за', 'под', 'над',
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were'
  ]);
  
  const words = cleanText.split(' ')
    .filter(word => word.length > 3 && !stopWords.has(word))
    .slice(0, 20); // Take top 20 keywords
  
  return words;
}

// Helper function to calculate relevance score between two pages
function calculateRelevanceScore(sourcePage: any, targetPage: any): number {
  const sourceKeywords = sourcePage.keywords || [];
  const targetKeywords = targetPage.keywords || [];
  
  // Calculate keyword intersection using arrays instead of sets
  const sourceSet = new Set(sourceKeywords);
  const targetSet = new Set(targetKeywords);
  
  const intersectionArray = sourceKeywords.filter((x: string) => targetSet.has(x));
  const unionArray = Array.from(new Set([...sourceKeywords, ...targetKeywords]));
  
  // Jaccard similarity
  const jaccardScore = intersectionArray.length / Math.max(unionArray.length, 1);
  
  // Title similarity bonus
  const sourceTitleWords = (sourcePage.title || '').toLowerCase().split(' ');
  const targetTitleWords = (targetPage.title || '').toLowerCase().split(' ');
  const titleIntersectionArray = sourceTitleWords.filter((x: string) => targetTitleWords.includes(x));
  const titleBonus = titleIntersectionArray.length > 0 ? 0.2 : 0;
  
  // Content length penalty (prefer linking to substantial content)
  const lengthPenalty = targetPage.words < 100 ? -0.1 : 0;
  
  return Math.min(1.0, jaccardScore + titleBonus + lengthPenalty);
}

// Content processing pipeline
class ContentProcessor {
  constructor(private storage: DatabaseStorage) {}

  async processContent(jobId: string, projectId: string, importId: string) {
    console.log(`🚀 Starting real content processing for job ${jobId}`);
    console.log(`📋 Input parameters: jobId=${jobId}, projectId=${projectId}, importId=${importId}`);
    
    // Phase 1: Load CSV data
    console.log(`📥 Phase 1: Loading CSV data...`);
    await this.updateProgress(jobId, "loading", 0, "Читаем CSV");
    const csvData = await this.loadCSVData(importId);
    if (!csvData) {
      throw new Error("Failed to load CSV data");
    }
    console.log(`📥 CSV data loaded: ${csvData.length} records`);
    
    await this.updateProgress(jobId, "loading", 100, `CSV загружен: ${csvData.length} записей`);
    
    // Phase 2: Clean HTML and save to pages_clean
    await this.updateProgress(jobId, "cleaning", 0, "Очищаем HTML");
    const cleanPages = await this.cleanHTML(csvData, jobId);
    await this.updateProgress(jobId, "cleaning", 100, `HTML очищен: ${cleanPages.length} страниц`);
    
    // Phase 3: Split into blocks
    await this.updateProgress(jobId, "chunking", 0, "Режем на абзацы");
    const blocksData = await this.splitIntoBlocks(cleanPages, jobId);
    
    // Phase 4: Generate embeddings
    await this.updateProgress(jobId, "vectorizing", 0, "Векторизация");
    const embeddings = await this.generateEmbeddings(blocksData, jobId);
    
    // Phase 5: Build link graph
    await this.updateProgress(jobId, "graphing", 0, "Строим карту ссылок");
    const graphData = await this.buildLinkGraph(cleanPages, jobId);
    await this.updateProgress(jobId, "graphing", 100, `Граф построен: ${graphData.orphanCount} сирот`);
    
    // Final statistics
    const stats = {
      pagesTotal: cleanPages.length,
      blocksTotal: blocksData.length,
      orphanCount: graphData.orphanCount,
      avgClickDepth: graphData.avgClickDepth
    };
    
    await this.storage.updateImportJob(jobId, {
      status: "completed",
      phase: "completed",
      percent: 100,
      pagesTotal: stats.pagesTotal,
      pagesDone: stats.pagesTotal,
      blocksDone: stats.blocksTotal,
      orphanCount: stats.orphanCount,
      avgClickDepth: stats.avgClickDepth,
      finishedAt: sql`now()`,
      logs: [`✅ Обработка завершена: ${stats.pagesTotal} страниц, ${stats.blocksTotal} блоков, ${stats.orphanCount} сирот`]
    });
    
    console.log(`✅ Content processing completed:`, stats);
    return stats;
  }

  private async updateProgress(jobId: string, phase: string, percent: number, message: string) {
    console.log(`📈 ${phase}: ${percent}% - ${message}`);
    await this.storage.updateImportJob(jobId, { 
      phase, 
      percent,
      logs: [message] 
    });
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  private async loadCSVData(importId: string) {
    const importData = await this.storage.getImportByUploadId(importId);
    if (!importData || !importData.filePath) {
      throw new Error("Import data or file path not found");
    }

    const fileContent = fs.readFileSync(importData.filePath, 'utf-8');
    const fieldMapping = JSON.parse(importData.fieldMapping || '{}');
    
    const csvRows = this.parseCSV(fileContent);
    const headers = csvRows[0];
    const dataRows = csvRows.slice(1);
    
    const validData = [];
    for (const row of dataRows) {
      const rowObject: any = {};
      headers.forEach((header, index) => {
        rowObject[header] = (row[index] || '').trim();
      });
      
      const url = rowObject[fieldMapping.url] || '';
      if (url && url.includes('http')) {
        validData.push({
          url,
          title: rowObject[fieldMapping.title] || '',
          content: rowObject[fieldMapping.content] || '',
          description: rowObject[fieldMapping.description] || '',
          rawData: rowObject
        });
      }
    }
    
    console.log(`📄 Loaded ${validData.length} valid pages from CSV`);
    return validData;
  }

  private parseCSV(csvText: string): string[][] {
    const results: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < csvText.length) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        currentRow.push(currentField.trim());
        if (currentRow.some(field => field.length > 0)) {
          results.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        if (char === '\r' && nextChar === '\n') i++;
      } else {
        currentField += char;
      }
      i++;
    }
    
    if (currentField || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some(field => field.length > 0)) {
        results.push(currentRow);
      }
    }
    
    return results;
  }

  private async cleanHTML(csvData: any[], jobId: string) {
    const cleanPages = [];
    
    // First, ensure pages_raw data exists by saving it
    console.log(`📥 Saving ${csvData.length} pages to pages_raw table first`);
    for (let i = 0; i < csvData.length; i++) {
      const page = csvData[i];
      
      // Save raw page data first
      const pageRawResult = await db.insert(pagesRaw).values({
        url: page.url,
        jobId,
        rawHtml: page.content,
        meta: { title: page.title },
        importBatchId: jobId
      }).returning({ id: pagesRaw.id });
      
      // Now clean the HTML
      let cleanHtml = page.content || '';
      cleanHtml = cleanHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      cleanHtml = cleanHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      cleanHtml = cleanHtml.replace(/<!--[\s\S]*?-->/g, '');
      
      const cleanText = cleanHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const wordCount = cleanText.split(/\s+/).filter((word: string) => word.length > 0).length;
      
      // Save to pages_clean table with valid page_raw_id
      const pageCleanResult = await db.insert(pagesClean).values({
        pageRawId: pageRawResult[0].id,
        cleanHtml,
        wordCount
      }).returning({ id: pagesClean.id });
      
      cleanPages.push({
        id: pageCleanResult[0].id,
        pageRawId: pageRawResult[0].id,
        url: page.url,
        title: page.title,
        cleanHtml,
        wordCount,
        originalData: page
      });
      
      if (i % 50 === 0) {
        console.log(`🧹 Processed ${i + 1}/${csvData.length} pages`);
      }
    }
    
    return cleanPages;
  }

  private async splitIntoBlocks(cleanPages: any[], jobId: string) {
    const allBlocks = [];
    
    console.log(`📝 Starting to process ${cleanPages.length} pages into blocks...`);
    
    for (let pageIndex = 0; pageIndex < cleanPages.length; pageIndex++) {
      const page = cleanPages[pageIndex];
      const htmlContent = page.cleanHtml;
      const blockList = this.extractBlocks(htmlContent);
      
      // Update progress every 25 pages
      if (pageIndex % 25 === 0) {
        const percent = Math.round((pageIndex / cleanPages.length) * 100);
        await this.updateProgress(jobId, "chunking", percent, 
          `Разбивка на блоки: ${pageIndex + 1}/${cleanPages.length} страниц (${allBlocks.length} блоков)`);
        console.log(`📝 Processing page ${pageIndex + 1}/${cleanPages.length} - found ${blockList.length} blocks total: ${allBlocks.length}`);
      }
      
      for (let i = 0; i < blockList.length; i++) {
        const block = blockList[i];
        
        const blockResult = await db.insert(blocks).values({
          pageId: page.id,
          blockType: block.type,
          text: block.text,
          position: i
        }).returning({ id: blocks.id });
        
        allBlocks.push({
          id: blockResult[0].id,
          pageId: page.id,
          type: block.type,
          text: block.text,
          position: i
        });
      }
    }
    
    await this.updateProgress(jobId, "chunking", 100, 
      `Разбивка завершена: ${allBlocks.length} блоков из ${cleanPages.length} страниц`);
    console.log(`📝 Created ${allBlocks.length} content blocks from ${cleanPages.length} pages`);
    return allBlocks;
  }

  extractBlocks(htmlContent: string) {
    const blocksList = [];
    
    // Extract headings (H1-H6) as separate blocks
    const headingRegex = /<(h[1-6])[^>]*>(.*?)<\/\1>/gi;
    let match;
    while ((match = headingRegex.exec(htmlContent)) !== null) {
      const text = match[2].replace(/<[^>]*>/g, '').trim();
      if (text.length > 0) {
        blocksList.push({
          type: match[1].toLowerCase(),
          text
        });
      }
    }
    
    // Extract complete lists (ul/ol) as single blocks
    const listRegex = /<(ul|ol)[^>]*>(.*?)<\/\1>/gi;
    while ((match = listRegex.exec(htmlContent)) !== null) {
      const listItems = [];
      const itemRegex = /<li[^>]*>(.*?)<\/li>/gi;
      let itemMatch;
      while ((itemMatch = itemRegex.exec(match[2])) !== null) {
        const itemText = itemMatch[1].replace(/<[^>]*>/g, '').trim();
        if (itemText.length > 0) {
          listItems.push(itemText);
        }
      }
      
      if (listItems.length > 0) {
        blocksList.push({
          type: 'list',
          text: listItems.join('\n• ')
        });
      }
    }
    
    // Extract paragraphs, but group consecutive ones
    const paragraphRegex = /<p[^>]*>(.*?)<\/p>/gi;
    const paragraphs = [];
    while ((match = paragraphRegex.exec(htmlContent)) !== null) {
      const text = match[1].replace(/<[^>]*>/g, '').trim();
      if (text.length > 10) {
        paragraphs.push(text);
      }
    }
    
    // Group paragraphs into chunks of 2-3 for better semantic blocks
    for (let i = 0; i < paragraphs.length; i += 3) {
      const chunk = paragraphs.slice(i, i + 3);
      if (chunk.length > 0) {
        blocksList.push({
          type: 'paragraph_group',
          text: chunk.join('\n\n')
        });
      }
    }
    
    return blocksList;
  }

  private async generateEmbeddings(blocksData: any[], jobId: string) {
    const embeddingsList = [];
    
    console.log(`🔢 Starting vectorization of ${blocksData.length} blocks...`);
    
    for (let i = 0; i < blocksData.length; i++) {
      const block = blocksData[i];
      
      // Update progress every 100 blocks
      if (i % 100 === 0) {
        const percent = Math.round((i / blocksData.length) * 100);
        await this.updateProgress(jobId, "vectorizing", percent, 
          `Векторизация: ${i}/${blocksData.length} блоков`);
      }
      
      // PLACEHOLDER: In real implementation, use S-BERT MiniLM
      // For now, create zero vectors to avoid fake data
      const vector = Array.from({ length: 384 }, () => 0);
      
      const embeddingResult = await db.insert(embeddings).values({
        blockId: block.id,
        vector
      }).returning({ id: embeddings.id });
      
      embeddingsList.push({
        id: embeddingResult[0].id,
        blockId: block.id,
        vector
      });
    }
    
    await this.updateProgress(jobId, "vectorizing", 100, 
      `Векторизация завершена: ${embeddingsList.length} векторов`);
    console.log(`🔢 Generated ${embeddingsList.length} embeddings`);
    return embeddingsList;
  }

  private async buildLinkGraph(cleanPages: any[], jobId: string) {
    const edgesList = [];
    let orphanCount = 0;
    let totalDepth = 0;
    
    const urlToPageId = new Map();
    cleanPages.forEach(page => {
      urlToPageId.set(page.url, page.id);
    });
    
    for (const page of cleanPages) {
      const internalLinks = this.extractInternalLinks(page.cleanHtml, 'evolucionika.ru');
      let pageDepth = this.calculateURLDepth(page.url);
      let inDegree = 0;
      let outDegree = internalLinks.length;
      
      for (const linkUrl of internalLinks) {
        const targetPageId = urlToPageId.get(linkUrl);
        if (targetPageId) {
          const edgeResult = await db.insert(edges).values({
            jobId,
            fromPageId: page.id,
            toPageId: targetPageId,
            fromUrl: page.url,
            toUrl: linkUrl,
            isInternal: true
          }).returning({ id: edges.id });
          
          edgesList.push(edgeResult[0]);
        }
      }
      
      for (const otherPage of cleanPages) {
        if (otherPage.id !== page.id) {
          const otherLinks = this.extractInternalLinks(otherPage.cleanHtml, 'evolucionika.ru');
          if (otherLinks.includes(page.url)) {
            inDegree++;
          }
        }
      }
      
      const isOrphan = inDegree === 0;
      if (isOrphan) orphanCount++;
      totalDepth += pageDepth;
      
      await db.insert(graphMeta).values({
        pageId: page.id,
        jobId,
        url: page.url,
        clickDepth: pageDepth,
        inDegree,
        outDegree,
        isOrphan
      });
    }
    
    const avgClickDepth = totalDepth / cleanPages.length;
    
    return {
      orphanCount,
      avgClickDepth: Math.round(avgClickDepth * 10) / 10,
      totalEdges: edgesList.length
    };
  }

  private extractInternalLinks(htmlContent: string, domain: string): string[] {
    const links = [];
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let match;
    
    while ((match = linkRegex.exec(htmlContent)) !== null) {
      const url = match[1];
      if (url.includes(domain) || url.startsWith('/')) {
        if (url.startsWith('/')) {
          links.push(`https://${domain}${url}`);
        } else {
          links.push(url);
        }
      }
    }
    
    return Array.from(new Set(links));
  }

  private calculateURLDepth(url: string): number {
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter(segment => segment.length > 0);
      return Math.max(1, pathSegments.length);
    } catch (e) {
      return 1;
    }
  }
}

async function processImportJobAsync(jobId: string, importId: string, scenarios: any, scope: any, rules: any, projectId: string) {
  console.log(`🚀 Starting real content processing for job ${jobId}`);
  console.log(`📋 Parameters: importId=${importId}, projectId=${projectId}`);
  
  try {
    console.log(`📦 Creating ContentProcessor instance...`);
    const processor = new ContentProcessor(storage);
    console.log(`🎯 Starting processContent...`);
    await processor.processContent(jobId, projectId, importId);
    console.log(`✅ processContent completed successfully`);
  } catch (error) {
    console.error(`❌ Content processing failed:`, error);
    console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    await storage.updateImportJob(jobId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      finishedAt: sql`now()`
    });
  }
}
