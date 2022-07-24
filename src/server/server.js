import 'dotenv/config'
import 'regenerator-runtime'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { query } from '../lib/database'
// import * as http from 'http'
import addStandaloneRequests from './standalone-requests'
import { context, graphQlserver, options, schema } from './graphql'
import { createHandler } from 'graphql-sse';

export default function () {
  resetEventUserOnlineState()
  const sseHandler = createHandler({ schema });
  const app = express()

  // Add middlewares.
  app.use(cors({
    credentials: true,
    origin: process.env.CORS_ORIGIN,
    methods: ['GET', 'POST']
  }))
  app.use((req, res, next) => {
    context.req = req
    next()
  })
  app.use(cookieParser(process.env.COOKIE_SIGN_SECRET))
  app.use(express.json())

  // Additional routes.
  addStandaloneRequests(app)
  app.use('/sse', sseHandler);
  app.use('/graphql', graphQlserver)

  // app.get('/sse', sse)

  // const server = http.createServer(app)

  app.listen(options.port, () => {
    console.log('----------------------------')
    console.log('Voting service API')
    console.log('----------------------------')
    console.log(`Running API at http://localhost:${options.port}/graphql`)
    console.log(`Running API at http://localhost:${options.port}/sse`)
  })
}

function resetEventUserOnlineState () {
  // Set each event user to offline on server start up.
  query('UPDATE event_user SET online = ?', [false]).catch((error) => {
    console.error(error)
  })
}
