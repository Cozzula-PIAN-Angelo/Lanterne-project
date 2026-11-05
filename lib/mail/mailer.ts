import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: false,
});

export type Mail = { to: string; subject: string; text: string; html: string };

export async function sendMail({ to, subject, text, html }: Mail): Promise<void> {
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? "Lanterne <ciao@lanterne.local>",
    to,
    subject,
    text,
    html,
  });
}
