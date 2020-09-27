import 'dotenv/config'
import 'regenerator-runtime'
import typeDefs from '../res/schema.graphql'
import * as express from 'express'
import resolvers from './graphql/resolvers'
import { GraphQLServer, PubSub } from 'graphql-yoga'
import cors from 'cors'
import { formatError } from 'apollo-errors'
import cookieParser from 'cookie-parser'
import authenticate from './middleware/authenticate'
import loginRequest from './request/login'
import loginRefreshRequest from './request/login/refresh'
import verifySlug from './request/event/verify-slug'
import { extractCookieValueByHeader } from './lib/cookie-from-string-util'
import { toggleUserOnlineStateByRequestToken } from './repository/event-user-repository'
import logoutRequest from './request/logout'
import { query } from './lib/database'

// Set each event user to offline on server start up.
query('UPDATE event_user SET online = ?', [false]).catch((error) => {
  console.error(error)
})

// Configure and create the server instance.
export const pubsub = new PubSub()
const context = { pubsub }
const server = new GraphQLServer({
  typeDefs,
  resolvers,
  context,
  middlewares: [authenticate]
})

const options = {
  port: process.env.APP_PORT,
  endpoint: '/graphql',
  playground: '/playground',
  debug: process.env.ENABLE_DEBUG === '1',
  formatError,
  subscriptions: {
    path: '/subscriptions',
    onConnect: async (connectionParams, webSocket, context) => {
      if (!context.request.headers.cookie) {
        return
      }
      const token = extractCookieValueByHeader(context.request.headers.cookie, 'refreshToken')
      if (token === null) {
        return
      }
      const tokenRecord = await toggleUserOnlineStateByRequestToken(token, true)
      if (!tokenRecord) {
        return
      }
      pubsub.publish('eventUserLifeCycle', {
        eventUserLifeCycle: {
          online: true,
          eventUserId: tokenRecord.eventUserId
        }
      })
    },
    onDisconnect: async (webSocket, context) => {
      if (!context.request.headers.cookie) {
        return
      }
      const token = extractCookieValueByHeader(context.request.headers.cookie, 'refreshToken')
      if (token === null) {
        return
      }
      const tokenRecord = await toggleUserOnlineStateByRequestToken(token, false)
      if (!tokenRecord) {
        return
      }
      pubsub.publish('eventUserLifeCycle', {
        eventUserLifeCycle: {
          online: false,
          eventUserId: tokenRecord.eventUserId
        }
      })
    }
  }
}

// Add middlewares.
server.express.use(cors({ credentials: true, origin: process.env.CORS_ORIGIN }))
server.express.use((req, res, next) => {
  context.req = req
  next()
})
server.express.use(cookieParser(process.env.COOKIE_SIGN_SECRET))
server.express.use(express.json())

// Additional routes.
server.express.post('/login', async (req, res) => {
  await loginRequest(req, res)
})
server.express.post('/login/refresh', async (req, res) => {
  await loginRefreshRequest(req, res)
})
server.express.post('/event/verify-slug', async (req, res) => {
  await verifySlug(req, res)
})
server.express.get('/logout', async (req, res) => {
  await logoutRequest(req, res)
})

// Start the server.
server.start(options, ({ port }) => {
  console.info(
    `Graphql Server started, listening on port ${port} for incoming requests.`
  )
})
