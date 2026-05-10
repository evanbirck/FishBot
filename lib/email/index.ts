import "server-only";

import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { ServerEnv } from "@/lib/env";

export type EmailMessage = {
  subject: string;
  text: string;
};

export type EmailSendResult = {
  providerMessageId: string | null;
  status: "sent" | "skipped";
};

export async function sendEmail(env: ServerEnv, message: EmailMessage): Promise<EmailSendResult> {
  if (!env.ENABLE_EMAIL) return { providerMessageId: null, status: "skipped" };
  if (!env.GMAIL_SMTP_USER || !env.GMAIL_APP_PASSWORD || !env.EMAIL_TO) {
    throw new Error("Gmail SMTP email is enabled but not fully configured.");
  }

  const transport = nodemailer.createTransport({
    host: env.GMAIL_SMTP_HOST,
    port: env.GMAIL_SMTP_PORT,
    secure: env.GMAIL_SMTP_PORT === 465,
    auth: {
      user: env.GMAIL_SMTP_USER,
      pass: env.GMAIL_APP_PASSWORD
    }
  } satisfies SMTPTransport.Options);

  const result = await transport.sendMail({
    from: env.EMAIL_FROM || env.GMAIL_SMTP_USER,
    to: env.EMAIL_TO,
    subject: message.subject,
    text: message.text
  });

  return {
    providerMessageId: result.messageId ?? null,
    status: "sent"
  };
}
