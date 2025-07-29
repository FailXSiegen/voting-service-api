require("dotenv/config");
const parseArgs = require("minimist");
const mysql = require("promise-mysql");
const humps = require("humps");
const argon2 = require("argon2");

const config = {
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  connectionLimit: 100,
  trace: process.env.ENABLE_DEBUG === "1",
};

(async () => {
  const argv = parseArgs(process.argv.slice(2));

  // Build organizer object by arguments.
  const organizer = {
    username: argv.username || null,
    email: argv.email || null,
    password: (argv.password || "").toString(),
    publicName: argv["public-name"] || null,
  };

  // Validate organizer object.
  if (organizer.username === null) {
    console.error('Missing argument value of "--username".');
    process.exit(1);
  }
  if (organizer.email === null) {
    console.error('Missing argument value of "--email".');
    process.exit(1);
  }
  if (organizer.password === null || organizer.password === "") {
    console.error('Missing argument value of "--password".');
    process.exit(1);
  }
  if (organizer.publicName === null) {
    console.error('Missing argument value of "--public-name".');
    process.exit(1);
  }
  organizer.password = await argon2.hash(organizer.password);
  organizer.confirmedEmail = true;
  organizer.superAdmin = true;
  organizer.verified = true;
  organizer.createDatetime = Math.floor(Date.now() / 1000);

  const input = humps.decamelizeKeys(organizer);
  const properties = [];
  const values = [];
  Object.keys(input).forEach((property) => {
    properties.push(property);
    values.push(input[property]);
  });
  const fieldsList = properties.join(",");
  const sql = `INSERT INTO organizer (${fieldsList}) VALUES (?)`;
  const connection = await mysql.createConnection(config);
  await connection.query(sql, [values]);
  organizer.password = "*****";
  console.info(
    "\x1b[32mA new organizer with the following data has been created successfully:\x1b[0m",
    organizer,
  );
  process.exit(0);
})().catch((error) => {
  console.info("");
  console.info(
    "\x1b[32mAn error occurred while trying to create a new organizer.\x1b[0m",
  );
  console.error(error);
  process.exit(1);
});
