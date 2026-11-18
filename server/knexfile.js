import 'dotenv/config';

const config = {
  client: 'pg',
  connection:
    process.env.DATABASE_URL ||
    'postgres://sportbooking:sportbooking_dev@localhost:5432/sportbooking',
  pool: { min: 0, max: 10 },
  migrations: { directory: './src/db/migrations', extension: 'js' },
  seeds: { directory: './src/db/seeds', extension: 'js' },
};

export default { development: config, test: config, production: config };
