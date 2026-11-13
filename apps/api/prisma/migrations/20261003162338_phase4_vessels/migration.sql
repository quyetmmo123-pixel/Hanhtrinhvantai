-- CreateEnum
CREATE TYPE "VesselStatus" AS ENUM ('AT_PORT', 'ANCHORED', 'UNDERWAY', 'IN_TRANSIT', 'ARRIVED');

-- CreateEnum
CREATE TYPE "VoyageStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'DEPARTED', 'ARRIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VoyageContainerStatus" AS ENUM ('BOOKED', 'LOADED', 'DISCHARGED', 'CANCELLED');

-- CreateTable
CREATE TABLE "vessels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imo" TEXT NOT NULL,
    "mmsi" TEXT,
    "call_sign" TEXT,
    "flag" TEXT,
    "shipping_line" TEXT NOT NULL,
    "vessel_type" TEXT NOT NULL,
    "status" "VesselStatus" NOT NULL DEFAULT 'AT_PORT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vessels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voyages" (
    "id" TEXT NOT NULL,
    "voyage_no" TEXT NOT NULL,
    "vessel_id" TEXT NOT NULL,
    "pol_id" TEXT NOT NULL,
    "pod_id" TEXT NOT NULL,
    "etd" TIMESTAMP(3) NOT NULL,
    "atd" TIMESTAMP(3),
    "eta" TIMESTAMP(3) NOT NULL,
    "ata" TIMESTAMP(3),
    "status" "VoyageStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voyages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voyage_events" (
    "id" TEXT NOT NULL,
    "voyage_id" TEXT NOT NULL,
    "status" "VoyageStatus" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voyage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voyage_containers" (
    "id" TEXT NOT NULL,
    "voyage_id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "shipment_container_id" TEXT NOT NULL,
    "status" "VoyageContainerStatus" NOT NULL DEFAULT 'BOOKED',
    "booked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loaded_at" TIMESTAMP(3),
    "discharged_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "voyage_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voyage_container_events" (
    "id" TEXT NOT NULL,
    "voyage_container_id" TEXT NOT NULL,
    "status" "VoyageContainerStatus" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voyage_container_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vessels_imo_key" ON "vessels"("imo");

-- CreateIndex
CREATE UNIQUE INDEX "vessels_mmsi_key" ON "vessels"("mmsi");

-- CreateIndex
CREATE INDEX "vessels_name_idx" ON "vessels"("name");

-- CreateIndex
CREATE INDEX "voyages_status_eta_idx" ON "voyages"("status", "eta");

-- CreateIndex
CREATE INDEX "voyages_pol_id_pod_id_idx" ON "voyages"("pol_id", "pod_id");

-- CreateIndex
CREATE UNIQUE INDEX "voyages_vessel_id_voyage_no_key" ON "voyages"("vessel_id", "voyage_no");

-- CreateIndex
CREATE INDEX "voyage_events_voyage_id_occurred_at_idx" ON "voyage_events"("voyage_id", "occurred_at");

-- CreateIndex
CREATE INDEX "voyage_containers_container_id_status_idx" ON "voyage_containers"("container_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "voyage_containers_voyage_id_container_id_key" ON "voyage_containers"("voyage_id", "container_id");

-- CreateIndex
CREATE INDEX "voyage_container_events_voyage_container_id_occurred_at_idx" ON "voyage_container_events"("voyage_container_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "voyages" ADD CONSTRAINT "voyages_vessel_id_fkey" FOREIGN KEY ("vessel_id") REFERENCES "vessels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voyages" ADD CONSTRAINT "voyages_pol_id_fkey" FOREIGN KEY ("pol_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voyages" ADD CONSTRAINT "voyages_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "ports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voyage_events" ADD CONSTRAINT "voyage_events_voyage_id_fkey" FOREIGN KEY ("voyage_id") REFERENCES "voyages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voyage_events" ADD CONSTRAINT "voyage_events_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voyage_containers" ADD CONSTRAINT "voyage_containers_voyage_id_fkey" FOREIGN KEY ("voyage_id") REFERENCES "voyages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voyage_containers" ADD CONSTRAINT "voyage_containers_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voyage_containers" ADD CONSTRAINT "voyage_containers_shipment_container_id_fkey" FOREIGN KEY ("shipment_container_id") REFERENCES "shipment_containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voyage_container_events" ADD CONSTRAINT "voyage_container_events_voyage_container_id_fkey" FOREIGN KEY ("voyage_container_id") REFERENCES "voyage_containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voyage_container_events" ADD CONSTRAINT "voyage_container_events_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "voyages" ADD CONSTRAINT "voyages_time_order" CHECK (eta > etd);
ALTER TABLE "voyages" ADD CONSTRAINT "voyages_distinct_ports" CHECK (pol_id <> pod_id);
