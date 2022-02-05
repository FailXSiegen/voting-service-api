import 'dotenv/config'
import 'regenerator-runtime'
import typeDefs from '../res/schema.graphql'
import express from 'express'
import resolvers from './graphql/resolvers'
import cors from 'cors'
import { formatError } from 'apollo-errors'
import cookieParser from 'cookie-parser'
import authenticate from './middleware/authenticate'
import cleanUp from './request/cleanup'
import loginRequest from './request/login'
import loginRefreshRequest from './request/login/refresh'
import verifySlug from './request/event/verify-slug'
import requestVerifyPassword from './request/login/verify-password'
import requestPasswordForgot from './request/organizer/password-forgot'
import updateOrganizerPassword from './request/organizer/update-password'
import downloadPollResultCsv from './request/event/export-results'
import createOrganizer from './request/organizer/create'
// import { extractCookieValueByHeader } from './lib/cookie-from-string-util'
// import { toggleUserOnlineStateByRequestToken } from './repository/event-user-repository'
import logoutRequest from './request/logout'
import validateOrganizerHashRequest from './request/organizer/validate-hash'
import { query } from './lib/database'
import { createServer, createPubSub } from '@graphql-yoga/node'
import { makeExecutableSchema } from '@graphql-tools/schema'
import * as http from 'http'

// Set each event user to offline on server start up.
query('UPDATE event_user SET online = ?', [false]).catch((error) => {
  console.error(error)
})

// Configure and create the server instance.
export const pubsub = createPubSub()

const options = {
  port: process.env.APP_PORT,
  endpoint: process.env.GRAPHQL_ENDPOINT,
  playground: process.env.PLAYGROUND_ENDPOINT,
  debug: process.env.ENABLE_DEBUG === '1',
  formatError
  // subscriptions: {
  //   path: process.env.SUBSCRIPTIONS_ENDPOINT,
  //   onConnect: async (connectionParams, webSocket, context) => {
  //     if (!context.request.headers.cookie) {
  //       return
  //     }
  //     const token = extractCookieValueByHeader(context.request.headers.cookie,
  //       'refreshToken')
  //     if (token === null) {
  //       return
  //     }
  //     const tokenRecord = await toggleUserOnlineStateByRequestToken(token, true)
  //     if (!tokenRecord) {
  //       return
  //     }
  //     await pubsub.publish('eventUserLifeCycle', {
  //       eventUserLifeCycle: {
  //         online: true,
  //         eventUserId: tokenRecord.eventUserId
  //       }
  //     })
  //   },
  //   onDisconnect: async (webSocket, context) => {
  //     if (!context.request.headers.cookie) {
  //       return
  //     }
  //     const token = extractCookieValueByHeader(context.request.headers.cookie,
  //       'refreshToken')
  //     if (token === null) {
  //       return
  //     }
  //     const tokenRecord = await toggleUserOnlineStateByRequestToken(token,
  //       false)
  //     if (!tokenRecord) {
  //       return
  //     }
  //     await pubsub.publish('eventUserLifeCycle', {
  //       eventUserLifeCycle: {
  //         online: false,
  //         eventUserId: tokenRecord.eventUserId
  //       }
  //     })
  //   }
  // }
}

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
  logger: null,
  resolverValidationOptions: {},
  parseOptions: {},
  inheritResolversFromInterfaces: false
})

const context = { pubsub }

const graphQlserver = createServer({
  schema,
  authenticate,
  ...options,
  context
})

const app = express()

// Add middlewares.
app.use(cors({ credentials: true, origin: process.env.CORS_ORIGIN }))
app.use((req, res, next) => {
  context.req = req
  next()
})
app.use(cookieParser(process.env.COOKIE_SIGN_SECRET))
app.use(express.json())

// Additional routes.
app.post('/login', async (req, res) => {
  await loginRequest(req, res)
})
app.post('/login/refresh', async (req, res) => {
  await loginRefreshRequest(req, res)
})
app.post('/login/password-verify', async (req, res) => {
  await requestVerifyPassword(req, res)
})
app.post('/event/verify-slug', async (req, res) => {
  await verifySlug(req, res)
})
app.post('/event/export-results', async (req, res) => {
  await downloadPollResultCsv(req, res)
})
app.post('/organizer/validate-hash', async (req, res) => {
  await validateOrganizerHashRequest(req, res)
})
app.post('/organizer/password-forgot', async (req, res) => {
  await requestPasswordForgot(req, res)
})
app.post('/organizer/update-password', async (req, res) => {
  await updateOrganizerPassword(req, res)
})
app.get('/logout', async (req, res) => {
  await logoutRequest(req, res)
})
app.post('/create', async (req, res) => {
  await createOrganizer(req, res)
})
app.post('/cleanup', async (req, res) => {
  await cleanUp(req, res)
})

const server = http.createServer(app)

app.use('/graphql', graphQlserver.requestListener)

server.listen(options.port, () => {
  console.log(`Graphql Server started, listening on port ${options.port} for incoming requests.`)
})
