CREATE TABLE `claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`offerId` integer NOT NULL,
	`takerId` integer NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`takerDone` integer DEFAULT false NOT NULL,
	`posterDone` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_claims_offerId_offers_id_fk` FOREIGN KEY (`offerId`) REFERENCES `offers`(`id`),
	CONSTRAINT `fk_claims_takerId_users_id_fk` FOREIGN KEY (`takerId`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`posterId` integer NOT NULL,
	`giveCurrency` text NOT NULL,
	`giveAmount` integer NOT NULL,
	`giveMethods` text NOT NULL,
	`getCurrency` text NOT NULL,
	`getMethods` text NOT NULL,
	`rate` real,
	`negotiable` integer DEFAULT false NOT NULL,
	`note` text,
	`expiresAt` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`channelMessageId` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_offers_posterId_users_id_fk` FOREIGN KEY (`posterId`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY,
	`username` text,
	`firstName` text NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
