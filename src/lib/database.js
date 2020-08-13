import mariadb from 'mariadb'
import {
  DATABSE_HOST,
  DATABSE_PORT,
  DATABSE_USER,
  DATABSE_PASSWORD,
  DATABSE_NAME
} from 'babel-dotenv'

const pool = mariadb.createPool({
  host: DATABSE_HOST,
  port: DATABSE_PORT,
  user: DATABSE_USER,
  password: DATABSE_PASSWORD,
  database: DATABSE_NAME,
  connectionLimit: 5
})

async function query (sql, params) {
  const client = await pool.getConnection()
  try {
    const result = await client.query(sql, params)
    delete result.meta
    return result
  } catch (err) {
    console.error(err)
  } finally {
    client.release()
  }
}

export default query
