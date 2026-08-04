// POST /api/identify — take an audio clip, return a normalized match.
//
// This route speaks our contract only. It does not know which provider answered, and it
// never forwards an upstream body: provider errors become a generic 502 here, and the
// detail goes to our logs.

import { Router } from 'express';
import multer from 'multer';
import { identify } from '../services/index.js';
import { UpstreamError } from '../services/upstream-error.js';
import { perDay, perHour } from '../middleware/rateLimit.js';

// Memory storage, deliberately. CLAUDE.md: captured audio is never written to disk, because
// the privacy policy promises we do not retain it. A 5s webm/opus clip is ~40KB; the 2MB
// cap is generous headroom that still bounds what a single request can allocate.
const MAX_BYTES = 2 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_BYTES },
});

const router = Router();

// Multer errors arrive as exceptions from its middleware, so they are caught here rather
// than in the app-level handler where the size limit would lose its context.
function receiveClip(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'file_too_large',
        message: `Audio clip exceeds the ${MAX_BYTES / 1024 / 1024}MB limit.`,
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Send exactly one audio clip in a field named "file".',
      });
    }
    return next(err);
  });
}

router.post('/identify', perHour, perDay, receiveClip, async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'no_file',
      message: 'Send an audio clip in a multipart field named "file".',
    });
  }

  try {
    const result = await identify(req.file.buffer, req.file.originalname || 'clip.webm');

    // A miss is a successful request. 200 { found: false }, never a 404 — the request was
    // understood and answered; the catalogue simply had nothing.
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof UpstreamError) {
      console.error(`[identify] upstream failure: ${err.detail}`);
      return res.status(502).json({
        error: 'upstream_unavailable',
        message: 'Song identification is unavailable right now. Please try again.',
      });
    }
    return next(err);
  }
});

export default router;
