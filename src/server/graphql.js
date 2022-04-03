import { makeExecutableSchema } from '@graphql-tools/schema'
import typeDefs from '../../res/schema.graphql'
import resolvers from '../graphql/resolvers'
import authenticate from '../middleware/authenticate'
import { createServer, createPubSub } from '@graphql-yoga/node'

export const options = {
  port: process.env.APP_PORT,
  endpoint: process.env.GRAPHQL_ENDPOINT,
  logging: true,
  maskedErrors: false
}

// Configure and create the server instance.
export const pubsub = createPubSub()

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
  // logger: null,
  resolverValidationOptions: {},
  parseOptions: {},
  inheritResolversFromInterfaces: false
})

export const context = { pubsub }

export const graphQlserver = createServer({
  schema,
  authenticate,
  ...options,
  context
})
