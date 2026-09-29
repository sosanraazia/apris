-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "hash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "prevHash" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Student" ADD COLUMN "archivedReason" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Registration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "removals" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Registration_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Registration_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Registration" ("id", "removals", "semesterId", "status", "studentId", "updatedAt", "version") SELECT "id", "removals", "semesterId", "status", "studentId", "updatedAt", "version" FROM "Registration";
DROP TABLE "Registration";
ALTER TABLE "new_Registration" RENAME TO "Registration";
CREATE UNIQUE INDEX "Registration_studentId_semesterId_key" ON "Registration"("studentId", "semesterId");
CREATE TABLE "new_Snapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "cgpa" REAL,
    "completedCH" INTEGER NOT NULL,
    "requiredCH" INTEGER,
    "homeSection" TEXT,
    "courses" TEXT NOT NULL,
    "terms" TEXT NOT NULL,
    "warnings" TEXT NOT NULL DEFAULT '[]',
    "transcriptFile" TEXT,
    "fulfillmentFile" TEXT,
    CONSTRAINT "Snapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Snapshot" ("active", "cgpa", "completedCH", "courses", "createdAt", "fulfillmentFile", "homeSection", "id", "requiredCH", "studentId", "terms", "transcriptFile", "verifiedById", "warnings") SELECT "active", "cgpa", "completedCH", "courses", "createdAt", "fulfillmentFile", "homeSection", "id", "requiredCH", "studentId", "terms", "transcriptFile", "verifiedById", "warnings" FROM "Snapshot";
DROP TABLE "Snapshot";
ALTER TABLE "new_Snapshot" RENAME TO "Snapshot";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_studentRegId_idx" ON "AuditLog"("studentRegId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
