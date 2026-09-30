# APRIS — Advisor Guide

For academic advisors registering students each semester. Read time: about 10 minutes.

**What APRIS does for you:** you upload each student's two official documents; APRIS reads them, works out what the student still needs, suggests courses and sections with reasons, and produces the enrollment file. **You stay the decision-maker** — you review, change and approve every registration.

**What APRIS will never let you do:** type in or edit grades or credit hours, or delete a student profile. Results come only from the official documents.

---

## 1. Signing in

1. Open the APRIS address your Admin gave you and sign in with your username.
2. On first login you must **change your temporary password** (12+ characters). Do not share it.
3. To change it later, click your name at the top right.
4. Sign out when you leave your desk. Everything you do — logins, viewing a student, saving, finalizing — is recorded with your name.

## 2. The semester phases (what you can do when)

The current phase is shown on the Students page and the dashboard.

| Phase | What it means for you |
|---|---|
| **Setup (not open yet)** | You can look at suggestions, but you cannot save or finalize registrations. Wait for the Admin to open registrations. |
| **Registration** | Register students normally. |
| **Add / Drop** | Change already-finalized registrations (add, drop, change section). Every change needs a reason and creates a new version. |
| **Closed** | Locked. Only an Admin can make a (flagged) late change. |

If the page says the semester "isn't open for registration yet", course offerings haven't been uploaded — tell your Admin.

## 3. Adding a new student

1. **Students → + Add New Student.**
2. Upload the two official PDFs, **downloaded fresh from the university system**:
   - **Interim Transcript**
   - **Plan of Study Fulfillment Report**
3. Click **Upload & extract**. APRIS reads the Registration ID, name, program, POS and every grade from the documents — you do not type them.
4. On the **Verify extracted data** screen, check:
   - Registration ID, program, POS, CGPA and completed credit hours against the documents.
   - The course table (grades look right?).
5. You may correct the **name** or **father's name** if extraction misread them, and enter the **home section** (e.g. `SE-3A`) — or leave it and set it later.
6. Click **Confirm & create profile**.

### If you see a red "Document conflict"
APRIS found something inconsistent and will not create the profile. Typical causes:

| Message | What to do |
|---|---|
| Transcript Registration ID ≠ fulfillment report | The two PDFs belong to different students. Download the correct pair. |
| Completed CH differs between the documents | One document is out of date. Download both again. |
| Unknown POS / POS not published | Tell your Admin — the Plan of Study needs to be added or published. |
| This student is assigned to another advisor | You can't update another advisor's student. Ask your Admin. |
| Student is archived | Ask your Admin to restore the profile. |

Yellow warnings (for example a name spelled slightly differently) don't block you — read them, then decide.

## 4. The student page

Open a student from **Students** (search by Registration ID or name). Tabs:

- **Overview** — home section, CGPA, completed credit hours, FYP-I status (eligible at the configured credit-hour threshold), edit name / home section, and upload updated documents.
- **Academic history** — every term and grade.
- **POS progress** — each Plan of Study course as completed, failed, pending or future.
- **Registration** — where you register (next section).
- **Documents** — the uploaded PDFs. Opening one is logged.
- **Audit trail** — everything done to this student's record.

### Home section
The student's own class section (e.g. `SE-3A`). It tells APRIS which semester the student is in and which section to suggest. Set it on **Overview → Home section**. APRIS does not assume it moves up automatically each semester — **confirm it every semester.** It is *not* the same as the section of an individual course (a student can take a backlog course in another section).

## 5. Registering a student

Go to the student's **Registration** tab (or use **Register / Add / Drop** in the Students list).

### Read the table
| Column | Meaning |
|---|---|
| **Course** | Code, semester in the Plan of Study, and "backlog" if it should have been taken earlier. |
| **Status / reason** | *Recommended* (with the reason, e.g. "POS semester 3 requirement — home section SE-3A"), *Elective choice*, *Optional*, or *Deferred by load*. |
| **Section · CBA** | The offered section and its CBA code. Change the section here if needed. |
| **Advisor reason** | Only appears when you deviate (see below). |

