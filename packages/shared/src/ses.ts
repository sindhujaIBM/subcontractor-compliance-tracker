import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

let client: SESClient | null = null;

function getSes(): SESClient {
  if (!client) {
    client = new SESClient({ region: 'us-east-1' }); // SES is not available in ca-west-1
  }
  return client;
}

export async function sendReminderEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  const fromEmail = process.env.SES_FROM_EMAIL || '"ClearComply Compliance Bot" <noreply@maidlink.ca>';
  const configSet = process.env.SES_CONFIG_SET;

  await getSes().send(
    new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: params.subject },
        Body: { Text: { Data: params.body } },
      },
      ...(configSet ? { ConfigurationSetName: configSet } : {}),
    })
  );
}
