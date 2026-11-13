-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "type" VARCHAR(48) NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "title" VARCHAR(180) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "entity" VARCHAR(48) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alerts_source_key_key" ON "alerts"("source_key");

-- CreateIndex
CREATE INDEX "alerts_status_severity_detected_at_idx" ON "alerts"("status", "severity", "detected_at");

-- CreateIndex
CREATE INDEX "alerts_entity_entity_id_idx" ON "alerts"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "alerts_due_at_idx" ON "alerts"("due_at");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
