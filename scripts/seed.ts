import "dotenv/config";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("I dati demo non si caricano in produzione.");
  }
  // Prima di importare auth: il login demo si decide quando il modulo viene caricato.
  Object.assign(process.env, { NODE_ENV: process.env.NODE_ENV ?? "development", DEMO_LOGIN: "true" });

  const { systemClock } = await import("@/lib/clock/clock");
  const { db } = await import("@/lib/db/client");
  const { seedDemoData } = await import("@/lib/demo/seed");

  await seedDemoData(db, systemClock.now());
  console.log("Dati demo pronti: giulia@, marco@ e sara@lanterne.local.");
}

main()
  // Il pool del database terrebbe aperto il processo: si esce esplicitamente.
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
