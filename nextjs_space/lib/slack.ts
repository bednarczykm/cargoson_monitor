import { prisma } from "@/lib/db";

interface AlertData {
  id?: string;
  recipientName: string;
  city: string;
  carrier: string;
  apiPrice: number;
  priceListPrice: number;
  difference: number;
  percentDiff: number;
}

// Detect if the input is a webhook URL or email address
function isWebhookUrl(input: string): boolean {
  return input.startsWith("https://hooks.slack.com/");
}

function isEmailAddress(input: string): boolean {
  return input.includes("@") && !input.startsWith("http");
}

export async function sendSlackNotification(
  slackDestination: string,
  alerts: AlertData[]
): Promise<{ success: boolean; error?: string }> {
  if (!slackDestination) {
    return { success: false, error: "Brak skonfigurowanego adresu Slack" };
  }

  // Route to appropriate method
  if (isWebhookUrl(slackDestination)) {
    return sendViaWebhook(slackDestination, alerts);
  } else if (isEmailAddress(slackDestination)) {
    return sendViaEmail(slackDestination, alerts);
  } else {
    return { success: false, error: "Nieprawidłowy adres Slack (użyj webhook URL lub adresu email kanału)" };
  }
}

// Send via Slack webhook
async function sendViaWebhook(
  webhookUrl: string,
  alerts: AlertData[]
): Promise<{ success: boolean; error?: string }> {
  const message = formatSlackWebhookMessage(alerts);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      await logNotification("slack-webhook", alerts[0]?.id, message.text, "error", errorText);
      return { success: false, error: `Slack webhook error: ${errorText}` };
    }

    await logNotification("slack-webhook", alerts[0]?.id, message.text, "success");
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    await logNotification("slack-webhook", alerts[0]?.id, message.text, "error", errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Send via email (Slack email integration)
async function sendViaEmail(
  emailAddress: string,
  alerts: AlertData[]
): Promise<{ success: boolean; error?: string }> {
  const { subject, htmlBody, plainText } = formatEmailMessage(alerts);

  try {
    const appUrl = process.env.NEXTAUTH_URL || "";
    const appName = appUrl ? new URL(appUrl).hostname.split(".")[0] : "Cargoson Monitor";

    const response = await fetch("https://apps.abacus.ai/api/sendNotificationEmail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        app_id: process.env.WEB_APP_ID,
        notification_id: process.env.NOTIF_ID_ALERT_CENOWY,
        subject,
        body: htmlBody,
        is_html: true,
        recipient_email: emailAddress,
        sender_email: appUrl ? `noreply@${new URL(appUrl).hostname}` : undefined,
        sender_alias: appName,
      }),
    });

    const result = await response.json();
    
    if (!result.success) {
      if (result.notification_disabled) {
        await logNotification("slack-email", alerts[0]?.id, plainText, "success", "Notification disabled by user");
        return { success: true };
      }
      await logNotification("slack-email", alerts[0]?.id, plainText, "error", result.message || "Email API error");
      return { success: false, error: result.message || "Błąd wysyłania email" };
    }

    await logNotification("slack-email", alerts[0]?.id, plainText, "success");
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    await logNotification("slack-email", alerts[0]?.id, plainText, "error", errorMsg);
    return { success: false, error: errorMsg };
  }
}

