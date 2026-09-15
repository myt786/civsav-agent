CREATE TABLE "client_seo_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"recommendations" jsonb NOT NULL,
	"sitemap_url_count" integer,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_seo_recommendations_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
ALTER TABLE "client_seo_recommendations" ADD CONSTRAINT "client_seo_recommendations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;