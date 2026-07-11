import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

const BUCKET = process.env.S3_BUCKET_NAME;
if (!BUCKET) {
  throw new Error("S3_BUCKET_NAME environment variable is required");
}

const s3 = new S3Client({});

function attachmentKey(contractId: string): string {
  return `attachments/${contractId}.pdf`;
}

export async function uploadAttachment(contractId: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: attachmentKey(contractId),
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Returns a readable stream of the attachment body, for piping directly into an HTTP response. */
export async function getAttachmentStream(contractId: string): Promise<Readable> {
  const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: attachmentKey(contractId) }));
  return result.Body as Readable;
}

export async function deleteAttachmentObject(contractId: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: attachmentKey(contractId) }));
}
