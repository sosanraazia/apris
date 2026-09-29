# Academic Progression & Registration Intelligence System (APRIS)
## Final Phase-Wise Product Requirements Document

**Initial operational target:** Fall 2026  
**Initial programs:** BS Software Engineering and BS Cyber Security  
**Primary users:** Admin, HoD, Academic Advisors  
**Long-term objective:** Rules-driven academic progression and enrollment automation with human intervention primarily for exceptions.

---

# 1. Product Vision

APRIS is a web-based academic progression and registration automation platform that builds and maintains a structured academic profile for each student using two official university-generated documents:

1. **Interim Transcript**
2. **Plan of Study Fulfillment Report**

These documents remain the **source of truth** for results. APRIS will not become a manual result-entry system.

The initial workflow is:

```text
Official Documents
       ↓
Academic Profile
       ↓
Academic Rules
       ↓
Course Recommendation
       ↓
Advisor Approval
       ↓
Final Registration CSV
```

The future workflow is:

```text
Official Academic Data
       ↓
Automatic Academic Evaluation
       ↓
Section + Timetable Optimization
       ↓
Advisor / HoD Approval
       ↓
One-Click Enrollment
       ↓
ERP / SIS
       ↓
Student Notification
```

The long-term philosophy is:

> **Automation by default; human review by exception.**

---

# 2. Fundamental Product Rules

## 2.1 Academic Source of Truth

APRIS will derive academic data from:

- Interim Transcript
- POS Fulfillment Report

Every future semester, the same two latest documents will be uploaded to update the existing student profile.

## 2.2 No Manual Result Entry

APRIS will not provide ordinary users with functionality to:

- Add grades
- Edit grades
- Enter marks
- Manually alter SGPA or CGPA

If a result changes officially, the latest official documents must be uploaded again.

## 2.3 Permanent Student Identity

The permanent unique student identifier will be the **Registration ID**.

Example:

```text
SE251093
```

## 2.4 AI vs Academic Rules

AI/document intelligence will be responsible for:

- reading documents
- extracting structured data
- identifying course records
- identifying POS/version
- detecting inconsistencies

Deterministic rules will be responsible for:

- prerequisite validation
- FYP eligibility
- credit-hour limits
- probation/relegation restrictions
- recommended course selection
- academic eligibility

> **AI extracts. Rules decide.**

## 2.5 Human Authority

During the initial phases, the Academic Advisor remains the final approving authority for student registration.

---

# 3. User Roles

## 3.1 Admin

Admin can:

- manage users and roles
- create programs
- upload and publish Plans of Study
- manage POS versions and variants
- manage course catalogue
- define prerequisites
- configure FYP credit-hour threshold
- create academic semesters
- upload course offering files
- configure academic-standing rules
- upload probation/relegation data
- review exception cases
- export final registration data
- view audit logs
- retry failed notifications

Admin cannot manually modify official student grades.

## 3.2 HoD

HoD can:

- view all department students
- monitor registration progress
- view advisor activity
- review advisor overrides
- view probation/relegation students
- view backlog students
- view FYP-eligible students
- view exceptions
- export department registration data
- monitor future auto-enrollment readiness

## 3.3 Academic Advisor

Advisor can:

- add a new student
- enter the student's initial home section
- upload Interim Transcript
- upload POS Fulfillment Report
- verify extracted student data
- update an existing student's academic profile
- review POS progress
- view recommended courses
- approve registration
- modify courses
- modify enrollment section
- provide mandatory override reason
- finalize registration
- view notification history

---

# 4. Student Identity and Institutional Email

The student's permanent identity key is the Registration ID.

Institutional email is automatically generated as:

```text
<RegistrationID>@dsu.edu.pk
```

Example:

```text
SE251093@dsu.edu.pk
```

The advisor should not manually type the student's institutional email.

---

# PHASE 0 — SYSTEM FOUNDATION & MASTER DATA

# 5. Authentication

Initial authentication:

- username/email
- password
- role-based access control

Initial roles:

```text
ADMIN
HOD
ADVISOR
```

The architecture must be ready for later:

- LDAP
- Active Directory
- Microsoft Entra ID
- Institutional SSO

Recommended user identity fields:

```text
user_id
username
institutional_email
role
department
auth_provider
external_identity_id
```

Possible future values:

