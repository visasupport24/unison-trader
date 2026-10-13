const express = require('express');
const mysql = require('mysql2');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ফ্রন্টএন্ড ফাইল ব্যবহারের অনুমতি
app.use(express.static(path.join(__dirname, './')));

// Aiven MySQL ডেটাবেস কানেকশন
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: false
    }
});

// টেবিল তৈরি করা
pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        balance DECIMAL(10, 2) DEFAULT 30.00,
        vip_level INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) console.error("টেবিল তৈরিতে সমস্যা:", err);
    else console.log("MySQL ডেটাবেস এবং 'users' টেবিল সম্পূর্ণ রেডি! ✅");
});
// রিচার্জ হিস্ট্রি রাখার জন্য নতুন টেবিল
pool.query(`
    CREATE TABLE IF NOT EXISTS deposits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        txid VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) console.error("Deposits টেবিল তৈরিতে সমস্যা:", err);
});


// --- নতুন সাইন-আপ এপিআই ---
app.post('/api/signup', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ success: false, message: "ইমেইল এবং পাসওয়ার্ড দুটিই প্রয়োজন!" });
    }

    // ইউজার আগে থেকেই আছে কিনা চেক করা
    pool.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "ডেটাবেস ত্রুটি" });
        if (results.length > 0) {
            return res.status(400).json({ success: false, message: "এই ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট তৈরি করা আছে!" });
        }

        // নতুন ইউজার যুক্ত করা (শিক্ষানবিশ প্রজেক্ট হিসেবে পাসওয়ার্ড সরাসরি রাখা হলো)
        pool.query('INSERT INTO users (email, password) VALUES (?, ?)', [email, password], (err) => {
            if (err) return res.status(500).json({ success: false, message: "অ্যাকাউন্ট তৈরিতে সমস্যা হয়েছে" });
            res.json({ success: true, message: "অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে! এখন লগইন করুন।" });
        });
    });
});

// --- নতুন লগইন এপিআই ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    pool.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "ডেটাবেস ত্রুটি" });
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: "ভুল ইমেইল অথবা পাসওয়ার্ড!" });
        }

        // লগইন সফল হলে ইউজারের সেশন ডেটা বা ইনফো পাঠানো
        const user = results[0];
        res.json({ 
            success: true, 
            message: "লগইন সফল হয়েছে!",
            user: { email: user.email, balance: user.balance, vip: user.vip_level }
        });
    });
});

// (আগের সব কোড ঠিক থাকবে, শুধু অ্যাপ ডট লিসেনের আগে এই নতুন এপিআই রুটটি যোগ করুন)

// --- টাস্ক কমপ্লিট করে ব্যালেন্স আপডেট করার এপিআই ---
app.post('/api/task/complete', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: "ইউজার ইমেইল প্রয়োজন!" });
    }

    // প্রতি টাস্কে কত ইনকাম হবে (যেমন VIP0 এর জন্য ০.৫০ USDT)
    const taskReward = 0.50; 

    // ডেটাবেসে ইউজারের ব্যালেন্স বাড়িয়ে দেওয়া
    pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [taskReward, email], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "ডেটাবেস আপডেট করতে সমস্যা হয়েছে" });

        // আপডেট হওয়া নতুন ব্যালেন্সটি ডেটাবেস থেকে তুলে আনা
        pool.query('SELECT balance FROM users WHERE email = ?', [email], (err, rows) => {
            if (err || rows.length === 0) return res.status(500).json({ success: false, message: "নতুন ব্যালেন্স লোড করা যায়নি" });
            
            res.json({ 
                success: true, 
                message: `টাস্ক সফলভাবে সম্পন্ন হয়েছে! আপনি ${taskReward} USDT পেয়েছেন।`,
                newBalance: rows[0].balance
            });
        });
    });
});
// --- রিচার্জ রিকোয়েস্ট জমা দেওয়ার এপিআই ---
app.post('/api/recharge/submit', (req, res) => {
    const { email, amount, txid } = req.body;

    if (!email || !amount || !txid) {
        return res.status(400).json({ success: false, message: "সবগুলো ফিল্ড পূরণ করা বাধ্যতামূলক!" });
    }

    pool.query('INSERT INTO deposits (email, amount, txid) VALUES (?, ?, ?)', [email, amount, txid], (err) => {
        if (err) {
            if(err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ success: false, message: "এই TxID টি ইতিমধ্যে ব্যবহার করা হয়েছে!" });
            }
            return res.status(500).json({ success: false, message: "রিকোয়েস্ট জমা নেওয়া যায়নি।" });
        }
        res.json({ success: true, message: "আপনার রিচার্জ রিকোয়েস্টটি জমা হয়েছে। অ্যাডমিন ভেরিফাই করে ব্যালেন্স যুক্ত করে দেবে। ধন্যবাদ!" });
    });
});


// রুট পেজ এবং সার্ভার লিসেনিং কোড আগের মতোই নিচে থাকবে...

// রুট পেজ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`সার্ভার চলছে পোর্ট: ${PORT}`));
