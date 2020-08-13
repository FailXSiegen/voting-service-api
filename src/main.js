import typeDefs from './graphql/schema.graphql'
import resolvers from './graphql/resolvers'
import { GraphQLServer, PubSub } from 'graphql-yoga'
import { APP_PORT } from 'babel-dotenv'

const pubsub = new PubSub()
const server = new GraphQLServer({
  typeDefs,
  resolvers,
  context: {
    pubsub
  }
})
const options = {
  port: APP_PORT,
  endpoint: '/graphql',
  subscriptions: '/subscriptions',
  playground: '/playground'
}

server.start(options, ({ port }) => {
  console.log(
    `Graphql Server started, listening on port ${port} for incoming requests.`
  )
})
