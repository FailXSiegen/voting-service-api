require("dotenv/config");
const parseArgs = require("minimist");
const mysql = require("promise-mysql");
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

  // Get arguments
  const username = argv.username || null;
  const newPassword = (argv.password || "").toString();

  // Validate arguments
  if (username === null) {
    console.error('Missing argument value of "--username".');
    process.exit(1);
  }
  if (newPassword === null || newPassword === "") {
    console.error('Missing argument value of "--password".');
    process.exit(1);
  }

  const connection = await mysql.createConnection(config);

  try {
    // Check if organizer exists
    const checkSql = "SELECT id, username, email FROM organizer WHERE username = ?";
    const results = await connection.query(checkSql, [username]);
    
    if (results.length === 0) {
      console.error(`\x1b[31mError: No organizer found with username "${username}".\x1b[0m`);
      process.exit(1);
    }

    const organizer = results[0];

    // Hash the new password
    const hashedPassword = await argon2.hash(newPassword);

    // Update the password
    const updateSql = "UPDATE organizer SET password = ? WHERE username = ?";
    await connection.query(updateSql, [hashedPassword, username]);

    console.info(
      `\x1b[32mPassword successfully updated for organizer:\x1b[0m`,
      {
        id: organizer.id,
        username: organizer.username,
        email: organizer.email
      }
    );
    process.exit(0);
  } catch (error) {
    console.error("\x1b[31mAn error occurred while updating the password:\x1b[0m");
    console.error(error);
    process.exit(1);
  } finally {
    await connection.end();
  }
})();