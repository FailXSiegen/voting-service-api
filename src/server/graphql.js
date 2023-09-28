import { makeExecutableSchema } from '@graphql-tools/schema'
import typeDefs from '../../res/schema.graphql'
import resolvers from '../graphql/resolvers'
import { createYoga, useExtendContext, createPubSub } from 'graphql-yoga'

export const pubsub = createPubSub()

export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
  resolverValidationOptions: {},
  parseOptions: {},
  inheritResolversFromInterfaces: false
})

export const context = { pubsub }

export const yoga = createYoga({
  schema,
  port: process.env.APP_PORT,
  hostname: process.env.APP_DOMAIN,
  logging: true,
  maskedErrors: false,
  plugins: [useExtendContext(() => ({ pubsub }))],
  graphqlEndpoint: process.env.GRAPHQL_ENDPOINT,
  graphiql: {
    subscriptionsProtocol: 'WS'
  }
})
