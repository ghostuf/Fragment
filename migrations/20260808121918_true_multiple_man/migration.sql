CREATE TABLE `chunks` (
	`file_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`r2_key` text NOT NULL,
	`size` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	CONSTRAINT `chunks_pk` PRIMARY KEY(`file_id`, `chunk_index`),
	CONSTRAINT `fk_chunks_file_id_files_id_fk` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY,
	`filename` text NOT NULL,
	`size` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
