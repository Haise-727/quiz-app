import { Stack, RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

/**
 * The database. One table per Firestore collection, so the move mirrors what exists today.
 *
 * COST RULES (see docs/aws-migration.md):
 *  - PROVISIONED mode, never on demand. Provisioned capacity throttles when it is full; on
 *    demand bills for every request.
 *  - 1 to 2 read and write units per table and per index. The Always Free allowance is 25 + 25 in
 *    total across the whole account, so this stack refuses to build if it asks for more
 *    (see unitsUsed).
 *  - No autoscaling, no point in time recovery (billed), no streams, no global tables.
 *
 * Keys follow the questions the app asks (src/api/*). Each index names the function that needs it.
 */

const T = (name, partitionKey, extra = {}) => ({ name, partitionKey, ...extra });

/**
 * Table definitions. `units` is the read and write capacity of the table, and each index is
 * [name, partitionKey, sortKey or null, units]. The tables and indexes here must match
 * backend/api/config.mjs. The units add up to 24 of the free 25 (see unitsUsed). The busiest tables
 * (quizzes and results) get 2 because a quiz is one big document and costs one unit per KB written.
 */
export const TABLES = [
  T('users', 'uid', { units: 1 }),
  T('quizzes', 'quizId', { units: 2, indexes: [
    ['byOwner', 'createdBy', 'createdAt', 2],    // listMyQuizzes
    ['byActive', 'activeKey', 'createdAt', 2],   // listActiveQuizzes (sparse: only active quizzes have activeKey)
    ['byCode', 'code', null, 1],                 // findActiveQuizByCode, isJoinCodeFree
  ] }),
  T('results', 'resultId', { units: 2, indexes: [
    ['byUser', 'userId', 'completedAt', 2],      // listMyResults
    ['byQuiz', 'quizId', 'completedAt', 2],      // listResultsForQuiz (teacherId is checked on the server)
    ['byTeacher', 'teacherId', 'completedAt', 1],// listResultsForTeacher
  ] }),
  T('classes', 'classId', { units: 1, indexes: [
    ['byTeacher', 'teacherId', null, 1],         // getTeacherClasses
    ['byCode', 'code', null, 1],                 // joinClassByCode
  ] }),
  T('enrollments', 'enrollmentId', { units: 1, indexes: [
    ['byClass', 'classId', null, 1],             // getClassEnrollments, deleteClass
    ['byStudent', 'studentId', null, 1],         // getStudentClasses, leaveClass
  ] }),
  T('questionBank', 'itemId', { units: 1, indexes: [['byTeacher', 'teacherId', null, 1]] }),   // getBankQuestions
  // Notifications: all of one person's, newest first, is a single key lookup.
  T('notifications', 'userId', { units: 1, sortKey: 'createdAtId' }),
];

/** Read units (and the same number of write units) this stack asks for. Must stay at or below 25. */
export function unitsUsed() {
  return TABLES.reduce((n, t) => n + t.units + (t.indexes || []).reduce((m, ix) => m + ix[3], 0), 0);
}

export class DataStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);
    const prefix = props.prefix || 'quizlike';
    if (unitsUsed() > 25) throw new Error(`Data stack uses ${unitsUsed()} units, more than the free 25.`);

    this.tables = {};
    for (const t of TABLES) {
      const table = new dynamodb.Table(this, `${t.name}Table`, {
        tableName: `${prefix}-${t.name}`,
        partitionKey: { name: t.partitionKey, type: dynamodb.AttributeType.STRING },
        sortKey: t.sortKey ? { name: t.sortKey, type: dynamodb.AttributeType.STRING } : undefined,
        billingMode: dynamodb.BillingMode.PROVISIONED,
        readCapacity: t.units,
        writeCapacity: t.units,
        removalPolicy: RemovalPolicy.RETAIN,   // never lose the data to a stack delete by accident
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      });
      for (const [indexName, pk, sk, units] of t.indexes || []) {
        table.addGlobalSecondaryIndex({
          indexName,
          partitionKey: { name: pk, type: dynamodb.AttributeType.STRING },
          sortKey: sk ? { name: sk, type: dynamodb.AttributeType.STRING } : undefined,
          projectionType: dynamodb.ProjectionType.ALL,
          readCapacity: units,
          writeCapacity: units,
        });
      }
      this.tables[t.name] = table;
    }
  }
}