```text
LOCAL
LDAP
ACTIVE_DIRECTORY
ENTRA_ID
```

---

# 6. Program Management

Initial programs:

- BS Software Engineering
- BS Cyber Security

The architecture must support adding future programs without code redesign.

---

# 7. Plan of Study Management

Admin uploads official POS documents.

APRIS extracts:

- Program
- POS Code
- POS Version
- POS Variant
- Semester Number
- Course Code
- Course Title
- Credit Hours
- Total Degree Credit Hours

Admin reviews the extracted POS and selects:

## `Publish POS`

Only published POS versions can be assigned to students.

Supported POS variants may include:

```text
Regular
PreMed
Minority
Minority PreMed
```

---

# 8. Course Catalogue

Each course record should contain:

```text
course_id
course_code
course_title
credit_hours
course_type
theory_or_lab
active_status
```

Recommended classifications:

- Computing Core
- Domain Core
- Mathematics
- General Education
- University Elective
- Domain Elective
- FYP
- Internship
- Deficiency
- Zero-Credit Requirement

---

# 9. Prerequisite Management

Prerequisites must be stored structurally, not as plain text.

Example:

| Course | Prerequisite | Condition |
|---|---|---|
| Object Oriented Programming | Programming Fundamentals | Must Pass |
| Data Structures | Object Oriented Programming | Must Pass |
| COAL | Digital Logic Design | Must Pass |
| Analysis of Algorithms | Data Structures | Must Pass |
| Parallel & Distributed Computing | OOP | Must Pass |
| Parallel & Distributed Computing | Operating Systems | Must Pass |

The prerequisite engine must support:

- AND rules
- OR rules
- Minimum grade in future
- Co-requisite in future
- POS/version-specific prerequisite rules

Example:

```text
PDC Eligible =
OOP Passed
AND
Operating Systems Passed
```

---

# 10. FYP Eligibility

For the first implementation:

> **FYP-I eligibility depends only on completed credit hours.**

Initial configurable value:

```text
Minimum Completed CH = 90
```

Rule:

```text
IF Completed Credit Hours >= Configured Threshold
    FYP-I = Eligible
ELSE
    FYP-I = Not Eligible
```

No named-course prerequisite will be used for FYP-I in the initial phase.

---

# PHASE 1 — STUDENT PROFILE BUILDING

# 11. Advisor Dashboard

Advisor dashboard should show:

- Total assigned students
- Profiles created
- Profiles requiring verification
- Documents missing
- Recommendations pending
- Registrations approved
- Probation students
- Relegation students
- FYP-eligible students

Primary action:

## `+ Add New Student`

---

# 12. First-Time Student Creation

On the first profile creation, the Advisor manually enters:

- **Registration ID**
- **Home/Class Section**

Example:

```text
Registration ID: SE251093
Home Section: SE-3A
```

Then uploads:

1. Interim Transcript
2. POS Fulfillment Report

---

# 13. Home Section vs Enrollment Section

APRIS must distinguish between two concepts.

## 13.1 Home Section

Student-level attribute.

Example:

```text
SE-3A
```

Stored against the student profile.

## 13.2 Enrollment Section

Course-level attribute.

A student whose home section is `SE-3A` may still take a backlog course in another section.

Example:

```text
Data Structures      → SE-3A
Computer Networks    → SE-3A
Discrete Structures  → SE-1B
```

Therefore:

> **Student Home Section ≠ Course Enrollment Section**

They may often match, but they must be stored independently.

---

# 14. Transcript Extraction

APRIS should extract:

### Student Identity

- Registration ID
- Student Name
- Father's Name
- Program
- Admission Semester
- Admission Year
- Program Status

### Academic Data

- Semester
- Course Code
- Course Title
- Grade
- Grade Point
- Credit Hours
- Grade Points Earned
- SGPA
- CGPA
- Completed Credit Hours
- Degree Required Credit Hours

---

# 15. POS Fulfillment Report Extraction

APRIS should extract:

- Registration ID
- Student Name
- Program
- POS Code
- POS Version
- POS Variant
- PreMed status
- Minority status
- semester-wise courses
- completed requirements
- pending requirements
- completed credit hours
- degree required credit hours

---

# 16. Cross-Document Validation

Before creating the profile:

