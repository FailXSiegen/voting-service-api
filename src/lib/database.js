import mysql from "promise-mysql";
import humps from "humps";

const config = {
  host: process.env.DATABSE_HOST,
  port: process.env.DATABSE_PORT,
  user: process.env.DATABSE_USER,
  password: process.env.DATABSE_PASSWORD,
  database: process.env.DATABSE_NAME,
  connectionLimit: 100,
  trace: process.env.ENABLE_DEBUG === "1",
};

function logQuery(sql, params) {
  if (process.env.LOG_QUERIES_TO_CONSOLE !== "1") {
    return;
  }
  console.debug("BEGIN-------------------------------------");
  console.debug("SQL:", sql);
  console.debug("PARAMS:", JSON.stringify(params));
  console.debug("END---------------------------------------");
}

export async function baseQuery(sql, params) {
  let connection;
  logQuery(sql, params);
  try {
    connection = await mysql.createConnection(config);
    return await connection.query(sql, params);
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

export async function query(sql, params) {
  const result = await baseQuery(sql, params);
  return result?.length > 0 ? humps.camelizeKeys(result) : null;
}

export async function insert(table, input) {
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
    return result.insertId || null;
  } catch (err) {
    console.error(err);
  }
}

export async function update(table, input) {
  let inputCopy = JSON.parse(JSON.stringify(input));
  const id = parseInt(inputCopy.id);
  delete inputCopy.id;
  inputCopy = humps.decamelizeKeys(inputCopy);
  try {
    const sql = `UPDATE ${table} SET ? WHERE id  = ?`;
    await query(sql, [inputCopy, id]);
  } catch (err) {
    console.error(err);
  }
}

export async function remove(table, id) {
  try {
    const sql = `DELETE FROM ${table} WHERE id  = ?`;
    await query(sql, [id]);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}
