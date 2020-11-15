# voting-service-api

GraphQL API

## Install the application

````shell script
npm install
````

## Build for production

````shell script
npm run build
````

## Run DEV server

````shell script
npm run dev
````

## Application specific CLI scripts

You need to provide a .env file with all required data. Only run scripts from within the root of the project
(The place where the .env file resides).

### Create SQL schema

```shell script
npm run create-schema
```

### Register new organizer using cli

- First build the project with `npm run build`.
- Next run the following command in the root of the project:
```shell script
node dist/console/register-organizer.js --username="example" --email="example@domain.tld" --password="12345678" --public-name="Example Public"
```

> All arguments are required!