```text
Entered Registration ID
=
Transcript Registration ID
=
Fulfillment Report Registration ID
```

Also:

```text
Transcript Program
=
Fulfillment Report Program
```

Mismatch should create:

> **Document Conflict — Advisor Review Required**

---

# 17. Extraction Confidence

Each extracted field should internally retain:

```text
value
confidence
source_document
source_page
extraction_timestamp
```

Low-confidence values should be highlighted for verification.

---

# 18. Advisor Verification

APRIS displays:

```text
Registration ID
Student Name
Father Name
Program
Admission Batch
POS
POS Variant
Home Section
CGPA
Completed CH
Required CH
```

Advisor reviews and selects:

## `Confirm & Create Profile`

Metadata extraction may be corrected where necessary, but official grades cannot be manually changed.

---

# 19. Student Academic Profile

Recommended tabs:

1. Overview
2. Academic History
3. POS Progress
4. Registration
5. Documents
6. Academic Standing
7. FYP Status
8. Notifications
9. Audit Trail

---

# 20. POS Progress Visualization

Suggested statuses:

| Status | Meaning |
|---|---|
| Completed | Passed |
| Failed | Failed |
| Pending | Due/Backlog |
| Recommended | Proposed for next semester |
| Future | Not yet due |
| Blocked | Missing prerequisite |
| Not Offered | Academically due but not offered |
| Advisor Deferred | Manually removed |

---

# PHASE 2 — COURSE OFFERING IMPORT

# 21. Semester Setup

Admin creates academic semesters such as:

```text
Fall 2026
Spring 2027
Fall 2027
```

One semester is designated as the active registration cycle.

---

# 22. Course Offering Upload

Admin uploads a course offering workbook similar to the Fall 2026 IT Registration Sheet.

The workbook may contain sheets such as:

```text
SE-3
SE-5
SE-7
CYS-3
CYS-5
CYS-7
```

Each offering should be normalized to:

| CBA Code | Course Code | Class & Section | Course Name |
|---|---|---|---|

---

# 23. Course Offering Validation and Normalization

The importer must not blindly trust spreadsheet column order.

APRIS should detect whether a cell resembles:

### Section

```text
SE-3A
SE-5B
CYS-3A
```

### Course Code

```text
CS-2007
SE-3801
CYS-3001
```

If fields appear swapped, APRIS should normalize them and show Admin:

> **Rows normalized automatically — please review before publishing.**

---

# 24. Course Offering Entity

Each offered course instance should become a structured record:

```text
CourseOffering
├── Semester
├── Program
├── Course Code
├── Course Name
├── CBA Code
├── Class Section
└── Active Status
```

Example:

```text
Semester: Fall 2026
Course: CS-2007
Course Name: Data Structures & Algorithms
Section: SE-3A
CBA Code: 17343
```

---

# 25. CBA Code

CBA Code should be treated as the identifier of the offered course instance.

Example:

```text
CS-2007 + SE-3A + CBA 17343
```

is distinct from:

```text
CS-2007 + SE-3B + another CBA
```

Future ERP enrollment can therefore be expressed as:

```text
Student Registration ID + CBA Code = Enrollment
```

---

# PHASE 3 — REGISTRATION RECOMMENDATION ENGINE

# 26. Recommendation Workflow

For each student:

```text
Latest Verified Academic Profile
        ↓
Identify Active POS
        ↓
Identify Completed Courses
        ↓
Identify Failed / Pending Courses
        ↓
Identify Backlog
        ↓
Identify Upcoming POS Courses
        ↓
Check Prerequisites
        ↓
Check FYP CH Rule
        ↓
Check Probation / Relegation
        ↓
Apply Credit-Hour Limit
        ↓
Check Active Semester Course Offerings
        ↓
Suggest Appropriate Section
        ↓
Generate Registration Recommendation
```

---

# 27. Course Prioritization

Default recommendation priority:

### Priority 1
Failed or pending compulsory courses

### Priority 2
Courses that unlock future prerequisite chains

### Priority 3
Regular POS courses

### Priority 4
Required electives

### Priority 5
Future-semester/overload courses where permitted

---

# 28. Explainable Recommendations

Every recommendation must state why.

Examples:

> **Data Structures — Recommended**  
> POS requirement; OOP prerequisite completed.

