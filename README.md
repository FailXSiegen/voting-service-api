# voting-service-api

GraphQL API for [Voting Service Client](https://github.com/FailXSiegen/voting-service-client-v2).

## System requirements

* node `>=16.16.0`
* npm `>=8.19.2`
* mariadb `^10`
* E-Mail provider

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

### Setup and update the database

```shell script
npm run db:migrate
```

### Create a new organizer using cli

Make sure that the application is running before you execute this script.

```shell script
node bin/create-organizer.js --username="admin" --email="admin@domain.tld" --password="12345678" --public-name="Admin"
```

> All arguments are required!