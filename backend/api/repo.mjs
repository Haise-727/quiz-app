/**
 * The real storage: ONE DynamoDB table (quizlike-main) with three shared indexes, behind the four calls the service uses
 * (get, put, remove, query). How documents are laid out in it is in single-table.mjs, which the tests run on an in memory
 * store. This file is only the DynamoDB end of that.
 *
 * The table is PROVISIONED at a tiny capacity (infra/lib/data-stack.js) so the free allowance cannot be exceeded. When it
 * is full DynamoDB answers "throttled" instead of charging. The SDK retries a few times by itself; if it still fails the
 * handler returns 503 and the app can try again.
 *
 * The AWS SDK for JavaScript v3 ships inside the Lambda Node runtime, so nothing is bundled here.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { createSingleTableRepo } from './single-table.mjs';

export function createDynamoStore({ tableName = 'quizlike-main', client } = {}) {
  const doc = DynamoDBDocumentClient.from(client || new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return {
    async get(pk, sk) {
      const out = await doc.send(new GetCommand({ TableName: tableName, Key: { pk, sk }, ConsistentRead: false }));
      return out.Item || null;
    },
    async put(stored) {
      await doc.send(new PutCommand({ TableName: tableName, Item: stored }));
    },
    async remove(pk, sk) {
      await doc.send(new DeleteCommand({ TableName: tableName, Key: { pk, sk } }));
    },
    /** Reads pages until `limit` items or the end. Eventually consistent reads cost half. */
    async query({ index, keyName, keyValue, forward, limit }) {
      const items = [];
      let start;
      do {
        const out = await doc.send(new QueryCommand({
          TableName: tableName,
          IndexName: index || undefined,
          KeyConditionExpression: '#k = :v',
          ExpressionAttributeNames: { '#k': keyName },
          ExpressionAttributeValues: { ':v': keyValue },
          ScanIndexForward: forward,
          ExclusiveStartKey: start,
          Limit: Math.min(limit - items.length, 500),
        }));
        items.push(...(out.Items || []));
        start = out.LastEvaluatedKey;
      } while (start && items.length < limit);
      return items;
    },
  };
}

export function createDynamoRepo({ tableName = 'quizlike-main', client } = {}) {
  return createSingleTableRepo(createDynamoStore({ tableName, client }));
}
