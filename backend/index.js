// server/index.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const db = require("./db/index");
const bcrypt = require("bcrypt");
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const SALT_ROUNDS = process.env.SALT_ROUNDS;

const PORT = process.env.PORT ;

// signup

app.post("/api/register", async (req, res) => {
  const { name, username, password, phone } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const result = await db.query(
      "INSERT INTO users (name, username, password, phone) VALUES ($1, $2, $3, $4)",
      [name, username, hashedPassword, phone]
    );
    console.log(phone);
    res.status(201).json({ message: "User created", user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// login

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await db.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, message: "User not found" });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (passwordMatch) {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: "Invalid password" });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
