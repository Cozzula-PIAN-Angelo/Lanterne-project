import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const SIGNED_URL_TTL_SEC = 300;

export type MediaStorage = {
  /** URL di upload legato a dimensione e tipo: un file diverso viene rifiutato dallo storage. */
  signUpload(input: {
    key: string;
    mime: string;
    bytes: number;
  }): Promise<{ url: string; headers: Record<string, string> }>;
  signRead(key: string): Promise<string>;
  stat(key: string): Promise<{ bytes: number; mime: string } | null>;
  remove(key: string): Promise<void>;
  ensureBucket(): Promise<void>;
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} mancante (vedi .env.example)`);
  return value;
}

function errorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}

export function createStorage(env: NodeJS.ProcessEnv): MediaStorage {
  const Bucket = required(env, "S3_BUCKET");
  const clientFor = (endpoint: string) =>
    new S3Client({
      endpoint,
      region: required(env, "S3_REGION"),
      credentials: {
        accessKeyId: required(env, "S3_ACCESS_KEY"),
        secretAccessKey: required(env, "S3_SECRET_KEY"),
      },
      forcePathStyle: true,
      // Il checksum predefinito finirebbe nell'URL firmato e il browser non può rispettarlo.
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  const server = clientFor(required(env, "S3_ENDPOINT"));
  // L'host fa parte della firma: gli URL devono nascere con l'indirizzo visto dal browser.
  const publicClient = clientFor(required(env, "S3_PUBLIC_ENDPOINT"));

  return {
    async signUpload({ key, mime, bytes }) {
      const url = await getSignedUrl(
        publicClient,
        new PutObjectCommand({ Bucket, Key: key, ContentType: mime, ContentLength: bytes }),
        {
          expiresIn: SIGNED_URL_TTL_SEC,
          signableHeaders: new Set(["content-type", "content-length"]),
        },
      );
      return { url, headers: { "Content-Type": mime } };
    },

    signRead(key) {
      return getSignedUrl(publicClient, new GetObjectCommand({ Bucket, Key: key }), {
        expiresIn: SIGNED_URL_TTL_SEC,
      });
    },

    async stat(key) {
      try {
        const head = await server.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { bytes: head.ContentLength ?? 0, mime: head.ContentType ?? "" };
      } catch (error) {
        if (errorName(error) === "NotFound") return null;
        throw error;
      }
    },

    async remove(key) {
      await server.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    async ensureBucket() {
      try {
        await server.send(new CreateBucketCommand({ Bucket }));
      } catch (error) {
        const name = errorName(error);
        if (name !== "BucketAlreadyOwnedByYou" && name !== "BucketAlreadyExists") throw error;
      }
    },
  };
}