> **Analysis of Algorithms — Blocked**  
> Data Structures prerequisite incomplete.

> **FYP-I — Not Eligible**  
> 84 of 90 required credit hours completed.

> **Software Quality Engineering — Not Offered**  
> Academically due but not available in Fall 2026.

---

# 29. Section Selection — Initial Logic

## Rule 1 — Regular POS Course

Prefer the student's Home Section.

Example:

```text
Student Home Section: SE-3A

CS-2007 Offerings:
SE-3A
SE-3B
SE-3C

Recommended Section:
SE-3A
```

## Rule 2 — Home Section Unavailable

Show available sections to Advisor.

## Rule 3 — Backlog Course

Do not force Home Section.

List available offered sections and allow Advisor to choose.

## Rule 4 — Special POS Variant

Where an offering corresponds to PreMed/minority-specific curriculum, match using:

- POS variant
- academic requirement
- offered section

---

# 30. Advisor Review Screen

Example:

| Course | CBA Code | Section | CH | Reason | Action |
|---|---:|---|---:|---|---|
| CS-2007 | 17343 | SE-3A | 3 | POS | Approve |
| CS-2007L | 17347 | SE-3A | 1 | POS | Approve |
| CS-2201 | 17350 | SE-3A | 3 | POS | Approve |
| CS-2201L | 17355 | SE-3A | 1 | POS | Approve |
| CS-2801 | 17358 | SE-3A | 3 | POS | Approve |

Advisor can:

- Approve All
- Add Course
- Remove Course
- Change Course
- Change Section
- Save Draft
- Finalize Registration

---

# 31. Advisor Override

Any deviation from the recommendation requires a mandatory reason.

Example reasons:

- Section full
- Backlog priority
- Course deferred
- Offering unavailable
- Student-specific academic advice
- HoD approval

Every override must be audited.

---

# PHASE 4 — FINAL REGISTRATION CSV

# 32. Final Export Structure

The final export is a **course-enrollment CSV**.

Each student-course enrollment generates one row.

Required columns:

```text
Student Registration ID
CBA Code
Course Code
Class & Section
Course Name
```

Example:

```csv
Student Registration ID,CBA Code,Course Code,Class & Section,Course Name
SE251093,17343,CS-2007,SE-3A,Data Structures & Algorithms
SE251093,17347,CS-2007L,SE-3A,Data Structures & Algorithms Lab
SE251093,17350,CS-2201,SE-3A,Computer Networks
SE251093,17355,CS-2201L,SE-3A,Computer Networks Lab
SE251093,17358,CS-2801,SE-3A,Software Engineering
```

If one student is enrolled in six courses:

> **The same Student Registration ID appears in six rows.**

This is a locked requirement.

---

# 33. Registration States

Supported statuses:

```text
Not Started
Documents Uploaded
Extraction In Progress
Verification Required
Profile Ready
Recommendation Generated
Advisor Review
Approved
Modified
Finalized
Exported
```

Future:

```text
Enrollment Ready
Enrolled
Enrollment Failed
```

---

# PHASE 5 — REGISTRATION VERSIONING & STUDENT EMAILS

# 34. Registration Versioning

Every committed enrollment change creates a new registration version.

Example:

```text
Fall 2026

Version 1 — Initial registration
Version 2 — Discrete Structures added
Version 3 — DSA section changed
```

Each version stores:

- previous course set
- new course set
- course changes
- section changes
- user
- reason
- timestamp
- notification status

Draft edits do not create committed versions.

---

# 35. Student Email Notifications

Every committed enrollment action or enrollment change must generate an email to:

```text
<RegistrationID>@dsu.edu.pk
```

Events include:

- initial enrollment finalized
- course added
- course removed
- course replaced
- section changed
- credit hours changed
- registration cancelled/reversed
- future one-click enrollment completed

---

# 36. Email Content

Each notification should contain:

- Student Name
- Registration ID
- Semester
- Date/time
- Change summary
- Added courses
- Removed courses
- Section changes
- Current registered courses
- Current total registered CH
- Registration status

Section change example:

```text
Course: Data Structures & Algorithms
Previous Section: SE-3A
New Section: SE-3B
```

---

# 37. Notification Processing

Notifications must be asynchronous.

