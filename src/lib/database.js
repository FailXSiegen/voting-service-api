import mariadb from 'mariadb'

const pool = mariadb.createPool({
  host: process.env.DATABSE_HOST,
  port: process.env.DATABSE_PORT,
  user: process.env.DATABSE_USER,
  password: process.env.DATABSE_PASSWORD,
  database: process.env.DATABSE_NAME,
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
