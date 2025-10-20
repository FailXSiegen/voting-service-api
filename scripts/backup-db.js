#!/usr/bin/env node

/**
 * Database Backup Script
 *
 * Creates a compressed MySQL backup with timestamp
 * Usage: npm run db:backup
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Konfiguration
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
const backupDir = path.join(__dirname, '../backups');
const backupFile = path.join(backupDir, `backup-${timestamp}.sql.gz`);

// Backup-Verzeichnis erstellen
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
  console.log('✓ Backup directory created');
}

// Datenbankverbindung aus .env
const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: process.env.DATABASE_PORT || '3306',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'application'
};

console.log(`Starting backup of database: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`);
console.log(`Backup file: ${backupFile}`);

// mysqldump Command mit Kompression
const command = `mysqldump \
  -h ${dbConfig.host} \
  -P ${dbConfig.port} \
  -u ${dbConfig.user} \
  ${dbConfig.password ? `-p${dbConfig.password}` : ''} \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  ${dbConfig.database} | gzip > "${backupFile}"`;

// Backup ausführen
exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error('✗ Backup failed:', error.message);
    if (stderr) console.error('Error details:', stderr);
    process.exit(1);
  }

  // Dateigröße ermitteln
  const stats = fs.statSync(backupFile);
  const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log('✓ Backup successfully created!');
  console.log(`  File: ${backupFile}`);
  console.log(`  Size: ${fileSizeInMB} MB`);
  console.log(`  Date: ${new Date().toLocaleString()}`);
});
