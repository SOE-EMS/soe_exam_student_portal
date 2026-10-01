Below is the **final phase-wise project description for Antigravity IDE**. It incorporates your latest rule: **only students whose Enrollment Number already exists in Admin data can register**. The original examination workflow and business rules are retained. 

# 🎓 HALL TICKET & EXAMINATION MANAGEMENT SYSTEM

## Final Antigravity IDE Project Specification

### Technology

```text
Frontend       : HTML5 + CSS3 + JavaScript + Bootstrap 5
Backend        : Node.js + Express.js
Database       : Neon PostgreSQL
ORM            : Prisma
Excel          : ExcelJS / XLSX
PDF            : PDFKit
Image          : Sharp
Authentication : Secure session-based authentication
Security       : Helmet + Rate Limiting + Zod + RBAC
Deployment     : Vercel
Repository     : GitHub
```

---

# PHASE 0 — REQUIREMENTS & SYSTEM ARCHITECTURE

### Objective

Before coding, understand the complete examination workflow and design the application architecture.

### Create

* System architecture
* Database ER structure
* API architecture
* Authentication architecture
* Admin workflow
* Student workflow
* Excel processing architecture
* Eligibility engine design
* Seating engine design
* Hall Ticket generation design
* Block Report generation design
* Security architecture
* Vercel deployment architecture

### Important

Do **not** start by generating the whole application.

Build the system phase-by-phase.

---

# PHASE 1 — PROJECT SETUP

Create the Node.js + Express project.

### Install/configure

```text
Node.js
Express.js
Prisma
PostgreSQL driver
Bootstrap
ExcelJS
PDFKit
Sharp
bcrypt
Helmet
express-rate-limit
Zod
```

### Configure

```text
.env
.env.example
.gitignore
package.json
Prisma
Vercel
```

### Environment variables

```text
DATABASE_URL
DIRECT_URL
SESSION_SECRET
NODE_ENV
```

Never hard-code secrets.

### Test

* Express starts
* Prisma connects
* Neon connection works
* Environment variables work
* Application runs locally

---

# PHASE 2 — DATABASE DESIGN

Create the PostgreSQL schema using Prisma.

### Core models

```text
User
StudentProfile
AcademicYear
Exam
ExamSemester
ExamStudentData
ExamSchedule
StudentExamSubject
SeatingArrangement
BlockAssignment
EligibilityCriteria
Eligibility
HallTicketSettings
AuditLog
```

### Critical relationship

```text
Admin Exam Data
      ↓
Enrollment Number
      ↓
Student Profile
      ↓
Student Account
```

### Critical rule

```text
Student.enrollmentNumber = UNIQUE
```

Never create duplicate student records.

The original specification requires Enrollment Number to be the unique student identifier. 

---

# PHASE 3 — AUTHENTICATION & ACCESS CONTROL

Create secure authentication.

## Admin

```text
Admin Login
     ↓
Admin Dashboard
```

## Student

Students cannot freely register.

### Mandatory registration process

```text
Enter Enrollment Number
          ↓
Backend checks Admin Data
          ↓
Enrollment exists?
     ┌────┴────┐
    NO        YES
     ↓          ↓
 Reject      Check Account
                ↓
          Already exists?
          ┌────┴────┐
         YES        NO
          ↓          ↓
       Login/      Register
       Recovery       ↓
                  Upload Photo
                      ↓
                  Password
                      ↓
                Create Account
```

### Registration rule

**Only Enrollment Numbers already present in Admin examination data can register.**

If:

```text
24CE001
```

does not exist in Admin data:

```text
Registration Denied
```

If it exists:

```text
Registration Allowed
```

### Student identity data

The following must come from Admin data:

```text
Name
Enrollment
Program
Semester
Division
Academic information
```

Student should not be able to change these during registration.

Student provides:

```text
Password
Photo
```

### Security

Implement:

