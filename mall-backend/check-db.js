import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

for (const name of ['DB_USER', 'DB_DATABASE', 'DB_PASSWORD']) {
  if (!process.env[name]) {
    console.error(`Missing required environment variable: ${name}. Check that backend/.env exists.`);
    process.exit(1);
  }
}

const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
  connectionTimeoutMillis: 5000,
});

try {
  await client.connect();
  const result = await client.query('SELECT current_database() AS database_name, current_user AS user_name, version() AS version');
  console.log('PostgreSQL connection OK');
  console.log('Database:', result.rows[0].database_name);
  console.log('User:', result.rows[0].user_name);
  console.log(result.rows[0].version.split('\n')[0]);
} catch (error) {
  console.error('PostgreSQL connection failed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
