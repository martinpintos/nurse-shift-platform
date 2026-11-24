-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('nurse', 'agency', 'admin');

-- CreateEnum
CREATE TYPE "ShiftRole" AS ENUM ('RN', 'LPN');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('open', 'filled', 'cancelled');

-- CreateTable
CREATE TABLE "Agency" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "agencyId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateSequence (hand-added: Prisma doesn't create sequences for dbgenerated defaults)
-- Shift ids are 'shift-' || nextval, so concurrent posts can't collide.
CREATE SEQUENCE "shift_id_seq";

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL DEFAULT ('shift-'::text || nextval('shift_id_seq'::regclass)),
    "agencyId" TEXT NOT NULL,
    "role" "ShiftRole" NOT NULL,
    "date" DATE NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'open',
    "claimedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- Drop the sequence with the table.
ALTER SEQUENCE "shift_id_seq" OWNED BY "Shift"."id";

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_agencyId_idx" ON "User"("agencyId");

-- CreateIndex
CREATE INDEX "Shift_agencyId_idx" ON "Shift"("agencyId");

-- CreateIndex
CREATE INDEX "Shift_claimedById_idx" ON "Shift"("claimedById");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
