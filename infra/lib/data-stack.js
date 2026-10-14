import { Stack, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

/**
 * The database: ONE table for everything (quizlike-main), with three shared indexes. How documents are laid out in it is
 * in backend/api/single-table.mjs.
 *
 * Why one table: in DynamoDB's free allowance every table and every index costs at least 1 of the 25 read and 25 write
 * units. Seven tables with twelve indexes used all 25. This one uses 9 and leaves 16 for other projects.
 *
 * COST RULES (see docs/aws-migration.md):
 *  - PROVISIONED mode, never on demand. Provisioned capacity throttles when it is full; on demand bills for every request.
 *  - The Always Free allowance is 25 + 25 in total across the whole account, so this stack refuses to build if it asks for
 *    more (see unitsUsed).
 *  - No autoscaling, no point in time recovery (billed), no global tables.
 *  - A stream is on (free) so a Lambda can react to new results; TTL is on (free) so old notifications delete themselves.
 *
 * The seven old tables are described below only so they can be copied into the new one and then deleted. They are built
 * only when the stack is deployed with `-c legacyTables=true`, switched to pay per request so that while they sit unused they
 * take no free capacity units and cost nothing. They stay until the owner confirms the copy; then deploy without
 * legacyTables and they are deleted.
 */

/** The single table. Each shared index is [name, units]. */
export const MAIN = { name: 'main', units: 3, indexes: [['gsi1', 2], ['gsi2', 2], ['gsi3', 2]] };

/** The old per collection tables, kept only for the one time copy. [name, partitionKey, sortKey or null, units] for indexes. */
const T = (name, partitionKey, extra = {}) => ({ name, partitionKey, ...extra });
export const LEGACY_TABLES = [
  T('users', 'uid', { units: 1, indexes: [['byLegacyEmail', 'legacyEmail', null, 1]] }),
  T('quizzes', 'quizId', { units: 2, indexes: [['byOwner', 'createdBy', 'createdAt', 2], ['byActive', 'activeKey', 'createdAt', 2], ['byCode', 'code', null, 1]] }),
  T('results', 'resultId', { units: 2, indexes: [['byUser', 'userId', 'completedAt', 2], ['byQuiz', 'quizId', 'completedAt', 2], ['byTeacher', 'teacherId', 'completedAt', 1]] }),
  T('classes', 'classId', { units: 1, indexes: [['byTeacher', 'teacherId', null, 1], ['byCode', 'code', null, 1]] }),
  T('enrollments', 'enrollmentId', { units: 1, indexes: [['byClass', 'classId', null, 1], ['byStudent', 'studentId', null, 1]] }),
  T('questionBank', 'itemId', { units: 1, indexes: [['byTeacher', 'teacherId', null, 1]] }),
  T('notifications', 'userId', { units: 1, sortKey: 'createdAtId' }),
];

const sum = (units, indexes) => units + indexes.reduce((n, ix) => n + ix[ix.length - 1], 0);

/**
 * Read units (and the same number of write units) the stack asks for. Must stay at or below 25. The old tables are kept
 * idle on PAY PER REQUEST billing while they wait to be deleted: they use none of the free provisioned units and cost
 * nothing when nobody reads them, so they add nothing here.
 */
export function unitsUsed() {
  return sum(MAIN.units, MAIN.indexes);
}

export class DataStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);
    const prefix = props.prefix || 'quizlike';
    const legacy = !!props.legacy;
    if (unitsUsed() > 25) throw new Error(`Data stack uses ${unitsUsed()} units, more than the free 25.`);

    const S = dynamodb.AttributeType.STRING;
    this.main = new dynamodb.Table(this, 'MainTable', {
      tableName: `${prefix}-main`,
      partitionKey: { name: 'pk', type: S },
      sortKey: { name: 'sk', type: S },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: MAIN.units,
      writeCapacity: MAIN.units,
      removalPolicy: RemovalPolicy.RETAIN,           // never lose the data to a stack delete by accident
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
      timeToLiveAttribute: 'ttl',                    // notifications carry a ttl (90 days) and delete themselves
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });
    for (const [name, units] of MAIN.indexes) {
      this.main.addGlobalSecondaryIndex({
        indexName: name,
        partitionKey: { name: `${name}pk`, type: S },
        sortKey: { name: `${name}sk`, type: S },
        projectionType: dynamodb.ProjectionType.ALL,
        readCapacity: units,
        writeCapacity: units,
      });
    }
    new CfnOutput(this, 'MainTableName', { value: this.main.tableName });

    // The seven old tables, only while copying. DESTROY so that deploying without legacyTables deletes them.
    this.tables = {};
    if (legacy) {
      for (const t of LEGACY_TABLES) {
        const table = new dynamodb.Table(this, `${t.name}Table`, {
          tableName: `${prefix}-${t.name}`,
          partitionKey: { name: t.partitionKey, type: S },
          sortKey: t.sortKey ? { name: t.sortKey, type: S } : undefined,
          billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,   // idle, so free; see unitsUsed
          removalPolicy: RemovalPolicy.DESTROY,
          pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: false },
        });
        for (const [indexName, pk, sk] of t.indexes || []) {
          table.addGlobalSecondaryIndex({
            indexName,
            partitionKey: { name: pk, type: S },
            sortKey: sk ? { name: sk, type: S } : undefined,
            projectionType: dynamodb.ProjectionType.ALL,
          });
        }
        this.tables[t.name] = table;
        // The API and auth stacks still import these ARNs until they are redeployed against the new table. CloudFormation
        // refuses to drop an export that is in use, so keep each one alive for now.
        this.exportValue(table.tableArn);
      }
    }
  }
}
