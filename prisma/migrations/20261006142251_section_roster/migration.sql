-- CreateTable
CREATE TABLE "SectionRoster" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "registrationId" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "sourceSection" TEXT NOT NULL,
    "regular" BOOLEAN NOT NULL,
    "courseCode" TEXT,
    "uploadedById" INTEGER,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SectionRoster_registrationId_idx" ON "SectionRoster"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "SectionRoster_registrationId_term_sourceSection_key" ON "SectionRoster"("registrationId", "term", "sourceSection");
