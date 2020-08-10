const resolvers = {
  Query: {
    hello: (root, args) => {
      return 'Hello ' + args.name
    },
  }
};

export default resolvers;