```text
Registration Committed
        ↓
EnrollmentChanged Event
        ↓
Notification Queue
        ↓
Email Worker
        ↓
DSU Mail Infrastructure
        ↓
Student Email
```

Email failure must not roll back registration.

---

# 38. Notification States

Minimum:

```text
Queued
Sent
Failed
Retrying
```

Future:

```text
Delivered
Bounced
```

Admin must be able to retry failed messages.

---

# 39. Duplicate Notification Prevention

Use an idempotency key such as:

```text
student_id
+
semester_id
+
registration_version
+
event_type
```

Repeated actions must not create duplicate emails.

---

# PHASE 6 — FUTURE SEMESTER PROFILE UPDATES

# 40. Updating Existing Students

In every future semester:

1. Advisor searches student.
2. Uploads latest Interim Transcript.
3. Uploads latest POS Fulfillment Report.
4. APRIS recognizes the existing Registration ID.
5. APRIS creates a new academic snapshot.
6. APRIS updates the student's current academic profile.
7. APRIS generates the next semester recommendation.

No manual result update occurs inside APRIS.

---

# 41. Academic Snapshot History

Each update creates:

```text
Student
├── Snapshot 1
├── Snapshot 2
├── Snapshot 3
└── Latest Active Snapshot
```

Each snapshot stores:

- source documents
- CGPA
- SGPA if available
- completed CH
- remaining CH
- completed courses
- failed courses
- pending courses
- academic standing
- POS completion state
- extraction timestamp
- validating advisor

---

# 42. Future Home Section Update

For the initial future-semester workflow:

APRIS displays:

```text
Previous Home Section: SE-3A
```

Advisor confirms/selects:

```text
Current Home Section: SE-5A
```

APRIS should not automatically assume semester progression until DSU's section-promotion policy is clearly defined.

---

# PHASE 7 — TIMETABLE & ADVANCED SECTION ALLOCATION

# 43. Future Section Capacity

Each course offering may include:

```text
Section
Capacity
Currently Enrolled
Available Seats
```

---

# 44. Future Timetable Data

Each offering may include:

```text
Days
Start Time
End Time
Room
Faculty
```

---

# 45. Future Section Allocation Logic

Section recommendation can then use:

```text
Academic Eligibility
+
Home Section Preference
+
No Timetable Clash
+
Available Seat
=
Recommended Enrollment Section
```

Suggested priority:

1. Home Section
2. Compatible section with same section letter
3. Any clash-free available section
4. Advisor review

---

# PHASE 8 — LDAP / ACTIVE DIRECTORY

Future login flow:

```text
DSU Credentials
      ↓
LDAP / AD Authentication
      ↓
APRIS User Mapping
      ↓
Role Resolution
      ↓
Dashboard
```

This should not require rewriting academic business logic.

---

# PHASE 9 — ONE-CLICK ERP ENROLLMENT

Once APRIS is integrated with the institutional ERP/SIS:

Advisor sees:

## `Approve & Enroll`

APRIS sends enrollment data using:

```text
Student Registration ID
+
CBA Code
```

for every approved course.

---

# PHASE 10 — BULK AUTO-ENROLLMENT

Future HoD dashboard:

```text
Total Students             704
Enrollment Ready           581
Advisor Review Required     83
Exceptions                  27
Data Issues                 13
```

Action:

## `Auto-Enroll Eligible Students`

---

# 46. Future Auto-Enrollment Validation

Before enrollment:

```text
Student Profile Valid?       ✓
Latest Documents Verified?   ✓
POS Valid?                   ✓
Course Required?             ✓
Prerequisite Satisfied?      ✓
FYP Rule Satisfied?          ✓
Credit Limit Satisfied?      ✓
Course Offered?              ✓
Valid CBA Code?              ✓
Section Assigned?            ✓
Seat Available?              ✓
No Timetable Clash?          ✓
No Academic Hold?            ✓
```

Only then:

> **Enrollment Ready**

---

# 47. Partial Failure Handling

Bulk enrollment must be processed per student.

Example:

```text
581 attempted
569 successful
12 failed
```

Failures must identify reasons.

Example:

| Student | Result | Reason |
|---|---|---|
| SE251091 | Failed | Section full |
| SE251115 | Failed | ERP timeout |
| SE241228 | Failed | Administrative hold |

Action:

## `Retry Failed Enrollments`

---

