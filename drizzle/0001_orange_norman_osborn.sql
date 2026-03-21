CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`runId` int,
	`title` varchar(256) NOT NULL,
	`content` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `screener_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runId` int NOT NULL,
	`stockCode` varchar(10) NOT NULL,
	`stockName` varchar(64) NOT NULL,
	`currentPrice` decimal(10,2),
	`priceChange` decimal(10,2),
	`priceChangePct` decimal(8,4),
	`volume` int,
	`condMaAligned` boolean NOT NULL DEFAULT false,
	`condVolumeSpike` boolean NOT NULL DEFAULT false,
	`condObvRising` boolean NOT NULL DEFAULT false,
	`condVrAbove` boolean NOT NULL DEFAULT false,
	`condBullishBreakout` boolean NOT NULL DEFAULT false,
	`ma5` decimal(10,2),
	`ma10` decimal(10,2),
	`ma20` decimal(10,2),
	`ma40` decimal(10,2),
	`volumeRatio` decimal(8,4),
	`vrValue` decimal(8,2),
	`obvValue` decimal(20,2),
	`breakoutPrice` decimal(10,2),
	`conditionsMetCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `screener_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `screener_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runDate` varchar(10) NOT NULL,
	`totalScanned` int NOT NULL DEFAULT 0,
	`totalMatched` int NOT NULL DEFAULT 0,
	`status` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `screener_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `screener_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL DEFAULT '預設設定',
	`maPeriods` json NOT NULL DEFAULT ('[5,10,20,40]'),
	`volumeMultiplier` decimal(5,2) NOT NULL DEFAULT '1.5',
	`vrThreshold` int NOT NULL DEFAULT 120,
	`vrPeriod` int NOT NULL DEFAULT 26,
	`bullishCandleMinPct` decimal(5,2) NOT NULL DEFAULT '2.0',
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `screener_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`stockCode` varchar(10) NOT NULL,
	`stockName` varchar(64) NOT NULL,
	`addedPrice` decimal(10,2),
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watchlist_id` PRIMARY KEY(`id`)
);