Courses APRIS **cannot** register appear under **"Not registrable now"** with the reason — for example *prerequisite incomplete*, *FYP-I not eligible (84 of 90 credit hours)*, or *not offered this semester*.

### Steps
1. Review the suggestions. If the student has a home section, **Approve all recommended** ticks everything with a suggested section. If not (or to use another section), pick one from **Set section for all courses…** — it selects that section for every course offered in it — or choose sections row by row. A course's tick box stays greyed out until it has a section.
2. **Backlog courses** have no automatic section: choose one from the offered sections (it may be another program's section — that is allowed).
3. **Electives** are slots: choose which offered elective the student takes.
4. **Labs always follow their theory course.** When you change a theory course's section, its lab moves to the same section automatically, and they tick together. If the lab isn't offered in that section, pick a different section.
5. Watch the **credit-hour counter**: normal load is up to 18 CH, minimum 12 CH, and never more than 21 CH.
6. Click **Save draft**, then **Approve & finalize registration** (the approve button is enabled once the draft is saved).

### When a reason is required
APRIS makes you explain any deviation, so the record shows why:
- You changed a suggested section, added a course that wasn't suggested, or picked a course that isn't normally allowed → a reason on that row.
- You **did not** register a course APRIS recommended → a reason ("Why not registered?").
- Total above 18 CH → the **overload approval reference** (never above 21 CH).
- Total below 12 CH → the reason.

If you forget one, the message tells you exactly which course needs it.

### Approving (finalizing)
Approving creates **Version 1** of the registration and puts it in the export file. It is refused if a chosen course's offering is missing its **CBA code or section** — that is a data problem for the Admin, who can fix it; you'll see a red note on that row.

### Probation and relegation students (manual)
For now these students are registered **manually**. APRIS shows a "Manual registration" notice and suggests nothing automatically. Choose the courses yourself, then enter one **approval reference** (e.g. "HoD decision 12 Oct") before saving. It is recorded against every course and listed for the HoD's review. The 21 CH ceiling still applies.

## 6. Add / Drop (changing a finalized registration)

While the semester is in the **Add / Drop** phase:
1. Open the student's **Registration** tab.
2. **Tick** a course to add it, **untick** it to drop it, or change its section (labs move with theory).
3. Give the reason where asked, **Save draft**, then enter the **reason for this add / drop** and click **Commit add / drop**.

Each commit creates a new **version** (v2, v3, …) showing what was added, removed or moved — nothing is overwritten. If the add/drop window has closed, ask an Admin.

## 7. A new semester for existing students

Before registering for a new semester, refresh each student:
1. Student → **Overview → Update profile for a new semester.**
2. Upload the **latest** Interim Transcript and POS Fulfillment Report.
3. Verify, confirm the **home section**, and **Confirm & update profile.**

Previous snapshots are kept. If you register before refreshing, APRIS warns that the documents pre-date the semester.

## 8. Common questions

| Question | Answer |
|---|---|
| A grade is wrong | You can't edit it. If the university corrected it, upload the latest documents. |
| I made a mistake creating a student | Ask the Admin. Advisors can't delete or archive profiles. |
| A course is "Not offered" | It isn't in this semester's offerings. For a backlog it may show sections from another program — you may choose one. |
| Why is FYP-I unavailable? | The student hasn't reached the required completed credit hours (shown in the reason). |
| Why is a course "Blocked"? | A prerequisite hasn't been passed (a D counts as a pass; F, W and I do not). |
| I need a course APRIS won't suggest | Use **+ Add another course…** and give a reason. |
| Who can see what I did? | Your Admin and HoD, through the audit log. |

## 9. Good practice
- Always use freshly downloaded documents.
- Check the verify screen — APRIS reads the documents accurately, but you are the final check.
- Write reasons another person could understand later.
- Never share your password; sign out on shared computers.

Problems or wrong suggestions: tell your Admin with the student's Registration ID and a screenshot. **Never include a student's documents in an email or chat message.**
