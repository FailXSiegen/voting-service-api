import organizerQueries from './resolvers/query/organizer'

const resolvers = {
  Query: {
    hello: (_, args, context) => {
      return `Hello ${args.name}`
    },
    ...organizerQueries
  }
}

export default resolvers
