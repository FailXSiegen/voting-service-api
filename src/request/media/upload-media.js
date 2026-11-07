'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const mediaRepository = require('../../repository/media/media-repository');

// SEC-20: Typ und Endung ausschließlich aus den Magic Bytes; kein SVG/HTML.
const SIGNATURES = [
  {
    ext: 'png',
    mime: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: 'gif',
    mime: 'image/gif',
    test: (b) => /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1')),
  },
  {
    ext: 'webp',
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

const detectImage = (buffer) =>
  buffer && buffer.length >= 12
    ? SIGNATURES.find((signature) => signature.test(buffer))
    : undefined;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
}).single('file');

const uploadDir = () => path.join(process.env.UPLOAD_BASE_PATH || '/app/uploads', 'images');

// Originalname nur als Anzeige-Metadatum, ohne Pfadanteile/Steuerzeichen.
const displayName = (name) =>
  path
    .basename(String(name || 'upload'))
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .slice(0, 200);

/**
 * Handler für Media-Upload
 * @param {Object} req - Express Request
 * @param {Object} res - Express Response
 */
module.exports = async function (req, res) {
  upload(req, res, async (err) => {
    if (err) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? 'Datei ist zu groß (max. 5 MB)' : 'Fehler beim Hochladen';
      return res.status(400).json({ error: true, message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: true, message: 'Keine Datei ausgewählt' });
      }

      const type = detectImage(req.file.buffer);
      if (!type) {
        return res.status(400).json({
          error: true,
          message: 'Nur Bilddateien sind erlaubt (JPEG, PNG, GIF, WebP)',
        });
      }

      const dir = uploadDir();
      await fs.promises.mkdir(dir, { recursive: true });
      const fileName = `${uuidv4()}.${type.ext}`;
      await fs.promises.writeFile(path.join(dir, fileName), req.file.buffer, { flag: 'wx' });

      const savedMedia = await mediaRepository.create({
        filename: displayName(req.file.originalname),
        path: `/uploads/images/${fileName}`,
        mimeType: type.mime,
        fileSize: req.file.size,
        createdBy: req.user?.organizer?.id || null,
      });

      return res.status(200).json({
        id: savedMedia.id,
        filename: savedMedia.filename,
        url: savedMedia.path,
        mimeType: savedMedia.mimeType,
        fileSize: savedMedia.fileSize,
        uploadedAt: savedMedia.createdAt,
      });
    } catch (error) {
      console.error('Media upload error:', error.message);
      return res.status(500).json({
        error: true,
        message: 'Serverfehler beim Verarbeiten des Uploads',
      });
    }
  });
};
