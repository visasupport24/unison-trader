require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// সব ফাইল মেইন বা রুট ডিরেক্টরিতে থাকায় কারেন্ট ফোল্ডার স্ট্যাটিক করা হলো
app.use(express.static(__dirname));

// Aiven MySQL কানেকশন পুল (SSL সচল সহ)
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

// ডেটাবেজে প্রয়োজনীয় সব টেবিল অটোমেটিক তৈরি (Auto-Create Tables)
const initTables = () => {
    const usersTable = `
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email_phone VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        balance DECIMAL(15, 2) DEFAULT 0.00,
        todays_profit DECIMAL(15, 2) DEFAULT 0.00,
        team_member INT DEFAULT 0,
        todays_commission DECIMAL(15, 2) DEFAULT 0.00,
        referred_by VARCHAR(50) DEFAULT NULL,
        status ENUM('active', 'banned') DEFAULT 'active',
        kyc_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`;

    const txTable = `
    CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email_phone VARCHAR(100) NOT NULL,
        type ENUM('deposit', 'withdraw') NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        proof_or_address VARCHAR(255) NOT NULL,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`;

    const settingsTable = `
    CREATE TABLE IF NOT EXISTS site_settings (
        id INT PRIMARY KEY DEFAULT 1,
        notice TEXT,
        admin_trc20 VARCHAR(255) DEFAULT 'TY7RkX9pQzWv4mMn5sLtKdJfHgFdSaQwEr',
        telegram_link VARCHAR(255) DEFAULT '',
        support_email VARCHAR(100) DEFAULT 'support@unisontrading.com',
        about_text TEXT
    );`;

    pool.query(usersTable);
    pool.query(txTable);
    pool.query(settingsTable, () => {
        // ডিফল্ট সেটিংস রো ইনসার্ট করা যদি না থাকে
        pool.query('INSERT IGNORE INTO site_settings (id, notice, about_text) VALUES (1, "Welcome to Unison Trading!", "Company details here...")');
    });
    console.log("Aiven MySQL-এ সব টেবিল অটো-চেক/তৈরি সম্পন্ন হয়েছে।");
};
initTables();

// ================= API ENDPOINTS =================

// ১. ইউজার রেজিস্ট্রেশন (Sign Up)
app.post('/api/register', (req, res) => {
    const { email_phone, password } = req.body;
    pool.query('SELECT * FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি!' });
        if (results.length > 0) return res.status(400).json({ success: false, message: 'এই ইমেইল বা ফোন ইতিমধ্যে নিবন্ধিত!' });

        pool.query('INSERT INTO users (email_phone, password) VALUES (?, ?)', [email_phone, password], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'রেজিস্ট্রেশন ব্যর্থ!' });
            res.json({ success: true, message: 'রেজিস্ট্রেশন সফল হয়েছে!' });
        });
    });
});

// ২. ইউজার লগইন (Login)
app.post('/api/login', (req, res) => {
    const { email_phone, password } = req.body;
    pool.query('SELECT * FROM users WHERE email_phone = ? AND password = ?', [email_phone, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি!' });
        if (results.length === 0) return res.status(400).json({ success: false, message: 'ভুল তথ্য বা পাসওয়ার্ড!' });
        if (results[0].status === 'banned') return res.status(403).json({ success: false, message: 'আপনার অ্যাকাউন্ট ব্লক করা!' });

        res.json({ success: true, message: 'লগইন সফল হয়েছে!' });
    });
});

// ৩. ড্যাশবোর্ড ডেটা লোড
app.get('/api/user/dashboard', (req, res) => {
    const { email_phone } = req.query;
    pool.query('SELECT balance, todays_profit, team_member, todays_commission, kyc_status FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি' });
        res.json({ success: true, user: results[0] });
    });
});

// ৪. ফান্ড অ্যাড রিকোয়েস্ট (Add Fund)
app.post('/api/fund/add', (req, res) => {
    const { email_phone, amount, proof } = req.body;
    pool.query('INSERT INTO transactions (email_phone, type, amount, proof_or_address) VALUES (?, "deposit", ?, ?)', [email_phone, amount, proof], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'রিকোয়েস্ট ব্যর্থ!' });
        res.json({ success: true });
    });
});

// ৫. উইথড্র রিকোয়েস্ট (Withdraw)
app.post('/api/fund/withdraw', (req, res) => {
    const { email_phone, amount, trc20_address } = req.body;
    // ব্যালেন্স চেক
    pool.query('SELECT balance FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (results && results[0].balance >= amount) {
            pool.query('INSERT INTO transactions (email_phone, type, amount, proof_or_address) VALUES (?, "withdraw", ?, ?)', [email_phone, amount, trc20_address], (err) => {
                if (err) return res.status(500).json({ success: false, message: 'রিকোয়েস্ট ব্যর্থ!' });
                res.json({ success: true });
            });
        } else {
            res.status(400).json({ success: false, message: 'পর্যাপ্ত ব্যালেন্স নেই!' });
        }
    });
});

// ৬. সাইট সেটিংস লোড (Notice, About Us, Address)
app.get('/api/site/settings', (req, res) => {
    pool.query('SELECT * FROM site_settings WHERE id = 1', (err, results) => {
        if (err || results.length === 0) return res.json({ success: false });
        res.json({ success: true, settings: results[0] });
    });
});

// ================= PAGE ROUTING =================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/add_fund', (req, res) => res.sendFile(path.join(__dirname, 'add_fund.html')));
app.get('/withdraw', (req, res) => res.sendFile(path.join(__dirname, 'withdraw.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/affiliate', (req, res) => res.sendFile(path.join(__dirname, 'affiliate.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, 'about.html')));
app.get('/admin-panel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// সার্ভার লিসেন
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`UNISON TRADING সার্ভার রানিং পোর্ট: ${PORT}`));
