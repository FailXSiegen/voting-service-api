import mysql from "promise-mysql";
import humps from "humps";
// Wir entfernen den child_process Import, da wir keine Server-Admin-Befehle ausführen werden

const config = {
  host: process.env.DATABSE_HOST,
  port: process.env.DATABSE_PORT,
  user: process.env.DATABSE_USER,
  password: process.env.DATABSE_PASSWORD,
  database: process.env.DATABSE_NAME,
  connectionLimit: 800,
  trace: process.env.ENABLE_DEBUG === "1",
  acquireTimeout: 30000,   // 30 Sekunden Timeout für Verbindungsaufbau
  connectTimeout: 30000,   // 30 Sekunden Timeout für initiale Verbindung
  waitForConnections: true, // Wartet auf verfügbare Verbindungen statt Fehler zu werfen
  queueLimit: 0,           // Keine Begrenzung der Warteschlange (0 = unbegrenzt)
};

// Einfacher Semaphor für die Begrenzung der gleichzeitigen Datenbankverbindungen
const MAX_CONCURRENT_CONNECTIONS = 800; // Maximale gleichzeitige Verbindungen
let currentActiveConnections = 0;
const pendingConnections = [];

// Track failed connections to implement a circuit breaker pattern
let failedConnections = 0;
let lastResetTime = Date.now();
let isInCooldownPeriod = false;
let cooldownEndTime = 0;

/**
 * Implementierung eines einfachen Circuit Breakers für Datenbankverbindungen
 * - Verfolgt fehlgeschlagene Verbindungsversuche
 * - Bei zu vielen Fehlern in kurzer Zeit: Cooldown-Periode aktivieren
 * - Während der Cooldown-Periode: Künstliche Verzögerung bei neuen Verbindungen
 */
function trackConnectionFailure(errorCode) {
  // Nur bestimmte Fehler zählen (host blockiert, Verbindungsfehler)
  const trackableErrors = ['ER_HOST_IS_BLOCKED', 'ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'];
  
  if (!trackableErrors.includes(errorCode)) {
    return; // Andere Fehler nicht verfolgen
  }
  
  // Zurücksetzen des Zählers nach einer bestimmten Zeit
  const now = Date.now();
  if (now - lastResetTime > 60000) { // 1 Minute
    failedConnections = 0;
    lastResetTime = now;
  }
  
  // Fehler zählen
  failedConnections++;
  
  // Wenn zu viele Fehler auftreten, Cooldown-Periode aktivieren
  if (failedConnections > 10 && !isInCooldownPeriod) {
    isInCooldownPeriod = true;
    cooldownEndTime = now + 30000; // 30 Sekunden Cooldown
    console.warn(`[WARN:DATABASE] Activating connection cooldown period for 30 seconds due to multiple failures`);
  }
}

/**
 * Prüft, ob wir uns in einer Cooldown-Periode befinden und wartet gegebenenfalls
 * @returns {Promise<void>}
 */
async function handleConnectionCooldown() {
  if (!isInCooldownPeriod) {
    return; // Keine Cooldown-Periode aktiv
  }
  
  const now = Date.now();
  
  // Prüfen, ob die Cooldown-Periode abgelaufen ist
  if (now >= cooldownEndTime) {
    isInCooldownPeriod = false;
    failedConnections = 0;
    console.log(`[INFO:DATABASE] Connection cooldown period ended`);
    return;
  }
  
  // Während der Cooldown-Periode: Verzögerung bei neuen Verbindungsversuchen
  const remainingCooldown = cooldownEndTime - now;
  const delayTime = Math.min(remainingCooldown, 5000); // Maximal 5 Sekunden Verzögerung
  
  console.log(`[INFO:DATABASE] In connection cooldown. Delaying new connection by ${delayTime}ms`);
  await new Promise(resolve => setTimeout(resolve, delayTime));
}

// Hilfsfunktion zum Warten auf eine verfügbare Verbindung
async function waitForAvailableConnection() {
  if (currentActiveConnections < MAX_CONCURRENT_CONNECTIONS) {
    currentActiveConnections++;
    return;
  }

  // Wenn das Limit erreicht ist, warten wir
  return new Promise(resolve => {
    pendingConnections.push(resolve);
  });
}

// Hilfsfunktion zum Freigeben einer Verbindung
function releaseConnection() {
  if (pendingConnections.length > 0) {
    // Eine wartende Anfrage fortsetzen
    const nextResolve = pendingConnections.shift();
    nextResolve();
  } else {
    // Zähler zurücksetzen
    currentActiveConnections--;
  }
}

