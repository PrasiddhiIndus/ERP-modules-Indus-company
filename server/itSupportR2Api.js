/**
 * IT Support ticket attachments — browser → Express → Cloudflare R2.
 * Keys: it-support/<ticketId>/<timestamp>-filename
 */
import multer from 'multer';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const KEY_PREFIX = 'it-support/';
const MAX_BYTES = 10 * 1024 * 1024;
const PRESIGN_GET_EXPIRES_SEC = 600;

const ALLOWED_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'xlsx', 'xls', 'doc', 'docx', 'txt', 'csv', 'zip']);
const EXT_TO_CONTENT_TYPE = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
};

function sanitizeFileName(name) {
  return String(name || 'file')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
}

function fileExt(name) {
  const m = String(name || '')
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim()
  );
}

function resolveContentType(fileName, contentType) {
  const ext = fileExt(fileName);
  if (!ALLOWED_EXT.has(ext)) {
    const err = new Error(`File type not allowed. Allowed: ${[...ALLOWED_EXT].join(', ')}`);
    err.status = 400;
    throw err;
  }
  const trimmed = String(contentType || '')
    .trim()
    .toLowerCase();
  if (trimmed && trimmed !== 'application/octet-stream') return trimmed;
  return EXT_TO_CONTENT_TYPE[ext] || 'application/octet-stream';
}

function normalizeObjectKey(raw) {
  return String(raw || '')
    .trim()
    .replace(/^\/+/, '');
}

/**
 * @param {import('express').Express} app
 * @param {{ requireAuth: Function, requireItSupportR2: Function, getR2Client: Function, getR2Bucket: Function }} deps
 */
export function registerItSupportR2Routes(app, { requireAuth, requireItSupportR2, getR2Client, getR2Bucket }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES },
  });

  app.post(
    '/api/it-support/r2/upload',
    (req, res, next) => {
      upload.single('file')(req, res, (err) => {
        if (!err) {
          next();
          return;
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ message: `File too large (max ${MAX_BYTES} bytes).` });
          return;
        }
        res.status(400).json({ message: err.message || 'Upload failed.' });
      });
    },
    requireAuth,
    requireItSupportR2,
    async (req, res) => {
      try {
        const ticketId = String(req.body?.ticketId || '').trim();
        if (!isUuidLike(ticketId)) {
          return res.status(400).json({ message: 'ticketId must be a UUID.' });
        }
        const rawName = String(req.body?.fileName || req.file?.originalname || '').trim();
        if (!rawName) return res.status(400).json({ message: 'fileName is required.' });
        if (!req.file?.buffer) {
          return res.status(400).json({ message: 'file is required (multipart field name: file).' });
        }

        const contentTypeHint = String(req.body?.contentType || req.file.mimetype || '').trim();
        const resolvedType = resolveContentType(rawName, contentTypeHint || null);
        const safeName = sanitizeFileName(rawName);
        const objectKey = `${KEY_PREFIX}${ticketId}/${Date.now()}-${safeName}`;
        const bucket = getR2Bucket();
        const client = getR2Client();
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: objectKey,
            Body: req.file.buffer,
            ContentType: resolvedType,
          })
        );
        res.json({ objectKey, bucket, contentType: resolvedType });
      } catch (err) {
        const status = Number(err?.status) || 500;
        res.status(status).json({ message: err?.message || 'Upload failed.' });
      }
    }
  );

  app.post('/api/it-support/r2/presign-get', requireAuth, requireItSupportR2, async (req, res) => {
    try {
      const objectKey = normalizeObjectKey(req.body?.objectKey);
      if (!objectKey.startsWith(KEY_PREFIX) || objectKey.includes('..') || objectKey.includes('//')) {
        return res.status(400).json({ message: 'Invalid object key.' });
      }
      const bucket = getR2Bucket();
      const client = getR2Client();
      const getUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), {
        expiresIn: PRESIGN_GET_EXPIRES_SEC,
      });
      res.json({ getUrl });
    } catch (err) {
      const status = Number(err?.status) || 500;
      res.status(status).json({ message: err?.message || 'Could not create download link.' });
    }
  });

  app.post('/api/it-support/r2/delete', requireAuth, requireItSupportR2, async (req, res) => {
    try {
      const objectKey = normalizeObjectKey(req.body?.objectKey);
      if (!objectKey.startsWith(KEY_PREFIX) || objectKey.includes('..') || objectKey.includes('//')) {
        return res.status(400).json({ message: 'Invalid object key.' });
      }
      const bucket = getR2Bucket();
      const client = getR2Client();
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
      res.json({ ok: true });
    } catch (err) {
      const status = Number(err?.status) || 500;
      res.status(status).json({ message: err?.message || 'Delete failed.' });
    }
  });
}
