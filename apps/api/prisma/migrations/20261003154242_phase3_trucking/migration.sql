-- CreateEnum
CREATE TYPE "TruckType" AS ENUM ('TRUCK', 'TRACTOR');

-- CreateEnum
CREATE TYPE "TruckStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'PICKING_UP', 'IN_TRANSIT', 'DELIVERING', 'COMPLETED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'ON_TRIP', 'OFF_DUTY');

-- CreateEnum
CREATE TYPE "TransportJobStatus" AS ENUM ('ASSIGNED', 'PICKING_UP', 'IN_TRANSIT', 'DELIVERING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "trucks" (
    "id" TEXT NOT NULL,
    "plate_no" TEXT NOT NULL,
    "type" "TruckType" NOT NULL,
    "capacity_kg" DECIMAL(12,2) NOT NULL,
    "status" "TruckStatus" NOT NULL DEFAULT 'AVAILABLE',
    "gps_device_id" TEXT,
    "inspection_expires" TIMESTAMP(3),
    "insurance_expires" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trucks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trailers" (
    "id" TEXT NOT NULL,
    "plate_no" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "capacity_kg" DECIMAL(12,2) NOT NULL,
    "truck_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trailers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "license_no" TEXT NOT NULL,
    "license_class" TEXT NOT NULL,
    "license_expires" TIMESTAMP(3) NOT NULL,
    "assigned_truck_id" TEXT,
    "status" "DriverStatus" NOT NULL DEFAULT 'AVAILABLE',
    "user_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_jobs" (
    "id" TEXT NOT NULL,
    "job_no" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "container_id" TEXT,
    "truck_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "pickup_place" TEXT NOT NULL,
    "delivery_place" TEXT NOT NULL,
    "pickup_at" TIMESTAMP(3) NOT NULL,
    "delivery_at" TIMESTAMP(3) NOT NULL,
    "status" "TransportJobStatus" NOT NULL DEFAULT 'ASSIGNED',
    "actual_pickup_at" TIMESTAMP(3),
    "actual_delivery_at" TIMESTAMP(3),
    "loaded_km" DECIMAL(12,2),
    "empty_km" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_job_events" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "status" "TransportJobStatus" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_job_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance" (
    "id" TEXT NOT NULL,
    "truck_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trucks_plate_no_key" ON "trucks"("plate_no");

-- CreateIndex
CREATE UNIQUE INDEX "trailers_plate_no_key" ON "trailers"("plate_no");

-- CreateIndex
CREATE INDEX "trailers_truck_id_idx" ON "trailers"("truck_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_code_key" ON "drivers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_license_no_key" ON "drivers"("license_no");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "transport_jobs_job_no_key" ON "transport_jobs"("job_no");

-- CreateIndex
CREATE INDEX "transport_jobs_truck_id_pickup_at_delivery_at_idx" ON "transport_jobs"("truck_id", "pickup_at", "delivery_at");

-- CreateIndex
CREATE INDEX "transport_jobs_driver_id_pickup_at_delivery_at_idx" ON "transport_jobs"("driver_id", "pickup_at", "delivery_at");

-- CreateIndex
CREATE INDEX "transport_jobs_shipment_id_idx" ON "transport_jobs"("shipment_id");

-- CreateIndex
CREATE INDEX "transport_job_events_job_id_occurred_at_idx" ON "transport_job_events"("job_id", "occurred_at");

-- CreateIndex
CREATE INDEX "maintenance_truck_id_starts_at_ends_at_idx" ON "maintenance"("truck_id", "starts_at", "ends_at");

-- AddForeignKey
ALTER TABLE "trailers" ADD CONSTRAINT "trailers_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_assigned_truck_id_fkey" FOREIGN KEY ("assigned_truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_jobs" ADD CONSTRAINT "transport_jobs_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_jobs" ADD CONSTRAINT "transport_jobs_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_jobs" ADD CONSTRAINT "transport_jobs_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_jobs" ADD CONSTRAINT "transport_jobs_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_job_events" ADD CONSTRAINT "transport_job_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "transport_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_job_events" ADD CONSTRAINT "transport_job_events_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance" ADD CONSTRAINT "maintenance_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_capacity_positive" CHECK (capacity_kg > 0);
ALTER TABLE "trailers" ADD CONSTRAINT "trailers_capacity_positive" CHECK (capacity_kg > 0);
ALTER TABLE "transport_jobs" ADD CONSTRAINT "transport_jobs_time_order" CHECK (delivery_at > pickup_at);
ALTER TABLE "transport_jobs" ADD CONSTRAINT "transport_jobs_km_nonnegative" CHECK ((loaded_km IS NULL OR loaded_km >= 0) AND (empty_km IS NULL OR empty_km >= 0));
ALTER TABLE "maintenance" ADD CONSTRAINT "maintenance_time_order" CHECK (ends_at > starts_at);