* bcrypt password hashing
* secure sessions
* HttpOnly cookies
* Secure cookies in production
* SameSite
* session expiry
* logout
* login rate limiting
* brute-force protection
* password reset

Students must never access Admin APIs.

---

# PHASE 4 — ADMIN DASHBOARD

Create a professional institutional dashboard.

### Dashboard cards

```text
Total Students
Total Exams
Eligible Students
Not Eligible Students
Total Blocks
Hall Tickets Generated
Block Reports Generated
```

### Quick actions

```text
Create Exam
Upload Exam Data
Seating Arrangement
Eligibility Analysis
Generate Hall Tickets
Generate Block Report
```

---

# PHASE 5 — ACADEMIC YEAR & EXAM MANAGEMENT

Admin can create:

```text
Exam Name
Academic Year
Applicable Semesters
```

Example:

```text
Exam:
1st Internal Examination

Academic Year:
2026-27

Semesters:
1, 3, 5, 7
```

### Functions

```text
Create
View
Edit
Activate
Deactivate
```

Every examination gets a unique ID.

All examination-specific data must be associated with that examination. 

---

# PHASE 6 — SAMPLE EXCEL GENERATION

Create a **Download Sample Excel** function.

### Required columns

```text
Sr No
Academic Year
Semester
Program
Enrollment
Name
Division
Exam Date columns
Attendance %
Fees Status
```

Example:

```text
Sr No
Academic Year
Semester
Program
Enrollment
Name
Division
15-09-2026
17-09-2026
19-09-2026
Attendance %
Fees Status
```

Create an additional **Instructions** sheet.

The system must dynamically detect examination-date columns rather than hard-coding dates. 

---

# PHASE 7 — EXCEL UPLOAD & VALIDATION

Admin uploads examination data.

### System must validate

```text
File extension
MIME type
File size
Workbook structure
Required columns
Data types
Enrollment
Dates
Duplicate rows
```

Reject invalid uploads.

Do not execute macros/VBA.

### Dynamic date detection

If Excel contains:

```text
15-09-2026 → SOECE2030
17-09-2026 → SOECE2040
19-09-2026 → SOEMAT2030
```

the system automatically creates the relevant schedule/subject relationships.

---

# PHASE 8 — SMART EXCEL UPDATE / UPSERT

This is a **critical business rule**.

### Existing Enrollment

```text
Enrollment exists
       ↓
UPDATE existing record
```

### New Enrollment

```text
Enrollment does not exist
       ↓
CREATE record
```

### Blank field

```text
Excel field = blank
       ↓
DO NOT overwrite database
       ↓
Keep previous value
```

Example:

```text
OLD:
Name = Rahul Patel
Division = G1D1
Attendance = 72
Fees = Paid

NEW:
Name = blank
Division = G1D2
Attendance = 78
Fees = blank

RESULT:
Name = Rahul Patel
Division = G1D2
Attendance = 78
Fees = Paid
```

### Preview before commit

Display:

```text
New Records
Updated Records
Unchanged Records
Invalid Records
Duplicate Enrollments
Validation Errors
```

Then:

```text
Cancel
Confirm Upload
```

Use a PostgreSQL transaction.

If the upload fails:

```text
ROLLBACK EVERYTHING
```

No partial update. 

---

# PHASE 9 — EXAM DATA MANAGEMENT

Create a powerful Admin data table.

### Features

```text
Search
Sort
Filter
Edit
Pagination
```

### Filters

```text
Semester
Program
Division
Enrollment
Subject
Exam Date
Eligibility
```

Example:

```text
Semester = 3
Program = SOE
Date = 15-09-2026
Subject = SOECE2030
```

Only matching students should appear.

---

# PHASE 10 — SEATING ARRANGEMENT

Admin uploads seating configuration.

### Excel columns

```text
Block No
Classroom
From Enrollment
To Enrollment
Block Count
```

Example:

