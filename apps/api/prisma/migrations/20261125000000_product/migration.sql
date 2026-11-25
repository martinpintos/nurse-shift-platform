-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('no-show', 'advance');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('submitted', 'approved');

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "nurseId" TEXT NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "expiresOn" DATE NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftCancellation" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "reason" "CancelReason" NOT NULL,
    "previousNurseId" TEXT NOT NULL,
    "cancelledById" TEXT NOT NULL,
    "cancelledByRole" "UserRole" NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftCancellation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timesheet" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "nurseId" TEXT NOT NULL,
    "actualStart" VARCHAR(5) NOT NULL,
    "actualEnd" VARCHAR(5) NOT NULL,
    "minutesWorked" INTEGER NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'submitted',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "actorRole" "UserRole" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "template" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Credential_nurseId_expiresOn_idx" ON "Credential"("nurseId", "expiresOn");

-- CreateIndex
CREATE INDEX "ShiftCancellation_shiftId_cancelledAt_idx" ON "ShiftCancellation"("shiftId", "cancelledAt");

-- CreateIndex
CREATE INDEX "Timesheet_nurseId_idx" ON "Timesheet"("nurseId");

-- CreateIndex
CREATE UNIQUE INDEX "Timesheet_shiftId_nurseId_key" ON "Timesheet"("shiftId", "nurseId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_seq_key" ON "AuditLog"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxMessage_seq_key" ON "OutboxMessage"("seq");

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCancellation" ADD CONSTRAINT "ShiftCancellation_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCancellation" ADD CONSTRAINT "ShiftCancellation_previousNurseId_fkey" FOREIGN KEY ("previousNurseId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftCancellation" ADD CONSTRAINT "ShiftCancellation_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

