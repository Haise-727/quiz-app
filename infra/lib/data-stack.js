import { Stack, RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

/**
 * The database. One table per Firestore collection, so the move mirrors what exists today.
 *
 * COST RULES (see docs/aws-migration.md):
 *  - PROVISIONED mode, never on demand. Provisioned capacity throttles when it is full; on
 *    demand bills for every request.
 *  - 1 read unit and 1 write unit per table and per index. The Always Free allowance is 25 + 25 in
 *    total across the whole account, so this stack refuses to build if it asks for more
 *    (see unitsUsed).
 *  - No autoscaling, no point in time recovery (billed), no streams, no global tables.
 *
 * Keys follow the questions the app asks (src/api/*). Each index names the function that needs it.
 */

const T = (name, partitionKey, extra = {}) => ({ name, partitionKey, ...extra });

/** Table definitions. `indexes` are global secondary indexes: [name, partitionKey, sortKey?]. */
export const TABLES = [
  T('users', 'uid'),
  T('quizzes', 'quizId', { indexes: [
    ['byOwner', 'createdBy', 'createdAt'],    // listMyQuizzes, listMyQuizzesUnordered
    ['byCode', 'code'],                        // findActiveQuizByCode, isJoinCodeFree
  ] }),
  T('results', 'resultId', { indexes: [
    ['byUser', 'userId', 'completedAt'],       // listMyResults
    ['byQuiz', 'quizId', 'completedAt'],       // listResultsForQuiz (teacherId is checked on the server)
    ['byTeacher', 'teacherId', 'completedAt'], // listResultsForTeacher
  ] }),
  T('classes', 'classId', { indexes: [
    ['byTeacher', 'teacherId'],                // getTeacherClasses
    ['byCode', 'code'],                        // joinClassByCode
  ] }),
  T('enrollments', 'enrollmentId', { indexes: [
    ['byClass', 'classId'],                    // getClassEnrollments, deleteClass
    ['byStudent', 'studentId'],                // getStudentClasses, leaveClass
  ] }),
  T('questionBank', 'itemId', { indexes: [['byTeacher', 'teacherId']] }),   // getBankQuestions
  // Notifications: all of one person's, newest first, is a single key lookup.
  T('notifications', 'userId', { sortKey: 'createdAtId' }),
];

/** Read units (and the same number of write units) this stack asks for. Must stay at or below 25. */
export function unitsUsed() {
  return TABLES.reduce((n, t) => n + 1 + (t.indexes?.length || 0), 0);
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
        readCapacity: 1,
        writeCapacity: 1,
        removalPolicy: RemovalPolicy.RETAIN,   // never lose the data to a stack delete by accident
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      });
      for (const [indexName, pk, sk] of t.indexes || []) {
        table.addGlobalSecondaryIndex({
          indexName,
          partitionKey: { name: pk, type: dynamodb.AttributeType.STRING },
          sortKey: sk ? { name: sk, type: dynamodb.AttributeType.STRING } : undefined,
          projectionType: dynamodb.ProjectionType.ALL,
          readCapacity: 1,
          writeCapacity: 1,
        });
      }
      this.tables[t.name] = table;
    }
  }
}