```text
1 | C-101 | 24CE001 | 24CE039 | 39
2 | C-102 | 24CE040 | 24CE078 | 39
```

### Validate

```text
Invalid range
Overlapping ranges
Duplicate block
Missing classroom
Invalid enrollment
Incorrect block count
```

Enrollment numbers do not need to be numerically continuous.

The system must identify actual students whose enrollment numbers fall within the configured range. 

---

# PHASE 11 — BLOCK ASSIGNMENT

Build a reusable block assignment engine.

Input:

```text
Exam
Student
Subject
Seating Arrangement
```

Output:

```text
Block Number
Classroom
```

This same assignment must be usable by:

* Hall Ticket
* Block Label
* Block Report

---

# PHASE 12 — BLOCK LABEL

Generate printable Block Labels.

### Include

```text
Examination
Academic Year
Block Number
Classroom
Division
Exam Date
Exam Time
Subject Code
Block Count
```

### Do NOT include

```text
Student Name
Enrollment Number
Student List
```

The Block Label is intended to be displayed outside the classroom. 

---

# PHASE 13 — ELIGIBILITY CRITERIA

Admin configures:

```text
Attendance >= X%
Fees = Paid/Unpaid
```

Example:

```text
Attendance >= 68%
Fees = Paid
```

Store criteria against each examination.

---

# PHASE 14 — ELIGIBILITY ANALYSIS

Create a preview-only analysis page.

### Semester selection

```text
☐ Semester 1
☐ Semester 3
☐ Semester 5
☐ Semester 7
```

### Program selection

```text
☐ SOE
☐ IDS
☐ ICA
```

### Criteria

```text
Attendance >= X%
Fees = Paid/Unpaid
```

Display counts:

```text
Semester | SOE | IDS | ICA | Total
------------------------------------
Sem 1    | 320 | 85  | 42  | 447
Sem 3    | 410 | 96  | 55  | 561
Sem 5    | 385 | 78  | 48  | 511
Sem 7    | 350 | 72  | 40  | 462
```

Buttons:

```text
Select All
Clear All
Apply Eligibility
```

### Critical

Analysis changes must **not** change actual eligibility.

Only **Apply Eligibility** changes stored eligibility. 

---

# PHASE 15 — APPLY ELIGIBILITY

Admin selects multiple:

```text
Semesters
Programs
```

Example:

```text
Semesters:
☑ 1
☑ 3
☑ 5

Programs:
☑ SOE
☑ IDS

Attendance >= 68%
Fees = Paid
```

Click:

```text
Apply Eligibility
```

Only selected semester/program combinations are modified.

All others remain unchanged.

---

# PHASE 16 — ELIGIBILITY OVERRIDE

Maintain three statuses:

```text
Calculated Eligibility
Admin Override
Final Eligibility
```

Admin can manually override a student:

```text
Eligible
Not Eligible
```

### Final eligibility

Final Eligibility is the authoritative status.

It controls:

```text
Hall Ticket
Block Report
Eligible Count
```



---

# PHASE 17 — HALL TICKET AVAILABILITY

Admin configures:

```text
Available From Date
Available From Time

Available Until Date
Available Until Time
```

Students can download Hall Tickets only during this period. 

---

# PHASE 18 — HALL TICKET GENERATION

Generate PDF using the latest database data.

### Hall Ticket contains

```text
Institution
Examination
Academic Year
Student Photo
Student Name
Enrollment Number
Program
Semester
Division
Block Number
Classroom
Examination Schedule
```

Schedule:

```text
Date
Time
Subject Code
Subject Name
```

### Data source

```text
Student
+
Exam Data
+
Final Eligibility
+
Seating
+
Latest Photo
```

Only eligible students can download. 

---

# PHASE 19 — STUDENT PORTAL

Student flow:

