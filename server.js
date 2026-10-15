// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db'); 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'UnIsOnTrAdInG_S3Cr3t_KeY_2026';

// মিডলওয়্যার
app.use(cors());
app.use(express.json());

// আপডেট: এখন ফাইলগুলো সরাসরি মেইন ডিরেক্টরি (Root) থেকেই লোড হবে, কোনো public ফোল্ডার লাগবে না
app.use(express.static(__dirname));

// ==========================================
// ১. রেজিস্ট্রেশন API (Sign Up - স্কেচ ২ অনুযায়ী)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Please fill all fields" });
    }

    try {
        const [existingUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser.length > 0) {
            return res.status(400).json({ success: false, message: "Email already exists!" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await db.query('INSERT INTO users (email, password) VALUES (?, ?)', [email, hashedPassword]);

        res.status(201).json({ success: true, message: "Registration Successful! Please Sign In." });
    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ success: false, message: "Server Error during registration" });
    }
});

// ==========================================
// ২. লগইন API (Sign In - স্কেচ ৩ অনুযায়ী)
// ==========================================
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Please enter email and password" });
    }

    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid Email or Password!" });
        }

        const user = users[0]; // সংশোধিত: প্রথম ইউজার অবজেক্ট নেওয়া হলো

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Invalid Email or Password!" });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });

        res.json({
            success: true,
            message: "Login successful!",
            token,
            user: { id: user.id, email: user.email, balance: user.balance }
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ success: false, message: "Server Error during login" });
    }
});

// মূল ইউআরএলে গেলে যাতে সরাসরি index.html ওপেন হয়
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// সার্ভার স্টার্ট
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
