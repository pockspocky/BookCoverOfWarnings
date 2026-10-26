import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { and, eq } from 'drizzle-orm'
import { ApiError } from '../../../lib/types/errors'
import type { Actor } from '../auth/actor'
import type { Database } from '../db/client'
import { evidence, evidenceAttachments, uploadTickets } from '../db/schema'
import type { Env } from '../env'
import { iso, newId } from '../util'
import { hashSecret, newSecret } from '../auth/tokens'

export interface ObjectStorage {
  ensureBucket(): Promise<void>
  presignPut(key: string, contentType: string, sizeBytes: number): Promise<string>
  presignGet(key: string, fileName: string): Promise<string>
}

export interface AttachmentScanner {
  inspect(input: { fileName: string; contentType: string; sizeBytes: number }): Promise<void>
}

export function createMetadataScanner(maxBytes: number, allowed: string[]): AttachmentScanner {
  const types = new Set(allowed.map((item) => item.toLowerCase()))
  return {
    async inspect(input) {
      if (!types.has(input.contentType.toLowerCase())) {
        throw ApiError.validation('This file type is not allowed.', { contentType: ['This file type is not allowed.'] })
      }
      if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > maxBytes) {
        throw ApiError.validation('File exceeds the size limit.', { sizeBytes: ['File exceeds the size limit.'] })
      }
      if (!input.fileName || input.fileName.length > 200 || input.fileName.includes('/') || input.fileName.includes('\\') || input.fileName.includes('..')) {
        throw ApiError.validation('File name is invalid.', { fileName: ['File name is invalid.'] })
      }
    }
  }
}

function unavailable() {
  return new ApiError({ code: 'INTERNAL', status: 503, message: 'Object storage is not configured.' })
}

export function createS3Storage(env: Env): ObjectStorage {
  if (!env.s3Endpoint || !env.s3AccessKey || !env.s3SecretKey) {
    return {
      async ensureBucket() {},
      async presignPut() {
        throw unavailable()
      },
      async presignGet() {
        throw unavailable()
      }
    }
  }
  const client = new S3Client({
    region: env.s3Region,
    endpoint: env.s3Endpoint,
    forcePathStyle: env.s3ForcePathStyle,
    credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey }
  })
  return {
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: env.s3Bucket }))
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: env.s3Bucket }))
      }
    },
    presignPut(key, contentType, sizeBytes) {
      return getSignedUrl(client, new PutObjectCommand({
        Bucket: env.s3Bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes
      }), { expiresIn: 300 })
    },
    presignGet(key, fileName) {
      return getSignedUrl(client, new GetObjectCommand({
        Bucket: env.s3Bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"`
      }), { expiresIn: 120 })
    }
  }
}

export async function authorizeUpload(db: Database, storage: ObjectStorage, scanner: AttachmentScanner, actor: Actor, evidenceId: string, payload: { fileName?: unknown; contentType?: unknown; sizeBytes?: unknown }) {
  const fileName = String(payload.fileName ?? '')
  const contentType = String(payload.contentType ?? '')
  const sizeBytes = Number(payload.sizeBytes)
  await scanner.inspect({ fileName, contentType, sizeBytes })
  const rows = await db.select({ id: evidence.id, status: evidence.status }).from(evidence).where(eq(evidence.id, evidenceId)).limit(1)
  if (!rows[0] || rows[0].status === 'archived') throw ApiError.notFound('Evidence not found.')
  const attachmentId = newId()
  const objectKey = `attachments/${evidenceId}/${attachmentId}`
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
  await db.insert(evidenceAttachments).values({
    id: attachmentId,
    evidenceId,
    fileName,
    contentType,
    sizeBytes,
    authorized: true,
    objectKey,
    createdAt: new Date()
  })
  const uploadToken = newSecret()
  await db.insert(uploadTickets).values({
    id: newId(),
    tokenHash: hashSecret(uploadToken),
    evidenceId,
    attachmentId,
    accountId: actor.id,
    expiresAt,
    createdAt: new Date()
  })
  const url = await storage.presignPut(objectKey, contentType, sizeBytes)
  return { uploadToken, expiresAt: iso(expiresAt), url, method: 'PUT' as const }
}

export async function authorizeDownload(db: Database, storage: ObjectStorage, evidenceId: string, attachmentId: string) {
  const rows = await db.select({
    id: evidenceAttachments.id,
    fileName: evidenceAttachments.fileName,
    authorized: evidenceAttachments.authorized,
    objectKey: evidenceAttachments.objectKey
  }).from(evidenceAttachments).where(and(
    eq(evidenceAttachments.id, attachmentId),
    eq(evidenceAttachments.evidenceId, evidenceId)
  )).limit(1)
  const row = rows[0]
  if (!row) throw ApiError.notFound('Attachment not found.')
  if (!row.authorized || !row.objectKey) throw ApiError.forbidden('Attachment retrieval is not authorized.')
  return { url: await storage.presignGet(row.objectKey, row.fileName), fileName: row.fileName }
}
