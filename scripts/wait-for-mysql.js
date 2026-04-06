const mysql = require('mysql2/promise');

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';
const database = process.env.DB_NAME || '';
const maxAttempts = Number(process.env.MYSQL_WAIT_MAX_ATTEMPTS || 30);
const delayMs = Number(process.env.MYSQL_WAIT_DELAY_MS || 2000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const connection = await mysql.createConnection({
        host,
        port,
        user,
        password,
        database,
      });
      await connection.query('SELECT 1');
      await connection.end();
      console.log(`[mysql-wait] MySQL is ready on attempt ${attempt}.`);
      return;
    } catch (error) {
      const suffix = attempt === maxAttempts ? ' (final attempt)' : '';
      console.log(
        `[mysql-wait] Attempt ${attempt}/${maxAttempts} failed${suffix}: ${error.message}`
      );
      if (attempt === maxAttempts) {
        throw error;
      }
      await sleep(delayMs);
    }
  }
};

main().catch((error) => {
  console.error(`[mysql-wait] MySQL readiness check failed: ${error.message}`);
  process.exit(1);
});
