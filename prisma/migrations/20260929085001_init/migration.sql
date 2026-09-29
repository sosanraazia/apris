-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "externalId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Pos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "posCode" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "variant" TEXT NOT NULL,
    "totalRequired" INTEGER NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "PosCourse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "posId" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ch" INTEGER NOT NULL,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PosCourse_posId_fkey" FOREIGN KEY ("posId") REFERENCES "Pos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prerequisite" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "course" TEXT NOT NULL,
    "prerequisite" TEXT NOT NULL,
    "rule" TEXT NOT NULL DEFAULT 'Must Pass'
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Offering" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "semesterId" INTEGER NOT NULL,
    "sheet" TEXT NOT NULL,
    "program" TEXT,
    "courseCode" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "section" TEXT,
    "cbaCode" TEXT,
    "preMedOnly" BOOLEAN NOT NULL DEFAULT false,
    "issues" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Offering_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Student" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "registrationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fatherName" TEXT,
    "program" TEXT NOT NULL,
    "admission" TEXT,
    "homeSection" TEXT,
    "standing" TEXT NOT NULL DEFAULT 'NORMAL',
    "posId" INTEGER,
    "advisorId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    CONSTRAINT "Student_posId_fkey" FOREIGN KEY ("posId") REFERENCES "Pos" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Student_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Snapshot" (
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
    CONSTRAINT "Snapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentId" INTEGER NOT NULL,
    "semesterId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Registration_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Registration_semesterId_fkey" FOREIGN KEY ("semesterId") REFERENCES "Semester" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RegistrationItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "registrationId" INTEGER NOT NULL,
    "posCourseCode" TEXT,
    "offeringId" INTEGER NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "overrideReason" TEXT,
    CONSTRAINT "RegistrationItem_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RegistrationVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "registrationId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "items" TEXT NOT NULL,
    "changes" TEXT NOT NULL,
    "reason" TEXT,
    "userId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notification" TEXT NOT NULL DEFAULT 'NOT_QUEUED',
    CONSTRAINT "RegistrationVersion_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "studentRegId" TEXT,
    "before" TEXT,
    "after" TEXT,
    "reason" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Pos_posCode_variant_key" ON "Pos"("posCode", "variant");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_name_key" ON "Semester"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Student_registrationId_key" ON "Student"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_studentId_semesterId_key" ON "Registration"("studentId", "semesterId");
