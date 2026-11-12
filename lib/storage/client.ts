import "server-only";
import { createStorage } from "./s3";

export const storage = createStorage(process.env);
