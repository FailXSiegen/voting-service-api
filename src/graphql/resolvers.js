const resolvers = {
  Query: {
    hello: () => 'Hello'
  },
  Counter: {
    countStr: counter => `Current count: ${counter.count}`
  },
  Subscription: {
    counter: {
      subscribe: (parent, args, context) => {
        const channel = Math.random().toString(36).substring(2, 15) // random channel name
        let count = 0
        setInterval(() => context.pubsub.publish(channel, { counter: { count: count++ } }), 2000)
        return context.pubsub.asyncIterator(channel)
      }
    }
  }
}

export default resolvers
