console.log(process.env)
const resolvers = {
  Query: {
    hello: (_, args, context) => {
      return `Hello ${args.name}`
    }
  }
}

export default resolvers
