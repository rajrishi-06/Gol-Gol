

const pool = require("../db/index");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// In-memory temporary OTP store
const otpStore = {}; // Example: { '9876543210': '123456' }

// 👉 Step 4.2 - Send OTP
exports.sendOTP = async (req, res) => {
  const { mobile } = req.body;

  if (!mobile) return res.status(400).json({ msg: "Mobile number required" });

  // Simulate OTP
  const otp = "123456";
  otpStore[mobile] = otp;

  return res.json({ msg: "OTP sent", otp }); // Only show OTP for testing
};

// 👉 Step 4.2 - Verify OTP
exports.verifyOTP = async (req, res) => {
  const { mobile, otp } = req.body;

  if (!otpStore[mobile]) return res.status(400).json({ msg: "No OTP found" });
  if (otpStore[mobile] !== otp) return res.status(401).json({ msg: "Invalid OTP" });

  return res.json({ msg: "OTP verified. Proceed to registration." });
};

// 👉 Step 4.3 - Register User
exports.registerUser = async (req, res) => {
  const { name, email, mobile, password } = req.body;

  if (!name || !email || !mobile || !password)
    return res.status(400).json({ msg: "All fields required" });

  try {
    const userExists = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR mobile = $2",
      [email, mobile]
    );

    if (userExists.rows.length > 0)
      return res.status(409).json({ msg: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await pool.query(
      "INSERT INTO users (name, email, mobile, password) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, email, mobile, hashedPassword]
    );

    const token = jwt.sign({ id: newUser.rows[0].id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    return res.json({
      msg: "User registered",
      user: {
        id: newUser.rows[0].id,
        name: newUser.rows[0].name,
        email: newUser.rows[0].email,
      },
      token,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: "Server error" });
  }
};

// 👉 Step 4.4 - Login User
exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ msg: "All fields required" });

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0)
      return res.status(404).json({ msg: "User not found" });

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch)
      return res.status(401).json({ msg: "Invalid password" });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    return res.json({
      msg: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: "Server error" });
  }
};
