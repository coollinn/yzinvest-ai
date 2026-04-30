CREATE TABLE `favorites` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`ts_code` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fav` ON `favorites` (`user_id`,`ts_code`);--> statement-breakpoint
CREATE INDEX `idx_fav_user` ON `favorites` (`user_id`);--> statement-breakpoint
CREATE TABLE `financial_data` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts_code` text NOT NULL,
	`report_type` text NOT NULL,
	`report_date` text NOT NULL,
	`financial_type` text NOT NULL,
	`data_key` text NOT NULL,
	`data_value` real,
	`data_unit` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fin` ON `financial_data` (`ts_code`,`financial_type`,`report_type`,`report_date`,`data_key`);--> statement-breakpoint
CREATE INDEX `idx_fin_code` ON `financial_data` (`ts_code`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`ts_code` text NOT NULL,
	`content` text NOT NULL,
	`analysis_type` text,
	`rating` integer,
	`tags` text DEFAULT '[]',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notes_user` ON `notes` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_notes_code` ON `notes` (`ts_code`);--> statement-breakpoint
CREATE TABLE `stock_daily` (
	`ts_code` text NOT NULL,
	`trade_date` text NOT NULL,
	`open` real,
	`high` real,
	`low` real,
	`close` real,
	`pre_close` real,
	`change` real,
	`pct_chg` real,
	`vol` real,
	`amount` real,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`ts_code`, `trade_date`)
);
--> statement-breakpoint
CREATE INDEX `idx_daily_date` ON `stock_daily` (`trade_date`);--> statement-breakpoint
CREATE TABLE `stocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts_code` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`area` text,
	`industry` text,
	`fullname` text,
	`enname` text,
	`cnspell` text,
	`market` text,
	`exchange` text,
	`curr_type` text,
	`list_status` text,
	`list_date` text,
	`delist_date` text,
	`is_hs` text,
	`act_name` text,
	`act_ent_type` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stocks_ts_code_unique` ON `stocks` (`ts_code`);--> statement-breakpoint
CREATE INDEX `idx_stocks_industry` ON `stocks` (`industry`);--> statement-breakpoint
CREATE INDEX `idx_stocks_cnspell` ON `stocks` (`cnspell`);--> statement-breakpoint
CREATE INDEX `idx_stocks_name` ON `stocks` (`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`full_name` text,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `valuation_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`ts_code` text NOT NULL,
	`type` text NOT NULL,
	`params_hash` text NOT NULL,
	`result` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_val` ON `valuation_cache` (`user_id`,`ts_code`,`type`,`params_hash`);