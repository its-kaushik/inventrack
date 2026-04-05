CREATE TYPE "public"."conflict_status" AS ENUM('unresolved', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."conflict_type" AS ENUM('negative_stock', 'duplicate_customer', 'stale_price', 'bill_number_collision');--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"conflict_type" "conflict_type" NOT NULL,
	"description" text NOT NULL,
	"related_sale_id" uuid,
	"related_data" jsonb,
	"status" "conflict_status" DEFAULT 'unresolved' NOT NULL,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;