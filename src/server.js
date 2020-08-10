import express from 'express';
import { graphqlExpress } from 'apollo-server-express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { makeExecutableSchema } from 'graphql-tools';
import typeDefs from './graphql/typedefs';
import resolvers from './graphql/resolvers';

const schema = makeExecutableSchema({ typeDefs, resolvers });

const app = express();

app.use(cors());

app.use('/graphql', 
  bodyParser.json(), 
  graphqlExpress(() => ({ 
    schema,
    context: {}
  }))
);

app.listen(4000, () => {
  console.log('Go to http://localhost:4000/graphiql to run queries!');
});