```text
Enter Enrollment Number
        ↓
Verify against Admin Data
        ↓
Register
        ↓
Upload Photo
        ↓
Create Password
        ↓
Login
        ↓
Dashboard
        ↓
Select Academic Year
        ↓
Select Examination
        ↓
Check Eligibility
        ↓
View Hall Ticket
        ↓
Download
```

### Student must see only

```text
Their own profile
Their applicable exams
Their own eligibility
Their own Hall Ticket
```

Never another student's information.

---

# PHASE 20 — BLOCK REPORT / ATTENDANCE SHEET

**Block Report and Attendance Sheet are the same document.**

Admin selects only:

```text
Examination
Date
Time
```

Admin does **NOT** select Subject.

System automatically detects all subjects scheduled for that Date + Time. 

---

# PHASE 21 — BLOCK REPORT PDF

Generate **one PDF** containing all applicable subjects and blocks.

Each section:

```text
Examination
Date
Time
Subject Code
Subject Name
Semester
Program
Division
Block Number
Classroom
Total Eligible Students
```

Then:

```text
Sr. No.
Enrollment No.
Student Name
Division
Attendance / Signature
```

Only:

```text
Final Eligibility = Eligible
```

students appear.

Example:

```text
Seating = 39
Eligible = 34

Block Report = 34 students
```

The five ineligible students must not appear. 

---

# PHASE 22 — REPORTS & DOWNLOADS

Admin Reports page:

### Hall Tickets

```text
Generate
Download
Filter
```

### Block Labels

```text
Generate
Download
```

### Block Reports

```text
Exam
Date
Time
Generate
Download
```

Do not unnecessarily create duplicate PDF files.

Database remains the source of truth. 

---

# PHASE 23 — AUDIT LOG

Record Admin activities:

```text
Exam Creation
Excel Upload
Data Modification
Eligibility Criteria Change
Eligibility Override
Seating Changes
Hall Ticket Generation
Block Report Generation
Hall Ticket Period Changes
```

Record:

```text
User
Action
Timestamp
Object
Relevant information
```

Never log passwords or secrets. 

---

# PHASE 24 — SECURITY HARDENING

Implement defense-in-depth security.

Protect against:

```text
SQL Injection
XSS
CSRF
IDOR
Broken Access Control
Brute Force
Session Fixation
Path Traversal
Malicious File Upload
Malicious Excel
Unauthorized PDF Access
Unauthorized API Access
Privilege Escalation
Duplicate Enrollment
Race Conditions
```

### Important

Do not claim the system is "hack-proof."

Security must be implemented at the backend.

Never trust:

```text
URL parameters
Frontend validation
Hidden buttons
Client-side eligibility
Uploaded filenames
Uploaded MIME types
```

Validate everything server-side. 

---

# PHASE 25 — FILE STORAGE

Because the application will run on Vercel, do not depend on permanent local filesystem storage.

Use external object storage for:

```text
Student Photos
Uploaded Excel files
Persistent PDFs
Institution Logos
```

Database should store file references/URLs.

---

# PHASE 26 — PERFORMANCE

Optimize for large examination datasets.

Implement:

```text
Database indexes
Pagination
Efficient Prisma queries
Bulk operations
Transactions
Connection pooling
Lazy loading where appropriate
```

Avoid loading thousands of records unnecessarily into browser memory.

---

# PHASE 27 — TESTING

After every phase:

```text
1. Run database migration
2. Run automated tests
3. Start application
4. Test UI
5. Test database
6. Test authorization
7. Test business rules
8. Test error handling
9. Fix problems
10. Only then continue
```

Do not continue with unresolved critical errors. 

---

# PHASE 28 — SECURITY TESTING

Test:

```text
SQL Injection
XSS
CSRF
IDOR
Broken Access Control
Brute Force
Session Fixation
Path Traversal
Malicious File Upload
Malicious Excel
Unauthorized PDF
Unauthorized API
Privilege Escalation
Duplicate Enrollment
Race Conditions
```

Also test:

