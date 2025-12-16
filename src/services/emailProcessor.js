import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({ region: process.env.AWS_REGION });

export const handler = async (event) => {
  for (const record of event.Records) {
    const message = JSON.parse(record.body);

    let subject = "";
    let body = "";

    switch (message.type) {
      case "USER_REGISTERED":
        subject = "Welcome!";
        body = `Hi ${message.name}, welcome to our platform!`;
        break;

      case "USER_LOGIN":
        subject = "Login Alert";
        body = "You have successfully logged in.";
        break;

      case "ORDER_PLACED":
        subject = "Order Confirmation";
        body = `Your order ${message.orderId} has been placed successfully.`;
        break;

      default:
        console.log("Unknown message type");
        continue;
    }

    await ses.send(
      new SendEmailCommand({
        Source: process.env.FROM_EMAIL,
        Destination: { ToAddresses: [message.email] },
        Message: {
          Subject: { Data: subject },
          Body: {
            Text: { Data: body },
          },
        },
      })
    );
  }
};
