-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('NEW', 'PROCESSING', 'IN_TRANSIT', 'COMPLETED', 'DELAYED', 'CANCELLED');

CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

CREATE TYPE "ShipmentMilestone" AS ENUM ('CREATED', 'BOOKING', 'EMPTY_PICKUP', 'STUFFING', 'GATE_IN', 'LOADED_ON_VESSEL', 'VESSEL_DEPARTED', 'IN_TRANSIT', 'TRANSSHIPMENT', 'ARRIVED', 'DISCHARGED', 'CONTAINER_PICKUP', 'DELIVERED', 'EMPTY_RETURNED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ContainerType" AS ENUM ('GP20', 'GP40', 'HC40', 'REEFER');

-- CreateEnum
CREATE TYPE "ContainerStatus" AS ENUM ('EMPTY_RELEASED', 'PICKED_UP', 'STUFFING', 'GATE_IN', 'LOADED_ON_VESSEL', 'VESSEL_DEPARTED', 'IN_TRANSIT', 'TRANSSHIPMENT', 'ARRIVED', 'DISCHARGED', 'AVAILABLE', 'GATE_OUT', 'DELIVERED', 'EMPTY_RETURNED');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "tax_id" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ports" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,

    CONSTRAINT "ports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "shipment_no" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "shipper" TEXT,
    "consignee" TEXT,
    "cargo_type" TEXT,
    "cargo_name" TEXT NOT NULL,
    "quantity" DECIMAL(14,3),
    "weight_kg" DECIMAL(14,3),
    "cbm" DECIMAL(14,3),
    "incoterm" TEXT,
    "pol_id" TEXT,
    "pod_id" TEXT,
    "place_of_receipt" TEXT,
    "place_of_delivery" TEXT,
    "etd" TIMESTAMP(3),
    "atd" TIMESTAMP(3),
    "eta" TIMESTAMP(3),
    "ata" TIMESTAMP(3),
    "status" "ShipmentStatus" NOT NULL DEFAULT 'NEW',
    "assignee_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "booking_no" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "shipping_line" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "confirmed_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills_of_lading" (
    "id" TEXT NOT NULL,
    "bl_no" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bills_of_lading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "containers" (
    "id" TEXT NOT NULL,
    "container_no" TEXT NOT NULL,
    "seal_no" TEXT,
    "type" "ContainerType" NOT NULL,
    "status" "ContainerStatus" NOT NULL DEFAULT 'EMPTY_RELEASED',
    "shipping_line" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_containers" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),

    CONSTRAINT "shipment_containers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_events" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "milestone" "ShipmentMilestone" NOT NULL,
    "planned_at" TIMESTAMP(3),
    "actual_at" TIMESTAMP(3),
    "note" TEXT,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "container_events" (
    "id" TEXT NOT NULL,
    "container_id" TEXT NOT NULL,
    "shipment_id" TEXT,
    "status" "ContainerStatus" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "updated_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "container_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE INDEX "customers_company_name_idx" ON "customers"("company_name");

-- CreateIndex
CREATE UNIQUE INDEX "ports_code_key" ON "ports"("code");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_shipment_no_key" ON "shipments"("shipment_no");

-- CreateIndex
CREATE INDEX "shipments_customer_id_idx" ON "shipments"("customer_id");

-- CreateIndex
CREATE INDEX "shipments_status_eta_idx" ON "shipments"("status", "eta");

-- CreateIndex
CREATE INDEX "shipments_pol_id_pod_id_idx" ON "shipments"("pol_id", "pod_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_no_key" ON "bookings"("booking_no");

-- CreateIndex
CREATE INDEX "bookings_shipment_id_idx" ON "bookings"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "bills_of_lading_bl_no_key" ON "bills_of_lading"("bl_no");

-- CreateIndex
CREATE INDEX "bills_of_lading_booking_id_idx" ON "bills_of_lading"("booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "containers_container_no_key" ON "containers"("container_no");

-- CreateIndex
CREATE INDEX "containers_status_idx" ON "containers"("status");

-- CreateIndex
CREATE INDEX "shipment_containers_shipment_id_idx" ON "shipment_containers"("shipment_id");

-- CreateIndex
CREATE INDEX "shipment_containers_container_id_idx" ON "shipment_containers"("container_id");

-- A container can be assigned to only one active shipment at a time.
CREATE UNIQUE INDEX "shipment_containers_one_active_per_container" ON "shipment_containers"("container_id") WHERE "released_at" IS NULL;

-- CreateIndex
CREATE INDEX "shipment_events_shipment_id_created_at_idx" ON "shipment_events"("shipment_id", "created_at");

-- CreateIndex
CREATE INDEX "container_events_container_id_occurred_at_idx" ON "container_events"("container_id", "occurred_at");

-- CreateIndex
CREATE INDEX "container_events_shipment_id_idx" ON "container_events"("shipment_id");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_pol_id_fkey" FOREIGN KEY ("pol_id") REFERENCES "ports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_pod_id_fkey" FOREIGN KEY ("pod_id") REFERENCES "ports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills_of_lading" ADD CONSTRAINT "bills_of_lading_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_containers" ADD CONSTRAINT "shipment_containers_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_containers" ADD CONSTRAINT "shipment_containers_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_containers" ADD CONSTRAINT "shipment_containers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_events" ADD CONSTRAINT "container_events_container_id_fkey" FOREIGN KEY ("container_id") REFERENCES "containers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "container_events" ADD CONSTRAINT "container_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "container_events" ADD CONSTRAINT "container_events_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shipments" ADD CONSTRAINT "shipments_positive_quantity" CHECK ("quantity" IS NULL OR "quantity" > 0);
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_nonnegative_weight" CHECK ("weight_kg" IS NULL OR "weight_kg" >= 0);
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_nonnegative_cbm" CHECK ("cbm" IS NULL OR "cbm" >= 0);