```text
Student A cannot access Student B
Student cannot access Admin
Unregistered enrollment cannot register
Duplicate account cannot be created
Ineligible student cannot download Hall Ticket
Ineligible student cannot appear in Block Report
```

---

# PHASE 29 — VERCEL + NEON DEPLOYMENT

Final architecture:

```text
                 GitHub
                    │
                    ▼
                 Vercel
                    │
              Express.js
                    │
                  Prisma
                    │
                    ▼
             Neon PostgreSQL
                    │
                    ▼
             Object Storage
```

### Deployment steps

```text
GitHub Repository
       ↓
Create Neon Database
       ↓
Configure DATABASE_URL
       ↓
Configure Vercel
       ↓
Add Environment Variables
       ↓
Deploy
       ↓
Run Prisma migrations
       ↓
Test Production
```

Separate:

```text
Development
Preview
Production
```

environment variables.

---

# PHASE 30 — FINAL ACCEPTANCE TEST

The complete Admin workflow must work:

```text
Create Exam
     ↓
Download Sample Excel
     ↓
Upload Excel
     ↓
Preview
     ↓
Confirm
     ↓
Re-upload
     ↓
Blank fields preserve old data
     ↓
No duplicate enrollment
     ↓
Verify/Edit
     ↓
Seating Arrangement
     ↓
Block Labels
     ↓
Eligibility Criteria
     ↓
Eligibility Analysis
     ↓
Apply Eligibility
     ↓
Override
     ↓
Hall Ticket Period
     ↓
Hall Ticket
     ↓
Block Report
     ↓
Reports
```

The complete Student workflow:

```text
Enrollment Number
       ↓
Check Admin Data
       ↓
Registration Allowed
       ↓
Photo
       ↓
Password
       ↓
Login
       ↓
Academic Year
       ↓
Exam
       ↓
Eligibility
       ↓
Hall Ticket
       ↓
Download
```

---

# 🔴 NON-NEGOTIABLE BUSINESS RULES FOR ANTIGRAVITY

Put these rules prominently in the project instructions:

```text
1. Only Enrollment Numbers existing in Admin data can register.

2. Enrollment Number is unique.

3. Existing enrollment must be updated, not duplicated.

4. Blank Excel cells mean "NO CHANGE".

5. Failed Excel uploads must rollback completely.

6. Examination date columns are dynamically detected.

7. Seating ranges use actual Enrollment Numbers.

8. Block Label and Block Report are different documents.

9. Block Label must not contain student lists.

10. Eligibility Analysis is preview-only.

11. Apply Eligibility changes actual eligibility.

12. Calculated, Override and Final Eligibility must remain separate.

13. Final Eligibility controls Hall Ticket access.

14. Final Eligibility controls Block Report inclusion.

15. Hall Ticket uses the latest student photo.

16. Block Report Admin input is only Exam + Date + Time.

17. Subjects are automatically detected for Block Reports.

18. One Block Report PDF may contain multiple subjects and blocks.

19. Only eligible students appear in Block Reports.

20. Student can access only their own data.

21. Student cannot access Admin functionality.

22. Backend authorization is mandatory.

23. Database is the single source of truth.

24. PDFs are generated outputs, not master records.

25. Never expose secrets or internal errors in production.

26. Do not claim the application is "hack-proof".

27. Test every phase before proceeding to the next phase.
```

## 🚀 STARTING INSTRUCTION FOR ANTIGRAVITY

Use this as the **first instruction** after creating your Antigravity project:

> **Read and understand the complete project specification above. Do not build the entire system at once. Start with PHASE 0 and PHASE 1 only. First create the architecture and project foundation using Node.js, Express.js, Prisma and Neon PostgreSQL. Verify that the application starts and the database connection works. Then report exactly what was created, what was tested, and any issues. Do not begin Phase 2 until Phase 1 is successfully verified. Maintain every business rule in this specification throughout development.**