function logQuery(sql, params) {
  if (process.env.LOG_QUERIES_TO_CONSOLE !== "1") {
    return;
  }
  console.debug("BEGIN-------------------------------------");
  console.debug("SQL:", sql);
  console.debug("PARAMS:", JSON.stringify(params));
  console.debug("END---------------------------------------");
}

/**
 * Executes a SQL query and returns the raw result
 * @param {string} sql - The SQL query to execute
 * @param {Array} params - The parameters for the query
 * @param {Object} options - Additional options
 * @param {boolean} options.throwError - If true, throws errors instead of returning null
 * @returns {Promise<Object|null>} - The query result or null if it failed
 */
export async function baseQuery(sql, params, options = {}) {
  const { throwError = false } = options;
  let connection;
  logQuery(sql, params);

  // Auf eine verfügbare Verbindung warten
  await waitForAvailableConnection();

  try {
    // Prüfe auf Cooldown-Periode und handle sie
    await handleConnectionCooldown();
    
    // Verzögerung bei vielen aktiven Verbindungen einbauen
    if (currentActiveConnections > MAX_CONCURRENT_CONNECTIONS * 0.8) {
      const delayMs = 25 + Math.floor(Math.random() * 75); // 25-100ms Verzögerung
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // Implementiere Wiederholungslogik bei Verbindungsfehlern
    let retries = 5; // Erhöhe die Anzahl der Wiederholungsversuche
    let lastError = null;
    
    while (retries > 0) {
      try {
        // Vor jedem Verbindungsversuch nochmal auf Cooldown prüfen
        if (retries < 5) { // Nicht beim ersten Versuch
          await handleConnectionCooldown();
        }
        
        // Exponentielles Backoff für wiederholte Versuche
        if (retries < 5) { // Nicht beim ersten Versuch
          const backoffDelay = Math.pow(2, 5 - retries) * 100; // 200ms, 400ms, 800ms, 1600ms
          const jitter = Math.floor(Math.random() * 100); // 0-100ms zufällige Verzögerung
          await new Promise(resolve => setTimeout(resolve, backoffDelay + jitter));
        }
        
        // Verbindung herstellen
        connection = await mysql.createConnection(config);
        
        // Hauptabfrage ausführen
        const result = await connection.query(sql, params);
        
        // Bei Erfolg: Verbindung schließen und Ergebnis zurückgeben
        return result;
      } catch (err) {
        lastError = err;
        
        // Bei einem Fehler: Nachverfolgung für den Circuit Breaker aktualisieren
        if (err.code) {
          trackConnectionFailure(err.code);
        }
        
        // ER_HOST_IS_BLOCKED-Fehler behandeln
        if (err.code === 'ER_HOST_IS_BLOCKED') {
          console.warn(`[WARN:DATABASE] Host is blocked. Retrying with increasing delay. Attempts left: ${retries-1}`);
          
          // Längere Wartezeit für HOST_IS_BLOCKED-Fehler
          const blockDelay = Math.pow(2, 5 - retries) * 500; // 500ms bis 8s
          await new Promise(resolve => setTimeout(resolve, blockDelay));
          
          // Schließe vorherige Verbindung, falls vorhanden
          if (connection) {
            try {
              await connection.end();
              connection = null;
            } catch (endErr) {
              // Ignoriere Fehler beim Schließen
            }
          }
          
          retries--;
          continue;
        }
        
        // Bei anderen Verbindungsfehlern auch erneut versuchen
        if (err.code && (
            err.code === 'ECONNREFUSED' || 
            err.code === 'ETIMEDOUT' || 
            err.code === 'PROTOCOL_CONNECTION_LOST' ||
            err.code === 'ENOTFOUND' ||
            err.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR')) {
          console.warn(`[WARN:DATABASE] Connection error (${err.code}). Retrying with delay. Attempts left: ${retries-1}`);
          
          // Warte und versuche es erneut (exponential backoff mit Jitter)
          const connectionDelay = Math.pow(2, 5 - retries) * 200;
          const jitter = Math.floor(Math.random() * 100);
          await new Promise(resolve => setTimeout(resolve, connectionDelay + jitter));
          
          // Schließe vorherige Verbindung, falls vorhanden
          if (connection) {
            try {
              await connection.end();
              connection = null;
            } catch (endErr) {
              // Ignoriere Fehler beim Schließen
            }
          }
          
          retries--;
          continue;
        }
        
        // Bei anderen Fehlern nach dem ersten Versuch nochmal versuchen
        if (retries === 5) {
          console.warn(`[WARN:DATABASE] Query error: ${err.message}. Retrying once.`);
          retries--;
          
          // Schließe vorherige Verbindung, falls vorhanden
          if (connection) {
            try {
              await connection.end();
              connection = null;
            } catch (endErr) {
              // Ignoriere Fehler beim Schließen
            }
          }
          
          continue;
        }
        
        // Bei anderen Fehlern nach wiederholten Versuchen abbrechen
        break;
      }
    }
    
    // Wenn wir hier ankommen, sind alle Wiederholungsversuche fehlgeschlagen
    console.error(`[ERROR:DATABASE] Query failed after ${5-retries} retries: ${lastError ? lastError.message : 'Unknown error'}`, lastError);
    
    if (throwError) {
      throw lastError || new Error('Database query failed after multiple retries');
    }
    
    return null;
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (err) {
        console.error(`[ERROR:DATABASE] Error closing connection:`, err);
      }
    }

    // Verbindung freigeben
    releaseConnection();
  }
}

/**
 * Executes a SQL query and returns the camelized result for SELECTs
 * @param {string} sql - The SQL query to execute
 * @param {Array} params - The parameters for the query
 * @param {Object} options - Additional options
 * @param {boolean} options.throwError - If true, throws errors instead of returning null
 * @returns {Promise<Array|Object|null>} - The query result or null if it failed or no rows were returned
 */
export async function query(sql, params, options = {}) {
  const result = await baseQuery(sql, params, options);

  if (!result) {
    return null;
  }

  // If this is a SELECT query (has rows property), return camelized results
  if (result.length !== undefined) {
    // Immer ein Array zurückgeben, auch wenn es leer ist
    return humps.camelizeKeys(result);
  }

  // For non-SELECT queries (INSERT, UPDATE, DELETE), return the raw result
  return result;
}

/**
 * Inserts a record into the specified table
 * @param {string} table - The name of the table
 * @param {Object} input - The data to insert (in camelCase)
 * @param {boolean} [returnCompleteResult=false] - If true, returns the complete result object instead of just insertId
 * @returns {Promise<number|Object|null>} - The insertId of the created record, or null if insertion failed
 */
export async function insert(table, input, returnCompleteResult = false) {
  input = humps.decamelizeKeys(input);
  try {
    const properties = [];
    const values = [];
    Object.keys(input).forEach((property) => {
      properties.push(property);
      values.push(input[property]);
    });
    const fieldsList = properties.join(",");
    const sql = `INSERT INTO ${table} (${fieldsList}) VALUES (?)`;
    const result = await baseQuery(sql, [values]);

    if (!result) {
      console.error(`[ERROR:DATABASE] Insert into ${table} failed - no result returned`);
      return null;
    }

    return returnCompleteResult ? result : (result.insertId || null);
  } catch (err) {
    console.error(`[ERROR:DATABASE] Insert into ${table} failed:`, err);
    return null;
  }
}

/**
 * Updates a record in the specified table
 * @param {string} table - The name of the table
 * @param {Object} input - The data to update (in camelCase), must include id field
 * @param {string} [idField='id'] - The name of the ID field (default is 'id')
 * @returns {Promise<boolean>} - True if update was successful, false otherwise
 */
export async function update(table, input, idField = 'id') {
  if (!input || !input[idField]) {
    console.error(`[ERROR:DATABASE] Update ${table} failed: Missing ${idField} field in input`);
    return false;
  }

  let inputCopy = JSON.parse(JSON.stringify(input));
  const id = parseInt(inputCopy[idField]);
  delete inputCopy[idField];
  inputCopy = humps.decamelizeKeys(inputCopy);

  try {
    const sql = `UPDATE ${table} SET ? WHERE ${humps.decamelize(idField)} = ?`;
    const result = await baseQuery(sql, [inputCopy, id]);

    if (!result) {
      console.error(`[ERROR:DATABASE] Update ${table} failed - no result returned for id ${id}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[ERROR:DATABASE] Update ${table} failed for id ${id}:`, err);
    return false;
  }
}

/**
 * Removes a record from the specified table
 * @param {string} table - The name of the table
 * @param {number|string} id - The ID of the record to delete
 * @param {string} [idField='id'] - The name of the ID field (default is 'id')
 * @returns {Promise<boolean>} - True if removal was successful, false otherwise
 */
export async function remove(table, id, idField = 'id') {
  if (!id) {
    console.error(`[ERROR:DATABASE] Remove from ${table} failed: Missing ID`);
    return false;
  }

  try {
    const idColumn = humps.decamelize(idField);
    const sql = `DELETE FROM ${table} WHERE ${idColumn} = ?`;
    const result = await baseQuery(sql, [id]);

    if (!result) {
      console.error(`[ERROR:DATABASE] Remove from ${table} failed - no result returned for id ${id}`);
      return false;
    }

    // Check if any rows were affected
    return result.affectedRows > 0;
  } catch (err) {
    console.error(`[ERROR:DATABASE] Remove from ${table} failed for id ${id}:`, err);
    return false;
  }
}