function formatEmailMessage(alerts: AlertData[]): { subject: string; htmlBody: string; plainText: string } {
  if (alerts.length === 1) {
    const alert = alerts[0];
    const diffIcon = alert.difference > 0 ? "📈" : "📉";
    
    return {
      subject: `🚨 Alert cenowy: ${alert.recipientName} - ${alert.carrier}`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px;">
            🚨 Alert cenowy - Cargoson Monitor
          </h2>
          <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px 0; font-weight: bold;">Odbiorca:</td><td>${alert.recipientName}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: bold;">Miejscowość:</td><td>${alert.city}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: bold;">Przewoźnik:</td><td>${alert.carrier}</td></tr>
              <tr><td style="padding: 8px 0; font-weight: bold;">Cena API:</td><td>${alert.apiPrice.toFixed(2)} PLN</td></tr>
              <tr><td style="padding: 8px 0; font-weight: bold;">Cena cennik:</td><td>${alert.priceListPrice.toFixed(2)} PLN</td></tr>
              <tr><td style="padding: 8px 0; font-weight: bold;">Różnica:</td><td style="color: ${alert.difference > 0 ? '#dc2626' : '#16a34a'}; font-weight: bold;">${diffIcon} ${alert.difference > 0 ? '+' : ''}${alert.difference.toFixed(2)} PLN (${alert.percentDiff.toFixed(2)}%)</td></tr>
            </table>
          </div>
          <p style="color: #666; font-size: 12px;">Wygenerowano: ${new Date().toLocaleString('pl-PL')}</p>
        </div>
      `,
      plainText: `🚨 Alert cenowy dla ${alert.recipientName}: ${alert.carrier} - różnica ${alert.difference.toFixed(2)} PLN`,
    };
  }

  // Multiple alerts
  const alertRows = alerts.map(a => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 8px;">${a.recipientName}</td>
      <td style="padding: 8px;">${a.city}</td>
      <td style="padding: 8px;">${a.carrier}</td>
      <td style="padding: 8px; color: ${a.difference > 0 ? '#dc2626' : '#16a34a'}; font-weight: bold;">
        ${a.difference > 0 ? '+' : ''}${a.difference.toFixed(2)} PLN
      </td>
    </tr>
  `).join('');

  return {
    subject: `🚨 Wykryto ${alerts.length} alertów cenowych`,
    htmlBody: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h2 style="color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px;">
          🚨 Wykryto ${alerts.length} alertów cenowych
        </h2>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 10px; text-align: left;">Odbiorca</th>
              <th style="padding: 10px; text-align: left;">Miasto</th>
              <th style="padding: 10px; text-align: left;">Przewoźnik</th>
              <th style="padding: 10px; text-align: left;">Różnica</th>
            </tr>
          </thead>
          <tbody>
            ${alertRows}
          </tbody>
        </table>
        <p style="color: #666; font-size: 12px;">Wygenerowano: ${new Date().toLocaleString('pl-PL')}</p>
      </div>
    `,
    plainText: `🚨 Wykryto ${alerts.length} alertów cenowych`,
  };
}

interface SlackMessage {
  text: string;
  blocks?: Array<{
    type: string;
    text?: { type: string; text: string };
    fields?: Array<{ type: string; text: string }>;
  }>;
}

function formatSlackWebhookMessage(alerts: AlertData[]): SlackMessage {
  if (alerts.length === 1) {
    const alert = alerts[0];
    const diffIcon = alert.difference > 0 ? "📈" : "📉";
    return {
      text: `🚨 Wykryto rozbieżność cenową dla ${alert.recipientName}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🚨 Alert cenowy - Cargoson Monitor",
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Odbiorca:*\n${alert.recipientName}` },
            { type: "mrkdwn", text: `*Miejscowość:*\n${alert.city}` },
            { type: "mrkdwn", text: `*Przewoźnik:*\n${alert.carrier}` },
            { type: "mrkdwn", text: `*Cena API:*\n${alert.apiPrice.toFixed(2)} PLN` },
            { type: "mrkdwn", text: `*Cena cennik:*\n${alert.priceListPrice.toFixed(2)} PLN` },
            { type: "mrkdwn", text: `*Różnica:*\n${diffIcon} ${alert.difference.toFixed(2)} PLN (${alert.percentDiff.toFixed(2)}%)` },
          ],
        },
      ],
    };
  }

  // Multiple alerts
  const alertLines = alerts.map(
    (a) =>
      `• *${a.recipientName}* (${a.city}) - ${a.carrier}: ${a.difference > 0 ? "+" : ""}${a.difference.toFixed(2)} PLN (${a.percentDiff.toFixed(2)}%)`
  );

  return {
    text: `🚨 Wykryto ${alerts.length} rozbieżności cenowych`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🚨 Wykryto ${alerts.length} alertów cenowych`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: alertLines.join("\n"),
        },
      },
    ],
  };
}

export async function sendTestSlackNotification(
  slackDestination: string
): Promise<{ success: boolean; error?: string }> {
  const testAlert: AlertData = {
    recipientName: "Test Odbiorca",
    city: "Warszawa",
    carrier: "DHL Express - Test",
    apiPrice: 150.00,
    priceListPrice: 120.00,
    difference: 30.00,
    percentDiff: 25.00,
  };

  return sendSlackNotification(slackDestination, [testAlert]);
}

async function logNotification(
  type: string,
  alertId: string | undefined,
  message: string,
  status: string,
  error?: string
): Promise<void> {
  try {
    await prisma.notificationLog.create({
      data: {
        type,
        alertId: alertId || null,
        message: message.substring(0, 500), // Limit message length
        status,
        error: error || null,
      },
    });
  } catch (e) {
    console.error("Failed to log notification:", e);
  }
}
