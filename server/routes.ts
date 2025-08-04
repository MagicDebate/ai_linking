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
import { registerUserSchema, loginUserSchema, insertProjectSchema, fieldMappingSchema, linkingRulesSchema } from "@shared/schema";
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

        // Enhanced CSV parsing with proper quote handling
        const parseCSVLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          let i = 0;
          
          while (i < line.length) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                // Escaped quote inside quoted field
                current += '"';
                i += 2;
                continue;
              } else {
                // Toggle quote state
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              // Field separator
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
            i++;
          }
          
          // Add final field
          result.push(current.trim());
          return result;
        };

        headers = parseCSVLine(lines[0]);
        const dataRows = lines.slice(1);
        
        // Parse rows and ensure they match header count
        rows = dataRows.slice(0, 5).map(line => {
          const parsedRow = parseCSVLine(line);
          // Pad or trim row to match header count
          while (parsedRow.length < headers.length) {
            parsedRow.push('');
          }
          return parsedRow.slice(0, headers.length);
        });
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

  // Start import endpoint
  app.post("/api/import/start", authenticateToken, async (req: any, res) => {
    try {
      const { projectId } = req.body;
      
      if (!projectId) {
        return res.status(400).json({ message: "Project ID is required" });
      }

      // Verify project ownership
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Update user progress
      await storage.updateUserProgress(req.user.id, { 
        uploadTexts: "true",
        setPriorities: "true" 
      });

      // Start import process (simplified for now)
      console.log("Starting import for project:", projectId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Start import error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

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

  // Generate links endpoint
  // Start import job for Step 4
  app.post("/api/import/start", authenticateToken, async (req: any, res) => {
    try {
      const { projectId, importId, scenarios, scope, rules } = req.body;
      
      // Validate project belongs to user
      const project = await storage.getProjectById(projectId);
      if (!project || project.userId !== req.user.id) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Create import job
      const jobId = crypto.randomUUID();
      
      console.log(`Starting import for project: ${projectId}, jobId: ${jobId}`);
      
      const importJob = await storage.createImportJob({
        jobId,
        projectId,
        importId,
        status: "running",
        phase: "loading",
        percent: 0
      });

      console.log(`Job created:`, importJob);
      console.log(`Global jobs after create:`, global.importJobs ? Array.from(global.importJobs.keys()) : 'undefined');
      
      // CRITICAL: Start processing in next tick to ensure job is saved
      setTimeout(() => {
        processImportJobAsync(jobId, importId, scenarios, scope, rules).catch(err => {
          console.error(`Import job ${jobId} failed:`, err);
          storage.updateImportJob(jobId, {
            status: "failed",
            errorMessage: err.message,
            finishedAt: new Date()
          });
        });
      }, 100);

      res.json({ 
        success: true, 
        jobId,
        message: "Import job started" 
      });
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
      
      if (!global.importJobs) {
        global.importJobs = new Map();
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
      
      global.importJobs.set(testJobId, testJob);
      console.log(`Test job created. Total jobs: ${global.importJobs.size}`);
      console.log('Available job IDs:', Array.from(global.importJobs.keys()));
      
      res.json({ 
        success: true, 
        jobId: testJobId,
        totalJobs: global.importJobs.size,
        availableJobs: Array.from(global.importJobs.keys())
      });
    } catch (error) {
      console.error('Test create error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get import status
  app.get("/api/import/status", authenticateToken, async (req: any, res) => {
    try {
      const { projectId, jobId } = req.query;
      
      console.log(`Getting import status for project: ${projectId}, jobId: ${jobId}`);
      console.log(`Available jobs:`, global.importJobs ? Array.from(global.importJobs.keys()) : 'undefined');
      
      if (!projectId) {
        return res.status(400).json({ error: "Missing projectId parameter" });
      }

      // Get import job status
      const job = await storage.getImportJobStatus(projectId as string, jobId as string);
      console.log(`Found job:`, job ? 'YES' : 'NO');
      
      if (!job) {
        return res.status(404).json({ error: "Import job not found" });
      }

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

  const httpServer = createServer(app);
  return httpServer;
}

// Background import processing simulation
async function processImportJobAsync(jobId: string, importId: string, scenarios: any, scope: any, rules: any) {
  const startTime = Date.now();
  console.log(`Processing import job ${jobId} started`);
  
  try {
    const phases = [
      { name: "loading", duration: 1500, label: "Загрузка источника" },
      { name: "cleaning", duration: 2000, label: "Очистка от boilerplate" },
      { name: "chunking", duration: 1800, label: "Нарезка на блоки" },
      { name: "extracting", duration: 2500, label: "Извлечение метаданных" },
      { name: "embedding", duration: 3000, label: "Генерация эмбеддингов" },
      { name: "graphing", duration: 2200, label: "Обновление графа" },
      { name: "finalizing", duration: 1000, label: "Финализация" }
    ];

    let totalProgress = 0;
    const progressPerPhase = 100 / phases.length;

    // Set initial status
    await storage.updateImportJob(jobId, {
      status: "running",
      phase: "loading",
      percent: 0,
      pagesTotal: 147,
      logs: [`Запуск импорта для jobId: ${jobId}`]
    });

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      console.log(`Phase ${i + 1}/7: ${phase.label} for job ${jobId}`);
      
      // Update to new phase
      await storage.updateImportJob(jobId, {
        phase: phase.name,
        percent: Math.round(totalProgress),
        logs: [`Фаза ${i + 1}/7: ${phase.label}`]
      });

      // Simulate phase processing
      const steps = 4;
      for (let step = 0; step < steps; step++) {
        await new Promise(resolve => setTimeout(resolve, phase.duration / steps));
        
        const phaseProgress = ((step + 1) / steps) * progressPerPhase;
        const currentPercent = Math.min(100, Math.round(totalProgress + phaseProgress));

        await storage.updateImportJob(jobId, {
          percent: currentPercent,
          pagesDone: Math.round((currentPercent / 100) * 147),
          blocksDone: Math.round((currentPercent / 100) * 1180),
          logs: [`${phase.label}: ${Math.round(((step + 1) / steps) * 100)}% завершено`]
        });
      }

      totalProgress += progressPerPhase;
    }

    // Complete the job
    const duration = Math.round((Date.now() - startTime) / 1000);
    await storage.updateImportJob(jobId, {
      status: "completed",
      percent: 100,
      pagesTotal: 147,
      pagesDone: 147,
      blocksDone: 1180,
      orphanCount: 18,
      avgWordCount: 742,
      deepPages: 23,
      avgClickDepth: 2.8,
      importDuration: duration,
      finishedAt: new Date(),
      logs: [`Импорт завершен! Обработано 147 страниц за ${duration}с`]
    });

    console.log(`Import job ${jobId} completed in ${duration}s`);
  } catch (error) {
    console.error(`Import job ${jobId} failed:`, error);
    
    await storage.updateImportJob(jobId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      finishedAt: new Date(),
      logs: [`ОШИБКА: ${error instanceof Error ? error.message : "Unknown error"}`]
    });
  }
}
