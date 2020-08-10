import typeDefs from './graphql/typedefs'
import resolvers from './graphql/resolvers'
import { GraphQLServer, PubSub } from 'graphql-yoga'

const pubsub = new PubSub()

const server = new GraphQLServer({
  typeDefs,
  resolvers,
  context: {
    pubsub
  }
})

server.start(() => console.log('Server is running on localhost:4000'))
