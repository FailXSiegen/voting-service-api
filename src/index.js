import 'dotenv/config'
import typeDefs from './graphql/schema.graphql'
import resolvers from './graphql/resolvers'
import { GraphQLServer, PubSub } from 'graphql-yoga'
import cors from 'cors'
import session from 'express-session'
import { formatError } from 'apollo-errors'

// Configure and create the server instance.
const pubsub = new PubSub()
var context = {
  pubsub
}
const server = new GraphQLServer({
  typeDefs,
  resolvers,
  context
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
server.express.use(session({ secret: process.env.SESSION_SECRET }))
server.express.use(cors())
server.express.use((req, res, next) => {
  context.req = req
  next()
})

// Finally start the server.
server.start(options, ({ port }) => {
  console.log(
    `Graphql Server started, listening on port ${port} for incoming requests.`
  )
})
