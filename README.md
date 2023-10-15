# voting-service-api

GraphQL API

## Before install

Create a `.env` file and fill out your system variables.

```shell
mv .env.dist .env
```

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
npm run serve
````

## Application specific CLI scripts

You need to provide a .env file with all required data. Only run scripts from within the root of the project
(The place where the .env file resides).

### Setup and update the database

```shell script
npm run db:migrate
```

### Create a new organizer using cli

```shell script
node bin/create-organizer.js --username="admin" --email="admin@domain.tld" --password="12345678" --public-name="Admin"
```

> All arguments are required!