#!/usr/bin/env node

/**
 * Database Restore Script
 *
 * Restores a MySQL database from a backup file
 * Usage: npm run db:restore <backup-file>
 * Example: npm run db:restore backups/backup-2025-10-20T14-30-00.sql.gz
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
require('dotenv').config();

// Argument parsen
const backupFile = process.argv[2];

if (!backupFile) {
  console.error('✗ Error: No backup file specified');
  console.log('\nUsage:');
  console.log('  npm run db:restore <backup-file>');
  console.log('\nExample:');
  console.log('  npm run db:restore backups/backup-2025-10-20T14-30-00.sql.gz');
  console.log('\nAvailable backups:');

  const backupDir = path.join(__dirname, '../backups');
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.sql.gz') || f.endsWith('.sql'))
      .sort()
      .reverse();

    if (files.length > 0) {
      files.forEach(file => {
        const stats = fs.statSync(path.join(backupDir, file));
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`  - ${file} (${sizeMB} MB)`);
      });
    } else {
      console.log('  No backups found');
    }
  }
  process.exit(1);
}

// Backup-Datei überprüfen
const backupPath = path.isAbsolute(backupFile)
  ? backupFile
  : path.join(__dirname, '..', backupFile);

if (!fs.existsSync(backupPath)) {
  console.error(`✗ Error: Backup file not found: ${backupPath}`);
  process.exit(1);
}

// Datenbankverbindung aus .env
const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: process.env.DATABASE_PORT || '3306',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'application'
};

console.log('⚠️  WARNING: This will OVERWRITE the current database!');
console.log(`Database: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`);
console.log(`Backup file: ${backupPath}`);
console.log('');

// Bestätigung einholen
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Do you want to continue? (yes/no): ', (answer) => {
  rl.close();

  if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
    console.log('Restore cancelled');
    process.exit(0);
  }

  console.log('Starting database restore...');

  // Command je nach Dateityp
  let command;
  if (backupPath.endsWith('.gz')) {
    // Komprimiertes Backup
    command = `gunzip < "${backupPath}" | mysql \
      -h ${dbConfig.host} \
      -P ${dbConfig.port} \
      -u ${dbConfig.user} \
      ${dbConfig.password ? `-p${dbConfig.password}` : ''} \
      ${dbConfig.database}`;
  } else {
    // Unkomprimiertes Backup
    command = `mysql \
      -h ${dbConfig.host} \
      -P ${dbConfig.port} \
      -u ${dbConfig.user} \
      ${dbConfig.password ? `-p${dbConfig.password}` : ''} \
      ${dbConfig.database} < "${backupPath}"`;
  }

  // Restore ausführen
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('✗ Restore failed:', error.message);
      if (stderr) console.error('Error details:', stderr);
      process.exit(1);
    }

    console.log('✓ Database successfully restored!');
    console.log(`  Database: ${dbConfig.database}`);
    console.log(`  From: ${backupPath}`);
    console.log(`  Date: ${new Date().toLocaleString()}`);
  });
});
