CREATE TYPE "public"."refund_mode" AS ENUM('cash', 'khata', 'exchange', 'store_credit');--> statement-breakpoint
CREATE TYPE "public"."return_reason" AS ENUM('size_issue', 'defect', 'changed_mind', 'color_mismatch', 'other');--> statement-breakpoint
CREATE TYPE "public"."return_type" AS ENUM('full', 'partial', 'exchange');--> statement-breakpoint
CREATE TABLE "sales_return_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sales_return_id" uuid NOT NULL,
	"sale_item_id" uuid,
	"variant_id" uuid,
	"quantity" integer NOT NULL,
	"refund_amount" numeric(12, 2) NOT NULL,
	"reason" "return_reason" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"return_number" varchar(50) NOT NULL,
	"original_sale_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"return_type" "return_type" NOT NULL,
	"total_refund_amount" numeric(12, 2) NOT NULL,
	"refund_mode" "refund_mode" NOT NULL,
	"khata_adjustment" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cash_refund" numeric(12, 2) DEFAULT '0' NOT NULL,
	"exchange_sale_id" uuid,
	"is_within_window" boolean NOT NULL,
	"override_by" uuid,
	"processed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_sales_return_id_sales_returns_id_fk" FOREIGN KEY ("sales_return_id") REFERENCES "public"."sales_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_sale_item_id_sale_items_id_fk" FOREIGN KEY ("sale_item_id") REFERENCES "public"."sale_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_original_sale_id_sales_id_fk" FOREIGN KEY ("original_sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_exchange_sale_id_sales_id_fk" FOREIGN KEY ("exchange_sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_override_by_users_id_fk" FOREIGN KEY ("override_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;