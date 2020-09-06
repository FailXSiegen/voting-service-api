import 'dotenv/config'
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

// Configure and create the server instance.
const context = { pubsub: new PubSub() }
const server = new GraphQLServer({
  typeDefs,
  resolvers,
  context,
  middlewares: [authenticate]
})
const options = {
  port: process.env.APP_PORT,
  endpoint: '/graphql',
  subscriptions: '/subscriptions',
  playground: '/playground',
  debug: process.env.ENABLE_DEBUG === '1',
  formatError
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

// Start the server.
server.start(options, ({ port }) => {
  console.info(
    `Graphql Server started, listening on port ${port} for incoming requests.`
  )
})
