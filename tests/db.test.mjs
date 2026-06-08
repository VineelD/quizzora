import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

function tokenHash(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

const tempDir = mkdtempSync(join(tmpdir(), "littlecode-db-"));
process.env.SQLITE_DATABASE_PATH = join(tempDir, "test.sqlite");
process.env.APP_BASE_URL = "http://localhost:8080";
process.env.ALLOW_TEACHER_SIGNUP = "true";
process.env.STUDY_COACH_ENABLED = "false";

const db = await import("../lib/db.js");
const audit = await import("../lib/audit.js");
const password = await import("../lib/password.js");
const authTokens = await import("../lib/auth-tokens.js");

before(() => {
  db.getDb();
});

after(() => {
  db.resetDatabaseForTests();
  rmSync(tempDir, { recursive: true, force: true });
});

test("first school registration creates an admin", () => {
  const { admin } = db.createSchoolWithAdmin({
    schoolName: "First School",
    schoolSlug: "first-school",
    name: "Asha Patel",
    email: "teacher@school.example",
    password: "Teacher123!",
  });

  assert.equal(admin.role, "admin");
  assert.ok(password.verifyPassword("Teacher123!", db.findUserByEmail(admin.email, admin.school_id).password_hash));
});

test("password reset updates the account password", () => {
  const teacher = db.createTestTeacher({
    name: "Asha Patel",
    email: "teacher-invite@school.example",
    username: "teacher-invite",
    password: "Teacher123!",
  });

  const rawToken = "reset-token";
  db.getDb()
    .prepare(
      `
      INSERT INTO auth_tokens (email, token_hash, purpose, user_id, expires_at)
      VALUES (?, ?, 'reset_password', ?, datetime('now', '+1 hour'))
    `,
    )
    .run(teacher.email, tokenHash(rawToken), teacher.id);

  const updated = authTokens.resetPasswordWithToken(rawToken, "FreshPass123!");
  assert.equal(updated.id, teacher.id);
  assert.ok(password.verifyPassword("FreshPass123!", db.findUserByEmail(teacher.email).password_hash));
});

test("teacher can create a student with username, password, and profile", () => {
  const teacher = db.createTestTeacher({
    name: "Asha Patel",
    email: "teacher2@school.example",
    username: "teacher2",
    password: "Teacher123!",
  });
  const student = db.createStudentForTeacher({
    teacherId: teacher.id,
    name: "Liam Learner",
    username: "liam.learner",
    email: "liam.learner@school.example",
    password: "Learner123!",
    yearLevel: "Year 7",
    guardianEmail: "guardian@example.com",
    learningNeeds: "Prefers worked examples",
  });

  assert.equal(student.username, "liam.learner");
  assert.ok(password.verifyPassword("Learner123!", db.findUserByIdentifier("liam.learner").password_hash));
});

test("student usernames and emails must be unique", () => {
  const teacher = db.createTestTeacher({
    name: "Unique Teacher",
    email: "unique-teacher@school.example",
    username: "unique-teacher",
    password: "Teacher123!",
  });

  db.createStudentForTeacher({
    teacherId: teacher.id,
    name: "First Student",
    username: "unique.student",
    email: "unique.student@school.example",
    password: "Learner123!",
    yearLevel: "Year 7",
  });

  assert.throws(
    () =>
      db.createStudentForTeacher({
        teacherId: teacher.id,
        name: "Duplicate Username",
        username: "unique.student",
        email: "other.student@school.example",
        password: "Learner123!",
        yearLevel: "Year 7",
      }),
    /username is already in use/i,
  );

  assert.throws(
    () =>
      db.createStudentForTeacher({
        teacherId: teacher.id,
        name: "Duplicate Email",
        username: "other.student",
        email: "unique.student@school.example",
        password: "Learner123!",
        yearLevel: "Year 7",
      }),
    /email is already in use/i,
  );

  const [klass] = db.getTeacherClasses(teacher.id);
  assert.equal(klass.year_level, "Year 7");
});

test("teacher can update and delete students with uniqueness checks", () => {
  const teacher = db.createTestTeacher({
    name: "CRUD Teacher",
    email: "crud-teacher@school.example",
    username: "crudteacher",
    password: "Teacher123!",
  });
  const otherTeacher = db.createTestTeacher({
    name: "Other Teacher",
    email: "other-teacher@school.example",
    username: "otherteacher",
    password: "Teacher123!",
  });

  const student = db.createStudentForTeacher({
    teacherId: teacher.id,
    name: "Mia Learner",
    username: "mia.learner",
    email: "mia.learner@school.example",
    password: "Learner123!",
    yearLevel: "Year 7",
    guardianEmail: "guardian@example.com",
    learningNeeds: "Extra time",
  });

  const updated = db.updateStudentForTeacher({
    teacherId: teacher.id,
    studentId: student.id,
    name: "Mia Updated",
    username: "mia.updated",
    email: "mia.updated@school.example",
    password: "",
    yearLevel: "Year 8",
    guardianEmail: "new-guardian@example.com",
    learningNeeds: "Visual aids",
  });

  assert.equal(updated.name, "Mia Updated");
  assert.equal(updated.username, "mia.updated");
  assert.equal(updated.year_level, "Year 8");

  db.createStudentForTeacher({
    teacherId: teacher.id,
    name: "Other Student",
    username: "other.student",
    email: "other.student@school.example",
    password: "Learner123!",
    yearLevel: "Year 7",
  });

  assert.throws(
    () =>
      db.updateStudentForTeacher({
        teacherId: teacher.id,
        studentId: student.id,
        name: "Mia Updated",
        username: "other.student",
        email: "mia.updated@school.example",
        password: "",
        yearLevel: "Year 8",
        guardianEmail: "",
        learningNeeds: "",
      }),
    /username is already in use/i,
  );

  assert.throws(
    () =>
      db.updateStudentForTeacher({
        teacherId: otherTeacher.id,
        studentId: student.id,
        name: "Mia Updated",
        username: "mia.updated",
        email: "mia.updated@school.example",
        password: "",
        yearLevel: "Year 8",
        guardianEmail: "",
        learningNeeds: "",
      }),
    /Student not found/i,
  );

  db.deleteStudentForTeacher({ teacherId: teacher.id, studentId: student.id });
  assert.equal(db.getTeacherStudent(teacher.id, student.id), null);
});

test("getOrCreateClassForYearLevel creates cohorts through Year 12", () => {
  const teacher = db.createTestTeacher({
    name: "Year Cohort Teacher",
    email: "cohorts@school.example",
    username: "cohorts",
    password: "Teacher123!",
  });

  const year10Id = db.getOrCreateClassForYearLevel(teacher.id, "Year 10");
  const year12Id = db.getOrCreateClassForYearLevel(teacher.id, "Year 12");
  const year10Again = db.getOrCreateClassForYearLevel(teacher.id, "Year 10");

  assert.equal(year10Id, year10Again);
  assert.notEqual(year10Id, year12Id);

  const classes = db.getTeacherClasses(teacher.id);
  assert.ok(classes.some((item) => item.year_level === "Year 10"));
  assert.ok(classes.some((item) => item.year_level === "Year 12"));
});

test("teacher can assign a generated quiz and view class report", () => {
  const teacher = db.createTestTeacher({
    name: "Asha Patel",
    email: "teacher3@school.example",
    username: "teacher3",
    password: "Teacher123!",
  });
  const student = db.createTestStudent({
    name: "Mia Student",
    email: "mia@school.example",
    username: "mia",
    password: "Student123!",
    teacherId: teacher.id,
    classId: db.getTeacherClasses(teacher.id)[0].id,
  });
  const [klass] = db.getTeacherClasses(teacher.id);

  const saved = db.insertGeneratedQuiz({
    teacherId: teacher.id,
    classId: klass.id,
    title: "Science: Mixtures and separation",
    request: {
      subject: "Science",
      focus: "Mixtures and separation",
      difficulty: "core",
      questionCount: 3,
    },
    generated: {
      source: "Built-in sample",
      quiz: {
        subject: "Science",
        focus: "Mixtures and separation",
        yearLevel: "Year 7",
        curriculumSummary: "Year 7 Science sample.",
        learningIntentions: ["Understand mixtures."],
        questions: [
          {
            question: "Which method separates sand from water?",
            options: ["Filtration", "Magnetism", "Freezing", "Melting"],
            answer: "Filtration",
            explanation: "Filtration separates insoluble solids from liquids.",
          },
        ],
      },
    },
  });

  const report = db.getAssignmentReport(teacher.id, saved.assignmentId);
  assert.ok(report.students.length >= 1);
  assert.ok(student.id);
});

test("student submission is scored and appears in teacher report", () => {
  const teacher = db.createTestTeacher({
    name: "Asha Patel",
    email: "teacher4@school.example",
    username: "teacher4",
    password: "Teacher123!",
  });
  const [klass] = db.getTeacherClasses(teacher.id);
  const student = db.createTestStudent({
    name: "Noah Student",
    email: "noah@school.example",
    username: "noah",
    password: "Student123!",
    teacherId: teacher.id,
    classId: klass.id,
  });
  const saved = db.insertGeneratedQuiz({
    teacherId: teacher.id,
    classId: klass.id,
    title: "Science: Forces",
    request: {
      subject: "Science",
      focus: "Forces",
      difficulty: "core",
      questionCount: 3,
    },
    generated: {
      source: "Built-in sample",
      quiz: {
        subject: "Science",
        focus: "Forces",
        yearLevel: "Year 7",
        curriculumSummary: "Year 7 Science sample.",
        learningIntentions: ["Understand forces."],
        questions: [
          {
            question: "A push or pull is called a what?",
            options: ["Force", "Mixture", "Orbit", "Variable"],
            answer: "Force",
            explanation: "Forces are pushes or pulls.",
          },
        ],
      },
    },
  });

  const result = db.submitAssignment({
    studentId: student.id,
    assignmentId: saved.assignmentId,
    answers: { 0: "Force" },
  });

  const report = db.getAssignmentReport(teacher.id, saved.assignmentId);
  const submittedStudent = report.students.find((item) => item.id === student.id);

  assert.deepEqual(result, { score: 1, total: 1 });
  assert.equal(submittedStudent.status, "Submitted");
});

test("teacher can assign sudoku and student solution is stored without exposing answer", () => {
  const teacher = db.createTestTeacher({
    name: "Sudoku Teacher",
    email: "sudoku-teacher@school.example",
    username: "sudokuteacher",
    password: "Teacher123!",
  });
  const [klass] = db.getTeacherClasses(teacher.id);
  const student = db.createTestStudent({
    name: "Sudoku Student",
    email: "sudoku-student@school.example",
    username: "sudokustudent",
    password: "Student123!",
    teacherId: teacher.id,
    classId: klass.id,
  });

  const saved = db.insertSudokuAssignment({
    teacherId: teacher.id,
    yearLevel: "Year 7",
    difficulty: "Easy",
  });

  const assignment = db.getStudentAssignment(student.id, saved.assignmentId);
  assert.equal(assignment.subject, "Sudoku");
  assert.equal(assignment.questions.type, "sudoku");
  assert.equal(assignment.questions.solution, undefined);

  const stored = db
    .getDb()
    .prepare("SELECT questions_json FROM quizzes WHERE id = ?")
    .get(saved.quizId);
  const payload = JSON.parse(stored.questions_json);

  const result = db.submitAssignment({
    studentId: student.id,
    assignmentId: saved.assignmentId,
    sudokuGrid: payload.solution,
    elapsedSeconds: 95,
    mistakes: 2,
  });

  assert.equal(result.score, 1);
  assert.equal(result.complete, true);

  const report = db.getAssignmentReport(teacher.id, saved.assignmentId);
  const submittedStudent = report.students.find((item) => item.id === student.id);
  assert.equal(submittedStudent.status, "Submitted");
  assert.equal(submittedStudent.sudokuSubmission.elapsedSeconds, 95);
  assert.equal(submittedStudent.sudokuSubmission.mistakes, 2);

  assert.throws(() => {
    db.submitAssignment({
      studentId: student.id,
      assignmentId: saved.assignmentId,
      sudokuGrid: payload.solution,
      elapsedSeconds: 10,
      mistakes: 0,
    });
  });
});

test("past due assignments block submission when late work is disabled", () => {
  const teacher = db.createTestTeacher({
    name: "Due Teacher",
    email: "due-teacher@school.example",
    username: "dueteacher",
    password: "Teacher123!",
  });
  const schoolId = db.getDefaultSchoolId();
  db.getDb().prepare("UPDATE schools SET allow_late_submissions = 0 WHERE id = ?").run(schoolId);

  const [klass] = db.getTeacherClasses(teacher.id);
  const student = db.createTestStudent({
    name: "Due Student",
    email: "due-student@school.example",
    username: "duestudent",
    password: "Student123!",
    teacherId: teacher.id,
    classId: klass.id,
  });

  const saved = db.insertSudokuAssignment({
    teacherId: teacher.id,
    yearLevel: "Year 7",
    difficulty: "Easy",
    dueAt: "2000-01-01T00:00:00.000Z",
  });

  const payload = JSON.parse(
    db.getDb().prepare("SELECT questions_json FROM quizzes WHERE id = ?").get(saved.quizId).questions_json,
  );

  assert.throws(
    () =>
      db.submitAssignment({
        studentId: student.id,
        assignmentId: saved.assignmentId,
        sudokuGrid: payload.solution,
        elapsedSeconds: 10,
        mistakes: 0,
      }),
    /past its due date/,
  );

  db.getDb().prepare("UPDATE schools SET allow_late_submissions = 1 WHERE id = ?").run(schoolId);
});

test("teacher can reuse quiz and import students from csv rows", () => {
  const teacher = db.createTestTeacher({
    name: "Reuse Teacher",
    email: "reuse-teacher@school.example",
    username: "reuseteacher",
    password: "Teacher123!",
  });
  const [klass] = db.getTeacherClasses(teacher.id);
  const saved = db.insertGeneratedQuiz({
    teacherId: teacher.id,
    classId: klass.id,
    title: "Math: Fractions",
    request: { subject: "Math", focus: "Fractions", difficulty: "core" },
    generated: {
      source: "Built-in sample",
      quiz: {
        subject: "Math",
        focus: "Fractions",
        yearLevel: "Year 7",
        curriculumSummary: "Fractions sample.",
        learningIntentions: ["Add fractions."],
        questions: [
          {
            question: "Half of 10 is?",
            options: ["5", "2", "10", "20"],
            answer: "5",
            explanation: "10 divided by 2.",
          },
        ],
      },
    },
  });

  const library = db.listTeacherQuizzes(teacher.id);
  assert.ok(library.some((item) => item.id === saved.quizId));

  const reassigned = db.assignExistingQuiz({
    teacherId: teacher.id,
    quizId: saved.quizId,
    yearLevel: "Year 8",
    dueAt: "2099-01-01T12:00:00.000Z",
  });
  assert.ok(reassigned.assignmentId);

  const imported = db.importStudentsFromCsv({
    teacherId: teacher.id,
    rows: [
      {
        name: "CSV Student",
        username: "csvstudent",
        email: "csv@school.example",
        password: "Student123!",
        yearLevel: "Year 7",
      },
    ],
  });
  assert.equal(imported.created, 1);
  assert.equal(imported.errors.length, 0);
});

test("audit logs list school activity for admins", () => {
  const teacher = db.createTestTeacher({
    name: "Audit Teacher",
    email: "audit-teacher@school.example",
    username: "auditteacher",
    password: "Teacher123!",
  });
  const schoolId = teacher.school_id || db.getDefaultSchoolId();

  db.createStudentForTeacher({
    teacherId: teacher.id,
    name: "Audit Student",
    username: "auditstudent",
    email: "audit-student@school.example",
    password: "Student123!",
    yearLevel: "Year 7",
  });

  const logs = audit.listAuditLogsForSchool(schoolId, { limit: 20 });
  const total = audit.countAuditLogsForSchool(schoolId);

  assert.ok(total >= 1);
  assert.ok(logs.some((entry) => entry.action === "student.created"));
  assert.ok(logs[0].actorName);
});

test("admin can update school settings", () => {
  const admin = db.createTeacherAccount({
    name: "Site Admin",
    email: "admin-settings@school.example",
    password: "Admin12345!",
    role: "admin",
  });
  const adminUser = db.getUserById(admin.id);
  assert.ok(adminUser.school_id);

  const updated = db.updateSchoolForAdmin({
    adminId: admin.id,
    name: "Test High School",
    allowLateSubmissions: false,
  });

  assert.equal(updated.name, "Test High School");
  assert.equal(updated.allow_late_submissions, 0);
});
