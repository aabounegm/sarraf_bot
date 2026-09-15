ALTER TABLE `claims` ADD `receiveMethod` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `claims` SET `receiveMethod` = (SELECT json_extract(`offers`.`giveMethods`, '$[0]') FROM `offers` WHERE `offers`.`id` = `claims`.`offerId`) WHERE `receiveMethod` = '';
