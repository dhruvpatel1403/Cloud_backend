import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const snsClient = new SNSClient({
  region: process.env.AWS_REGION,
});

export async function publishEvent(event) {
  const command = new PublishCommand({
    TopicArn: process.env.SNS_TOPIC_ARN,
    Message: JSON.stringify(event),
  });

  await snsClient.send(command);
}
