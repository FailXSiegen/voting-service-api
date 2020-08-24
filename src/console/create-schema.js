import 'dotenv/config'
import 'regenerator-runtime'
import fs from 'fs'
import path from 'path'
import { query } from '../lib/database'

const filePath = path.join(__dirname, '/../../res/schema.sql')

fs.readFile(filePath, 'utf8', async function (error, data) {
  if (error) {
    return console.error(error)
  }
  const queries = data.split(';')
  for await (const sql of queries) {
    if (sql === '') {
      continue
    }
    console.log('[NOW RUNNING SQL] ' + sql)
    await query(sql).catch((error) => {
      console.error(error)
      process.exit()
    })
  }
  console.log('Import completed')
  process.exit()
})
