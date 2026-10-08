/*
  Warnings:

  - You are about to drop the column `ch` on the `ElectiveMapping` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ElectiveMapping" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "posCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "semester" INTEGER,
    "courseTitle" TEXT,
    "titleKey" TEXT
);
INSERT INTO "new_ElectiveMapping" ("category", "courseTitle", "id", "posCode", "semester", "slot", "titleKey") SELECT "category", "courseTitle", "id", "posCode", "semester", "slot", "titleKey" FROM "ElectiveMapping";
DROP TABLE "ElectiveMapping";
ALTER TABLE "new_ElectiveMapping" RENAME TO "ElectiveMapping";
CREATE UNIQUE INDEX "ElectiveMapping_posCode_category_slot_key" ON "ElectiveMapping"("posCode", "category", "slot");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
