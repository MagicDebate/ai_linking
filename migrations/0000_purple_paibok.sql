CREATE TYPE "public"."project_status" AS ENUM('QUEUED', 'READY');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('LOCAL', 'GOOGLE');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'draft', 'published', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"block_type" varchar(20) NOT NULL,
	"text" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broken_urls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"url" text NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar(50) NOT NULL,
	"from_page_id" uuid NOT NULL,
	"to_page_id" uuid NOT NULL,
	"from_url" text NOT NULL,
	"to_url" text NOT NULL,
	"anchor_text" text,
	"is_internal" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embedding_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"text_hash" text NOT NULL,
	"vector" vector(384) NOT NULL,
	"language" varchar(10) DEFAULT 'ru' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_id" uuid NOT NULL,
	"vector" vector(384) NOT NULL,
	"text_hash" text NOT NULL,
	"project_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"import_id" varchar NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"phase" varchar(50) DEFAULT 'starting' NOT NULL,
	"percent" integer DEFAULT 0 NOT NULL,
	"generated" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"scenarios" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"error_message" text,
	CONSTRAINT "generation_runs_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "graph_meta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"job_id" varchar(50) NOT NULL,
	"url" text NOT NULL,
	"click_depth" integer DEFAULT 1 NOT NULL,
	"in_degree" integer DEFAULT 0 NOT NULL,
	"out_degree" integer DEFAULT 0 NOT NULL,
	"is_orphan" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "graph_meta_page_id_unique" UNIQUE("page_id")
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"job_id" varchar(50) NOT NULL,
	"project_id" varchar NOT NULL,
	"import_id" varchar NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"phase" varchar(50) DEFAULT 'loading' NOT NULL,
	"percent" integer DEFAULT 0 NOT NULL,
	"pages_total" integer DEFAULT 0 NOT NULL,
	"pages_done" integer DEFAULT 0 NOT NULL,
	"blocks_done" integer DEFAULT 0 NOT NULL,
	"orphan_count" integer DEFAULT 0 NOT NULL,
	"avg_word_count" integer DEFAULT 0 NOT NULL,
	"deep_pages" integer DEFAULT 0 NOT NULL,
	"avg_click_depth" real DEFAULT 0 NOT NULL,
	"import_duration" integer,
	"logs" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"error_message" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	CONSTRAINT "import_jobs_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" varchar PRIMARY KEY NOT NULL,
	"project_id" varchar NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"field_mapping" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"source_page_id" uuid NOT NULL,
	"target_page_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"target_url" text NOT NULL,
	"anchor_text" text NOT NULL,
	"scenario" varchar(30) NOT NULL,
	"similarity" real,
	"position" integer NOT NULL,
	"is_draft" boolean DEFAULT true NOT NULL,
	"is_rejected" boolean DEFAULT false NOT NULL,
	"rejection_reason" text,
	"css_class" text,
	"rel_attribute" text,
	"target_attribute" text,
	"modified_sentence" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"type" text DEFAULT 'info' NOT NULL,
	"dismissed" text DEFAULT 'false' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"job_id" varchar(50) NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"content_vector" text NOT NULL,
	"published_at" timestamp,
	"word_count" integer DEFAULT 0 NOT NULL,
	"is_deep" boolean DEFAULT false NOT NULL,
	"is_money" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages_clean" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_raw_id" uuid NOT NULL,
	"clean_html" text NOT NULL,
	"word_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages_raw" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar(50) NOT NULL,
	"url" text NOT NULL,
	"raw_html" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"import_batch_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"api_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_api_keys_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "project_import_configs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text NOT NULL,
	"file_name" text NOT NULL,
	"field_mapping" jsonb NOT NULL,
	"selected_scenarios" jsonb NOT NULL,
	"scope_settings" jsonb NOT NULL,
	"linking_rules" jsonb NOT NULL,
	"is_last_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"status" "project_status" DEFAULT 'QUEUED' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"create_project" text DEFAULT 'false' NOT NULL,
	"upload_texts" text DEFAULT 'false' NOT NULL,
	"set_priorities" text DEFAULT 'false' NOT NULL,
	"generate_draft" text DEFAULT 'false' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"provider" "provider" DEFAULT 'LOCAL' NOT NULL,
	"google_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_page_id_pages_clean_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages_clean"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broken_urls" ADD CONSTRAINT "broken_urls_run_id_generation_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_job_id_import_jobs_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("job_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_from_page_id_pages_clean_id_fk" FOREIGN KEY ("from_page_id") REFERENCES "public"."pages_clean"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edges" ADD CONSTRAINT "edges_to_page_id_pages_clean_id_fk" FOREIGN KEY ("to_page_id") REFERENCES "public"."pages_clean"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embedding_cache" ADD CONSTRAINT "embedding_cache_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_block_id_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_meta" ADD CONSTRAINT "graph_meta_page_id_pages_clean_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages_clean"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_meta" ADD CONSTRAINT "graph_meta_job_id_import_jobs_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("job_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_candidates" ADD CONSTRAINT "link_candidates_run_id_generation_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("run_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_candidates" ADD CONSTRAINT "link_candidates_source_page_id_pages_clean_id_fk" FOREIGN KEY ("source_page_id") REFERENCES "public"."pages_clean"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_candidates" ADD CONSTRAINT "link_candidates_target_page_id_pages_clean_id_fk" FOREIGN KEY ("target_page_id") REFERENCES "public"."pages_clean"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_embeddings" ADD CONSTRAINT "page_embeddings_page_id_pages_clean_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages_clean"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_embeddings" ADD CONSTRAINT "page_embeddings_job_id_import_jobs_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("job_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages_clean" ADD CONSTRAINT "pages_clean_page_raw_id_pages_raw_id_fk" FOREIGN KEY ("page_raw_id") REFERENCES "public"."pages_raw"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages_raw" ADD CONSTRAINT "pages_raw_job_id_import_jobs_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("job_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_api_keys" ADD CONSTRAINT "project_api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_import_configs" ADD CONSTRAINT "project_import_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;