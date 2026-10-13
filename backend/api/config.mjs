/**
 * The shape of the data on AWS, and who may do what. This file is the AWS version of firestore.rules
 * plus the table design in infra/lib/data-stack.js. The two must agree: every `index` named here exists
 * there, with the same key attributes.
 *
 * Collection names are the Firestore names, so the app's code reads the same on both backends.
 *
 * Each collection has:
 *   table    the DynamoDB table (without the prefix)
 *   pk, sk   key attributes. `pk` holds the document id, except notifications (see below)
 *   indexes  global secondary indexes: name -> { pk, sk? }
 *   stamps   fields the SERVER fills with the time. The first one is set on create.
 *   frozen   fields nobody may change after creation (who owns it, what it belongs to)
 *   rules    canRead, canCreate, canUpdate, canDelete. Each gets (item, caller, ctx) and returns true or false.
 *            `caller` is { uid, email, name } or null when the request carried no valid sign in.
 *            `ctx.get(collection, id)` reads another document (for rules that look at a parent).
 */

const signedIn = (c) => !!c;
const is = (c, uid) => !!c && !!uid && c.uid === uid;
const never = () => false;

export const COLLECTIONS = {
  users: {
    table: 'users', pk: 'uid', indexes: {}, stamps: [], frozen: [],
    // Anyone signed in may read one profile by its id (a teacher needs a student's name), but never list them.
    // A person other than the owner only ever gets the display name back (see service.js, publicView).
    rules: {
      canRead: (_i, c) => signedIn(c),
      canCreate: (d, c, id) => is(c, id),
      canUpdate: (i, c) => is(c, i.uid),
      canDelete: (i, c) => is(c, i.uid),
    },
  },

  quizzes: {
    table: 'quizzes', pk: 'quizId',
    indexes: {
      byOwner: { pk: 'createdBy', sk: 'createdAt' },
      byActive: { pk: 'activeKey', sk: 'createdAt' },   // sparse: only active quizzes carry activeKey = 'Y'
      byCode: { pk: 'code' },
    },
    stamps: ['createdAt', 'updatedAt'], frozen: ['createdBy'],
    // Open quizzes are public (guests join by code). A switched off quiz is visible only to its author.
    rules: {
      canRead: (i, c) => i.active === true || is(c, i.createdBy),
      canCreate: (d, c) => is(c, d.createdBy),
      canUpdate: (i, c) => is(c, i.createdBy),
      canDelete: (i, c) => is(c, i.createdBy),
    },
  },

  quiz_results: {
    table: 'results', pk: 'resultId',
    indexes: {
      byUser: { pk: 'userId', sk: 'completedAt' },
      byQuiz: { pk: 'quizId', sk: 'completedAt' },
      byTeacher: { pk: 'teacherId', sk: 'completedAt' },
    },
    stamps: ['completedAt'], frozen: ['userId', 'teacherId', 'quizId'],
    // Anyone, guests included, may hand a result in (checked further in service.js). Only the student and the
    // quiz's teacher can read it, only the teacher can mark it.
    rules: {
      canRead: (i, c) => is(c, i.userId) || is(c, i.teacherId),
      canCreate: () => true,
      canUpdate: (i, c) => is(c, i.teacherId),
      canDelete: (i, c) => is(c, i.teacherId) || is(c, i.userId),
    },
  },

  classes: {
    table: 'classes', pk: 'classId',
    indexes: { byTeacher: { pk: 'teacherId' }, byCode: { pk: 'code' } },
    stamps: ['createdAt'], frozen: ['teacherId'],
    rules: {
      canRead: (_i, c) => signedIn(c),
      canCreate: (d, c) => is(c, d.teacherId),
      canUpdate: (i, c) => is(c, i.teacherId),
      canDelete: (i, c) => is(c, i.teacherId),
    },
  },

  class_enrollments: {
    table: 'enrollments', pk: 'enrollmentId',
    indexes: { byClass: { pk: 'classId' }, byStudent: { pk: 'studentId' } },
    stamps: ['joinedAt'], frozen: ['classId', 'studentId'],
    // The student, or the teacher who owns the class.
    rules: {
      canRead: async (i, c, ctx) => is(c, i.studentId) || is(c, (await ctx.get('classes', i.classId))?.teacherId),
      canCreate: (d, c) => is(c, d.studentId),
      canUpdate: never,
      canDelete: async (i, c, ctx) => is(c, i.studentId) || is(c, (await ctx.get('classes', i.classId))?.teacherId),
    },
  },

  question_bank: {
    table: 'questionBank', pk: 'itemId',
    indexes: { byTeacher: { pk: 'teacherId' } },
    stamps: ['savedAt'], frozen: ['teacherId'],
    rules: {
      canRead: (i, c) => is(c, i.teacherId),
      canCreate: (d, c) => is(c, d.teacherId),
      canUpdate: never,
      canDelete: (i, c) => is(c, i.teacherId),
    },
  },

  // Notifications: the table key is (userId, createdAtId), so one person's list is a single lookup. The id the
  // app sees is createdAtId, "<iso time>#<random>", which also sorts by time.
  notifications: {
    table: 'notifications', pk: 'userId', sk: 'createdAtId', indexes: {},
    stamps: ['createdAt'], frozen: ['userId'],
    rules: {
      canRead: (i, c) => is(c, i.userId),
      canCreate: (_d, c) => signedIn(c),      // any signed in person may notify another (a teacher, about a grade)
      canUpdate: (i, c) => is(c, i.userId),
      canDelete: (i, c) => is(c, i.userId),
    },
  },
};

/** Fields that exist only for the database, never shown to the app. */
export const INTERNAL = ['activeKey', 'createdAtId'];

export const MAX_ITEM_BYTES = 350 * 1024;   // DynamoDB's limit is 400 KB per item. This leaves room for the keys.
export const MAX_QUERY_ITEMS = 500;
