const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Database connection error:', err.message);
});

// Helper: run a query
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) console.warn(`Slow query (${duration}ms):`, text);
    return res;
  } catch (err) {
    console.error('Query error:', err.message, '\nQuery:', text);
    throw err;
  }
}

// Helper: get single row
async function queryOne(text, params) {
  const res = await query(text, params);
  return res.rows[0] || null;
}

// Helper: get all rows
async function queryAll(text, params) {
  const res = await query(text, params);
  return res.rows;
}

// Run schema on startup
async function initSchema() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✅ Database schema ready');
  } catch (err) {
    console.error('❌ Schema init failed:', err.message);
    throw err;
  }
}

module.exports = { query, queryOne, queryAll, initSchema, pool };