# 48. HoD Dashboard

Initial dashboard metrics:

### Registration

- Total Students
- Profiles Created
- Profiles Updated
- Missing Documents
- Recommendations Generated
- Advisor Approved
- Advisor Modified
- Pending Review
- Finalized
- Exported

### Academic

- Normal Students
- Probation Students
- Relegation Students
- Students with Backlogs
- Students with Failed Courses
- FYP Eligible
- FYP Not Eligible

### Exceptions

- Document Mismatches
- Unknown POS
- Unknown Course Codes
- Low-Confidence Extractions
- Missing Offerings
- Advisor Overrides

Future additions:

- Section capacity
- Course demand
- Timetable conflicts
- Auto-enrollment readiness
- Enrollment failures

---

# 49. Advisor Dashboard

Advisor sees only assigned students.

Suggested metrics:

- Total Advisees
- Profiles Ready
- Documents Missing
- Verification Required
- Recommendations Ready
- Pending Approval
- Approved
- Probation
- Relegation
- FYP Eligible

---

# 50. Probation & Relegation

Admin can upload official CSV/Excel data containing:

```text
Registration Number
Academic Standing
Effective Semester
Remarks
```

Supported statuses may include:

```text
Normal
Probation
Relegation
Frozen
Inactive
Withdrawn
Graduated
```

Academic-standing credit limits should be configurable.

---

# 51. Audit Trail

APRIS must record:

```text
Who
did What
for Which Student
When
Previous State
New State
Reason
```

Audit events include:

- document uploads
- extraction corrections
- POS assignments
- recommendation generation
- advisor overrides
- section changes
- registration approvals
- registration finalization
- CSV export
- notification attempts
- future enrollment attempts

---

# 52. Exception Queue

Cases requiring human review include:

- transcript/POS mismatch
- unknown POS
- unknown course
- low-confidence extraction
- duplicate records
- transfer courses
- exemptions
- POS migration
- semester freeze
- course equivalency
- missing pages
- conflicting academic data

Example:

| Student | Exception | Severity | Owner | Status |
|---|---|---|---|---|
| SE251093 | POS mismatch | High | Admin | Open |
| CS241121 | Unknown course | Medium | Advisor | Review |

---

# 53. Recommended Technology Stack

| Layer | Recommendation |
|---|---|
| Frontend | Next.js |
| UI | React + TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Backend | Python FastAPI |
| Database | PostgreSQL |
| ORM | SQLAlchemy |
| Migrations | Alembic |
| Async Jobs | Celery |
| Queue | Redis |
| File Storage | S3-compatible / MinIO |
| Document Intelligence | Structured document/vision extraction |
| CSV Processing | Python/Pandas |
| Authentication | Local RBAC → LDAP/AD later |
| API Docs | OpenAPI/Swagger |
| Deployment | Docker |
| Reverse Proxy | Nginx |
| Monitoring | Sentry or equivalent |
| Source Control | GitHub/GitLab |

---

# 54. Recommended Architecture

```text
                         WEB CLIENT
                    Next.js / TypeScript
                            │
                            ▼
                        API LAYER
                         FastAPI
                            │
       ┌────────────────────┼─────────────────────┐
       │                    │                     │
       ▼                    ▼                     ▼
 Student Service     Curriculum Service     Registration Service
       │                    │                     │
       └──────────────┬─────┴─────────┬───────────┘
                      │               │
                      ▼               ▼
            Academic Profile      Rules Engine
                 Engine
                      │               │
                      └───────┬───────┘
                              ▼
                     Recommendation Engine
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
         PostgreSQL      File Storage       Job Queue
                                            Redis/Celery
                                                 │
                                                 ▼
                                       Notification Service
```

Future integration layer:

```text
APRIS Integration Layer
├── ERP / SIS
├── Examination
├── LDAP / AD
├── Finance
├── LMS
└── Student Portal
```

---

# 55. Core Database Entities

```text
User
Role
Advisor
Student
Program
PlanOfStudy
POSVariant
POSCourse
Course
CoursePrerequisite
AcademicSemester
CourseOffering
StudentDocument
AcademicSnapshot
StudentCourseHistory
AcademicStanding
Registration
RegistrationCourse
RegistrationVersion
AdvisorOverride
Notification
AuditLog
Exception
```

---

