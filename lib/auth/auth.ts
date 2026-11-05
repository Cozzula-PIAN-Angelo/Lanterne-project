import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db/client";
import { sendMail } from "@/lib/mail/mailer";
import { isDemoLoginEnabled } from "./demo";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  user: {
    // input: false → non modificabili dalle API di Better Auth (sign-up, update-user):
    // si scrivono solo da saveProfile, che li valida.
    additionalFields: {
      color: { type: "string", required: false, input: false },
      timezone: { type: "string", required: false, defaultValue: "UTC", input: false },
      allowSaving: { type: "boolean", required: false, defaultValue: true, input: false },
    },
  },
  emailAndPassword: {
    // Il login demo non deve mai essere attivo in produzione.
    enabled: isDemoLoginEnabled(process.env),
  },
  rateLimit: { enabled: true, storage: "database" },
  plugins: [
    magicLink({
      expiresIn: 900,
      sendMagicLink: async ({ email, url }) => {
        await sendMail({
          to: email,
          subject: "Il tuo link per entrare in Lanterne",
          text: `Apri questo link per entrare (vale 15 minuti):\n${url}`,
          html: `<p>Apri questo link per entrare (vale 15 minuti):</p><p><a href="${url}">Entra in Lanterne</a></p>`,
        });
      },
    }),
    nextCookies(),
  ],
});
