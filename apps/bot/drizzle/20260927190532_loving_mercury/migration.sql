CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`userId` integer NOT NULL,
	`giveCurrency` text NOT NULL,
	`getCurrency` text NOT NULL,
	`giveMethods` text NOT NULL,
	`getMethods` text NOT NULL,
	`paused` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_alerts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alerts_user_pair` ON `alerts` (`userId`,`giveCurrency`,`getCurrency`);