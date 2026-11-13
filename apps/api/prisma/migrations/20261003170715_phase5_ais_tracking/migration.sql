-- CreateTable
CREATE TABLE "vessel_positions" (
    "id" TEXT NOT NULL,
    "vessel_id" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "speed_knots" DECIMAL(7,2),
    "course" DECIMAL(6,2),
    "heading" INTEGER,
    "navigation_status" TEXT,
    "destination" TEXT,
    "eta" TIMESTAMP(3),
    "provider" TEXT NOT NULL,
    "last_update" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vessel_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vessel_positions_vessel_id_last_update_idx" ON "vessel_positions"("vessel_id", "last_update" DESC);

-- CreateIndex
CREATE INDEX "vessel_positions_provider_received_at_idx" ON "vessel_positions"("provider", "received_at");

-- AddForeignKey
ALTER TABLE "vessel_positions" ADD CONSTRAINT "vessel_positions_vessel_id_fkey" FOREIGN KEY ("vessel_id") REFERENCES "vessels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
