# Overview

This is a comprehensive SaaS SEO service platform that automates internal linking for SEO specialists. The application provides full user authentication (email/password and Google OAuth), project management, content import functionality, and progress tracking. Built with Express.js backend and React frontend, it features a modern dashboard with project creation, CSV/JSON import wizard, WordPress plugin integration, and comprehensive onboarding flow. The system uses PostgreSQL with Drizzle ORM and implements security best practices.

## Recent Changes (January 2025)
- **Transformed from auth app to SEO SaaS platform** - Complete UI overhaul with SEO LinkBuilder branding
- **Added project management** - Users can create, manage, and delete SEO projects  
- **Implemented Step 2 import wizard** - CSV/JSON upload with field mapping and WordPress plugin option
- **Enhanced database schema** - Added projects, user progress, notifications, API keys, and imports tables
- **Created comprehensive dashboard** - Project list, progress sidebar, FAQ section, notification banner

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: shadcn/ui components built on Radix UI primitives
- **Styling**: TailwindCSS with CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for client-side routing
- **Form Handling**: React Hook Form with Zod validation
- **Design Pattern**: Component-based architecture with reusable UI components

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **Authentication Strategy**: JWT-based authentication with access and refresh tokens
- **Token Storage**: httpOnly cookies for secure token storage
- **Session Management**: 15-minute access tokens with 30-day rolling refresh tokens
- **Security**: Rate limiting (20 requests per 10 minutes for auth endpoints)
- **API Design**: RESTful endpoints following standard HTTP conventions

## Database Schema
- **ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL (configured for Neon serverless)
- **Core Entities**:
  - **Users**: UUID primary key, email (unique), passwordHash (optional), provider (LOCAL/GOOGLE), googleId (optional), createdAt
  - **Projects**: UUID primary key, userId (foreign key), name, domain, status (QUEUED/READY), createdAt, updatedAt
  - **UserProgress**: Tracks onboarding steps (createProject, uploadTexts, setPriorities, generateDraft)
  - **Notifications**: System notifications with dismiss functionality
  - **ProjectApiKeys**: API keys for WordPress plugin integration
  - **Imports**: File upload tracking with field mapping and processing status

## Authentication Flow
- **Local Auth**: Email/password with bcrypt hashing (10 rounds)
- **OAuth Integration**: Google OAuth 2.0 with Passport.js
- **Token Management**: Dual token system with automatic refresh
- **Session Validation**: Middleware-based authentication checking
- **Account Linking**: Automatic linking of Google accounts to existing email accounts

## Security Measures
- **Password Requirements**: Minimum 8 characters for local registration
- **Rate Limiting**: IP-based rate limiting on authentication endpoints
- **Cookie Security**: httpOnly, SameSite=Lax, Secure in production
- **Input Validation**: Zod schemas for request validation
- **Error Handling**: Standardized error responses with appropriate HTTP status codes

## Development Setup
- **Build System**: Vite for frontend, esbuild for backend production builds
- **Type Safety**: Shared TypeScript schemas between frontend and backend
- **Development Tools**: Hot reloading, error overlays, and development banner integration
- **Database Migrations**: Drizzle Kit for schema management and migrations

# External Dependencies

## Core Technologies
- **Database**: Neon PostgreSQL serverless database
- **Authentication Provider**: Google OAuth 2.0 API
- **UI Framework**: Radix UI primitives for accessible components
- **State Management**: TanStack Query for server state synchronization

## Third-Party Services
- **Google OAuth**: Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET configuration
- **Database Connection**: Requires DATABASE_URL environment variable
- **JWT Secrets**: Requires JWT_SECRET and JWT_REFRESH_SECRET for token signing

## Key Libraries
- **Backend**: Express.js, Passport.js, bcrypt, jsonwebtoken, drizzle-orm
- **Frontend**: React, wouter, react-hook-form, zod, lucide-react
- **Development**: Vite, TypeScript, TailwindCSS, PostCSS
- **Database**: @neondatabase/serverless, drizzle-kit