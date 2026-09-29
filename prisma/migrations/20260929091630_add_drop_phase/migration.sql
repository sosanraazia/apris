-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RegistrationVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "registrationId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "items" TEXT NOT NULL,
    "changes" TEXT NOT NULL,
    "reason" TEXT,
    "phase" TEXT NOT NULL DEFAULT 'REGISTRATION',
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notification" TEXT NOT NULL DEFAULT 'NOT_QUEUED',
    CONSTRAINT "RegistrationVersion_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RegistrationVersion" ("changes", "createdAt", "id", "items", "notification", "reason", "registrationId", "userId", "version") SELECT "changes", "createdAt", "id", "items", "notification", "reason", "registrationId", "userId", "version" FROM "RegistrationVersion";
DROP TABLE "RegistrationVersion";
ALTER TABLE "new_RegistrationVersion" RENAME TO "RegistrationVersion";
CREATE TABLE "new_Semester" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "phase" TEXT NOT NULL DEFAULT 'REGISTRATION',
    "addDropEnds" DATETIME
);
INSERT INTO "new_Semester" ("active", "id", "name") SELECT "active", "id", "name" FROM "Semester";
DROP TABLE "Semester";
ALTER TABLE "new_Semester" RENAME TO "Semester";
CREATE UNIQUE INDEX "Semester_name_key" ON "Semester"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
