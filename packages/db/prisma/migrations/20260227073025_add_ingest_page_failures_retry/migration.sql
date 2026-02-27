-- CreateTable
CREATE TABLE `ingest_page_failures` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sourceId` INTEGER NOT NULL,
    `notionPageId` VARCHAR(191) NOT NULL,
    `status` ENUM('open', 'retry_queued', 'resolved') NOT NULL DEFAULT 'open',
    `failureCount` INTEGER NOT NULL DEFAULT 0,
    `latestIngestJobId` INTEGER NOT NULL,
    `retryIngestJobId` INTEGER NULL,
    `targetType` VARCHAR(191) NULL,
    `targetIdValue` VARCHAR(191) NULL,
    `failureStage` VARCHAR(191) NOT NULL DEFAULT 'unknown',
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` TEXT NOT NULL,
    `firstFailedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastFailedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `retryRequestedAt` DATETIME(3) NULL,
    `retryRequestedBy` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolvedIngestJobId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `idx_page_failures_source_status`(`sourceId`, `status`, `lastFailedAt`),
    INDEX `idx_page_failures_page`(`notionPageId`),
    UNIQUE INDEX `uniq_page_failure_source_page`(`sourceId`, `notionPageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ingest_page_failures` ADD CONSTRAINT `ingest_page_failures_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `sources`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ingest_page_failures` ADD CONSTRAINT `ingest_page_failures_latestIngestJobId_fkey` FOREIGN KEY (`latestIngestJobId`) REFERENCES `ingest_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ingest_page_failures` ADD CONSTRAINT `ingest_page_failures_retryIngestJobId_fkey` FOREIGN KEY (`retryIngestJobId`) REFERENCES `ingest_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
