-- CreateTable
CREATE TABLE "ElectiveMapping" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "posCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "semester" INTEGER,
    "courseTitle" TEXT,
    "titleKey" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "ElectiveMapping_posCode_category_slot_key" ON "ElectiveMapping"("posCode", "category", "slot");
