import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  // Do NOT include access keys in Learner Lab
});

const ddb = DynamoDBDocumentClient.from(client);

export default ddb;
