const typeDefs = `
schema {
  query: Query
}
type Query {
  hello(name: String!): String
}
`;

export default typeDefs;