# 56. Core Section Data Model

## Student

```text
student_id
registration_id
program
pos
home_section
advisor
```

## Course Offering

```text
offering_id
semester
course
cba_code
class_section
active_status
```

## Registration Course

```text
student
course
course_offering
cba_code
enrollment_section
recommendation_reason
advisor_decision
override_reason
```

---

# 57. Non-Functional Requirements

## Performance

Target initial capacity:

- 1,000–10,000 students
- 100+ concurrent users
- common pages load in approximately 2 seconds under normal conditions
- document extraction processed asynchronously
- large CSV export supported

## Reliability

- retryable extraction jobs
- retryable notification jobs
- transactional registration writes
- duplicate request protection
- idempotent background jobs

## Security

- HTTPS
- secure password hashing
- role-based access
- least privilege
- private document URLs
- audit logs
- session expiry
- input validation
- secure backups

## Scalability

Architecture must support future computing programs without redesign.

---

# 58. Success Metrics

### Efficiency

- Average registration-processing time per student
- Percentage of students processed automatically
- Reduction in manual advisor work
- Reduction in Excel dependency

### Accuracy

- Document extraction accuracy
- Advisor correction rate
- Prerequisite violations prevented
- Incorrect registrations prevented

### Automation

- Recommendation acceptance rate
- Advisor override rate
- Percentage registrations finalized digitally
- Future percentage auto-enrolled

### Operations

- Unresolved exception count
- Registration completion percentage
- Notification delivery rate
- Average advisor turnaround time

---

# 59. Phase-Wise Delivery Roadmap

| Phase | Deliverable |
|---|---|
| **Phase 0** | Authentication, roles, programs, POS, courses, prerequisites, FYP rule |
| **Phase 1** | Student profile creation from transcript + fulfillment report; advisor enters initial Home Section |
| **Phase 2** | Course-offering workbook import, validation and normalization |
| **Phase 3** | Registration recommendation + section recommendation + advisor approval/change |
| **Phase 4** | Final row-per-course CSV export |
| **Phase 5** | Registration versioning + mandatory student email notifications |
| **Phase 6** | Future-semester profile updates from the same two official documents |
| **Phase 7** | Timetable, seat capacity and advanced section allocation |
| **Phase 8** | LDAP / Active Directory / SSO |
| **Phase 9** | One-click ERP enrollment |
| **Phase 10** | HoD-level bulk auto-enrollment and exception-only processing |

---

# 60. Locked Product Decisions

1. APRIS will not be a manual result-entry system.
2. Interim Transcript and POS Fulfillment Report remain the source of truth.
3. The same two documents will update the existing student profile in future semesters.
4. Registration ID is the permanent student identity.
5. Advisor enters the student's initial Home Section during first profile creation.
6. Student Home Section and Course Enrollment Section are separate concepts.
7. Admin manages POS, prerequisites, course offerings, FYP rule and academic-standing inputs.
8. FYP-I initially depends only on a configurable completed-credit-hour threshold.
9. AI extracts information; deterministic rules make academic decisions.
10. Advisors receive system-generated semester registration recommendations.
11. Advisors may change course or section, but every override requires a reason.
12. Every committed enrollment change triggers student email notification.
13. Student email format is `<RegistrationID>@dsu.edu.pk`.
14. Final CSV contains one row per student-course enrollment.
15. Student Registration ID is repeated in every row belonging to that student.
16. CBA Code is retained as the offered-course identifier.
17. Course-offering spreadsheets must be validated and normalized before publishing.
18. LDAP/AD will be added later, but the authentication architecture must support it from Version 1.
19. Timetable and seat capacity will later support automatic section allocation.
20. The architecture must support future one-click and bulk auto-enrollment.
21. Long-term operating model: **automation by default, human review by exception**.

---

# 61. Final Product Definition

APRIS is an **Academic Progression Intelligence and Enrollment Orchestration System**.

It converts official academic records into a structured student profile, applies curriculum and institutional rules, recommends appropriate courses and sections, supports advisor approval, records every registration decision, notifies students of committed enrollment changes, exports final registration data in a downstream-compatible CSV format, and evolves toward direct one-click and bulk ERP enrollment.

The Fall 2026 implementation solves the immediate registration problem while preserving a clear path toward a fully integrated academic automation platform.
