const typeDefs = `
type Query {
  hello: String!
}
type Counter {
  count: Int!
  countStr: String
}
type Subscription {
  counter: Counter!
}
`

export default typeDefs
