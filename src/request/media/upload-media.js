'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const mediaRepository = require('../../repository/media/media-repository');

// Konfiguration für Multer (Datei-Upload)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Verwende Umgebungsvariable für Upload-Pfad oder Standard-Entwicklungspfad
    const uploadBasePath = process.env.UPLOAD_BASE_PATH ||
      path.join(__dirname, '../../../../voting-service-client-v2/public');

    // Erstelle vollständigen Pfad mit uploads/images
    const uploadDir = path.join(uploadBasePath, 'uploads/images');

    // Stelle sicher, dass das Verzeichnis existiert
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generiere eindeutigen Dateinamen mit UUID und behalte die Originaldateiendung
    const fileExt = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExt}`;
    cb(null, fileName);
  }
});

// Upload-Filter: Nur Bilder erlauben
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Nur Bilddateien sind erlaubt (JPEG, PNG, GIF, WebP, SVG)'), false);
  }
};

// Größenlimit: 5MB
const limits = {
  fileSize: 5 * 1024 * 1024
};

// Multer-Upload-Funktion mit Konfiguration
const upload = multer({
  storage,
  fileFilter,
  limits
}).single('file');

/**
 * Handler für Media-Upload
 * @param {Object} req - Express Request
 * @param {Object} res - Express Response
 */
module.exports = async function (req, res) {
  // Multer-Upload durchführen
  upload(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({
        error: true,
        message: err.message || 'Fehler beim Hochladen der Datei'
      });
    }

    try {
      // Wenn keine Datei vorhanden
      if (!req.file) {
        return res.status(400).json({
          error: true,
          message: 'Keine Datei ausgewählt'
        });
      }

      // Pfad relativ zum public-Verzeichnis für den Client
      const clientPath = `/uploads/images/${req.file.filename}`;

      // Speichere in der Datenbank die Metadaten
      const mediaData = {
        filename: req.file.originalname,
        path: clientPath,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        createdBy: req.user?.organizer?.id || null
      };

      // Speichere in Datenbank
      const savedMedia = await mediaRepository.create(mediaData);

      // Erfolgreiche Antwort mit Daten für den Client
      return res.status(200).json({
        id: savedMedia.id,
        filename: savedMedia.filename,
        url: savedMedia.path,
        mimeType: savedMedia.mimeType,
        fileSize: savedMedia.fileSize,
        uploadedAt: savedMedia.createdAt
      });
    } catch (error) {
      console.error('Media upload error:', error);
      return res.status(500).json({
        error: true,
        message: 'Serverfehler beim Verarbeiten des Uploads'
      });
    }
  });
};