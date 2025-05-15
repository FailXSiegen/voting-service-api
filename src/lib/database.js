import mysql from "promise-mysql";
import humps from "humps";

const config = {
  host: process.env.DATABSE_HOST,
  port: process.env.DATABSE_PORT,
  user: process.env.DATABSE_USER,
  password: process.env.DATABSE_PASSWORD,
  database: process.env.DATABSE_NAME,
  connectionLimit: 800,
  trace: process.env.ENABLE_DEBUG === "1",
};

// Einfacher Semaphor für die Begrenzung der gleichzeitigen Datenbankverbindungen
const MAX_CONCURRENT_CONNECTIONS = 800; // Maximal 50 gleichzeitige Verbindungen
let currentActiveConnections = 0;
const pendingConnections = [];

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
    // Verzögerung bei vielen aktiven Verbindungen einbauen
    if (currentActiveConnections > MAX_CONCURRENT_CONNECTIONS * 0.8) {
      const delayMs = 25 + Math.floor(Math.random() * 75); // 50-200ms Verzögerung
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    connection = await mysql.createConnection(config);
    const result = await connection.query(sql, params);
    return result;
  } catch (err) {
    console.error(`[ERROR:DATABASE] Query failed: ${err.message}`, err);
    if (throwError) {
      throw err;
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
