import { makeExecutableSchema } from '@graphql-tools/schema'
import typeDefs from '../../res/schema.graphql'
import resolvers from '../graphql/resolvers'
import authenticate from '../middleware/authenticate'
import { createServer, useExtendContext, createPubSub } from '@graphql-yoga/node'



// Configure and create the server instance.
export const pubsub = createPubSub()


export const options = {
  port: process.env.APP_PORT,
  hostname: process.env.APP_DOMAIN,
  // endpoint: process.env.GRAPHQL_ENDPOINT, // new yoga version does not like this option
  logging: true,
  maskedErrors: false,
  plugins: [useExtendContext(() => ({ pubsub }))],
}

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
  resolverValidationOptions: {},
  parseOptions: {},
  inheritResolversFromInterfaces: false
})

export const context = { pubsub }

export const graphQlserver = createServer({
  schema,
  authenticate,
  ...options
})
