CREATE TYPE "public"."gst_scheme" AS ENUM('composite', 'regular');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TABLE "tenant_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"default_bill_discount_pct" numeric(5, 2) DEFAULT '15.00' NOT NULL,
	"max_discount_pct" numeric(5, 2) DEFAULT '30.00' NOT NULL,
	"return_window_days" integer DEFAULT 7 NOT NULL,
	"shelf_aging_threshold_days" integer DEFAULT 90 NOT NULL,
	"bill_number_prefix" varchar(10) DEFAULT 'INV' NOT NULL,
	"receipt_footer_message" text DEFAULT 'Thank you for shopping with us!' NOT NULL,
	"receipt_show_return_policy" boolean DEFAULT true NOT NULL,
	"void_window_hours" integer DEFAULT 24 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text,
	"phone" varchar(15),
	"email" varchar(255),
	"gstin" varchar(15),
	"logo_url" text,
	"gst_scheme" "gst_scheme" DEFAULT 'composite' NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tenant_settings_tenant" ON "tenant_settings" USING btree ("tenant_id");