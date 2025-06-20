const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "user_auth", // ✅ change this
  password: "Thrishank@29",      // ✅ change this
  port: 2005,
});

module.exports = pool;