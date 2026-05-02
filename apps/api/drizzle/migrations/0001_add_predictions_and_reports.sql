CREATE TABLE `predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts_code` text NOT NULL,
	`model_version` text DEFAULT 'v1' NOT NULL,
	`horizon_days` integer DEFAULT 5 NOT NULL,
	`predict_dates` text NOT NULL,
	`predict_prices` text NOT NULL,
	`confidence` real,
	`signal` text DEFAULT 'neutral' NOT NULL,
	`metrics` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pred_ts` ON `predictions` (`ts_code`);
--> statement-breakpoint
CREATE INDEX `idx_pred_created` ON `predictions` (`created_at`);
--> statement-breakpoint
CREATE TABLE `financial_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts_code` text NOT NULL,
	`announcement_id` text NOT NULL,
	`title` text NOT NULL,
	`report_type` text,
	`report_period` text,
	`announcement_date` text,
	`pdf_url` text NOT NULL,
	`file_size` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_announcement` ON `financial_reports` (`announcement_id`);
--> statement-breakpoint
CREATE INDEX `idx_reports_ts` ON `financial_reports` (`ts_code`);
--> statement-breakpoint
CREATE INDEX `idx_reports_period` ON `financial_reports` (`report_period`);
