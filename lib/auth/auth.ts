import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db/client";
import { sendMail } from "@/lib/mail/mailer";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  user: {
    additionalFields: {
      color: { type: "string", required: false },
      timezone: { type: "string", required: false, defaultValue: "UTC" },
      allowSaving: { type: "boolean", required: false, defaultValue: true },
    },
  },
  emailAndPassword: {
    // Il login demo non deve mai essere attivo in produzione.
    enabled: process.env.DEMO_LOGIN === "true" && process.env.NODE_ENV !== "production",
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
