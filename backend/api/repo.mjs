/**
 * The real storage: DynamoDB. Four calls, the same four as memory-repo.mjs, which the tests use instead.
 *
 * Every table is PROVISIONED at a tiny capacity (infra/lib/data-stack.js) so the free allowance cannot be
 * exceeded. When a table is full DynamoDB answers "throttled" instead of charging. The SDK retries a few times by
 * itself; if it still fails the handler returns 503 and the app can try again.
 *
 * The AWS SDK for JavaScript v3 ships inside the Lambda Node runtime, so nothing is bundled here.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { COLLECTIONS } from './config.mjs';

const byTable = Object.fromEntries(Object.values(COLLECTIONS).map((c) => [c.table, c]));

export function createDynamoRepo({ prefix = 'quizlike-', client } = {}) {
  const doc = DynamoDBDocumentClient.from(client || new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const name = (table) => `${prefix}${table}`;
  const keyFor = (table, key) => {
    const def = byTable[table];
    return def.sk ? { [def.pk]: key[def.pk], [def.sk]: key[def.sk] } : { [def.pk]: key[def.pk] };
  };

  return {
    async get(table, key) {
      const out = await doc.send(new GetCommand({ TableName: name(table), Key: keyFor(table, key), ConsistentRead: false }));
      return out.Item || null;
    },
    async put(table, item) {
      await doc.send(new PutCommand({ TableName: name(table), Item: item }));
    },
    async remove(table, key) {
      await doc.send(new DeleteCommand({ TableName: name(table), Key: keyFor(table, key) }));
    },
    /** Reads pages until `limit` items or the end. Eventually consistent reads cost half. */
    async query(table, { index, pkAttr, pkValue, skAttr, order = 'asc', limit = 500 }) {
      const items = [];
      let start;
      do {
        const out = await doc.send(new QueryCommand({
          TableName: name(table),
          IndexName: index || undefined,
          KeyConditionExpression: '#p = :v',
          ExpressionAttributeNames: { '#p': pkAttr },
          ExpressionAttributeValues: { ':v': pkValue },
          ScanIndexForward: order !== 'desc',
          ExclusiveStartKey: start,
          Limit: Math.min(limit - items.length, 500),
        }));
        items.push(...(out.Items || []));
        start = out.LastEvaluatedKey;
      } while (start && items.length < limit);
      void skAttr;      // the sort order comes from the index's own sort key
      return items;
    },
  };
}
