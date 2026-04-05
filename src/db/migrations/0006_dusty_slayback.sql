CREATE TYPE "public"."payment_method" AS ENUM('cash', 'upi', 'card', 'credit');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('completed', 'cancelled', 'returned', 'partially_returned');--> statement-breakpoint
CREATE TABLE "bill_number_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"financial_year" varchar(5) NOT NULL,
	"prefix" varchar(10) NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parked_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"cart_data" jsonb NOT NULL,
	"parked_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" uuid,
	"product_name" varchar(500) NOT NULL,
	"variant_description" varchar(255),
	"quantity" integer NOT NULL,
	"mrp" numeric(12, 2) NOT NULL,
	"product_discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"cost_at_sale" numeric(12, 2) NOT NULL,
	"hsn_code" varchar(8),
	"gst_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"cgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bill_number" varchar(50) NOT NULL,
	"customer_id" uuid NOT NULL,
	"subtotal_mrp" numeric(12, 2) NOT NULL,
	"product_discount_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"bill_discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"bill_discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"bargain_adjustment" numeric(12, 2) DEFAULT '0' NOT NULL,
	"effective_discount_pct" numeric(5, 2) NOT NULL,
	"subtotal_taxable" numeric(12, 2) NOT NULL,
	"total_cgst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_sgst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_igst" numeric(12, 2) DEFAULT '0' NOT NULL,
	"round_off" numeric(5, 2) DEFAULT '0' NOT NULL,
	"net_payable" numeric(12, 2) NOT NULL,
	"total_cogs" numeric(12, 2) NOT NULL,
	"status" "sale_status" DEFAULT 'completed' NOT NULL,
	"channel" varchar(20) DEFAULT 'in_store' NOT NULL,
	"gst_scheme" varchar(20) NOT NULL,
	"billed_by" uuid NOT NULL,
	"approved_by" uuid,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"client_id" uuid,
	"is_offline" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
ALTER TABLE "bill_number_sequences" ADD CONSTRAINT "bill_number_sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parked_bills" ADD CONSTRAINT "parked_bills_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parked_bills" ADD CONSTRAINT "parked_bills_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parked_bills" ADD CONSTRAINT "parked_bills_parked_by_users_id_fk" FOREIGN KEY ("parked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_billed_by_users_id_fk" FOREIGN KEY ("billed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_bill_seq_tenant_fy_prefix" ON "bill_number_sequences" USING btree ("tenant_id","financial_year","prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sales_tenant_bill" ON "sales" USING btree ("tenant_id","bill_number");--> statement-breakpoint
CREATE INDEX "idx_sales_tenant_customer" ON "sales" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE INDEX "idx_sales_tenant_created" ON "sales" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_sales_tenant_status" ON "sales" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_sales_tenant_channel" ON "sales" USING btree ("tenant_id","channel");