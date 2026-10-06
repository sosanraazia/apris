-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "externalId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "batches" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_User" ("active", "authProvider", "department", "email", "externalId", "id", "mustChangePassword", "name", "passwordHash", "role", "username") SELECT "active", "authProvider", "department", "email", "externalId", "id", "mustChangePassword", "name", "passwordHash", "role", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
