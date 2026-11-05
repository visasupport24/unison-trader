require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// সব ফাইল মেইন বা রুট ডিরেক্টরিতে থাকায় কারেন্ট ফোল্ডার স্ট্যাটিক করা হলো
app.use(express.static(__dirname));

// Aiven MySQL কানেকশন пул (SSL সচল সহ শক্তিশালী কানেকশন)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    ssl: {
        rejectUnauthorized: false
    }
});

// পুরো ডাটাবেস সম্পূর্ণ ক্লিয়ার করে নতুন করে টেবিল তৈরি করার ফাংশন
const initTables = () => {
    // ডাটাবেজের সব পুরনো টেবিল একসাথে সম্পূর্ণ মুছে ফেলার ক্যোয়ারী
    const dropQuery = 'DROP TABLE IF EXISTS transactions, site_settings, users;';

    pool.query(dropQuery, (err) => {
        if (err) {
            console.error("পুরনো টেবিল মুছতে সমস্যা:", err.message);
        } else {
            console.log("ডাটাবেজ ক্লিয়ার সম্পন্ন: পুরনো সকল টেবিল মুছে ফেলা হয়েছে।");
        }

        // ১. ইউজার টেবিল তৈরি
        const usersTable = `
        CREATE TABLE users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email_phone VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role ENUM('user', 'admin') DEFAULT 'user',
            balance DECIMAL(15, 2) DEFAULT 0.00,
            todays_profit DECIMAL(15, 2) DEFAULT 0.00,
            team_member INT DEFAULT 0,
            todays_commission DECIMAL(15, 2) DEFAULT 0.00,
            referred_by VARCHAR(50) DEFAULT NULL,
            status ENUM('active', 'banned') DEFAULT 'active',
            kyc_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`;

        // ২. ট্রানজেকশন টেবিল তৈরি (proof_or_address কলাম নিশ্চিত করা হলো)
        const txTable = `
        CREATE TABLE transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email_phone VARCHAR(100) NOT NULL,
            type ENUM('deposit', 'withdraw') NOT NULL,
            amount DECIMAL(15, 2) NOT NULL,
            proof_or_address VARCHAR(255) NOT NULL, 
            status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`;

        // ৩. সাইট সেটিংস টেবিল তৈরি
        const settingsTable = `
        CREATE TABLE site_settings (
            id INT PRIMARY KEY DEFAULT 1,
            notice TEXT,
            admin_trc20 VARCHAR(255) DEFAULT 'TY7RkX9pQzWv4mMn5sLtKdJfHgFdSaQwEr',
            telegram_link VARCHAR(255) DEFAULT '',
            support_email VARCHAR(100) DEFAULT 'support@unisontrading.com',
            about_text TEXT
        );`;

        // ক্রমান্বয়ে নতুন টেবিল তৈরি এবং ডিফল্ট ডেটা সেট করা
        pool.query(usersTable, (err) => {
            if (err) return console.error("users টেবিল তৈরিতে সমস্যা:", err.message);
            
            pool.query(txTable, (err) => {
                if (err) return console.error("transactions টেবিল তৈরিতে সমস্যা:", err.message);
                
                pool.query(settingsTable, (err) => {
                    if (err) return console.error("site_settings টেবিল তৈরিতে সমস্যা:", err.message);
                    
                    // ফ্রেশ ডিফল্ট ডেটা ও অ্যাডমিন ইনসার্ট করা
                    pool.query('INSERT INTO site_settings (id, notice, about_text) VALUES (1, "Welcome to Unison Trading!", "UNISON TRADING is a secure crypto investment platform.")');
                    pool.query('INSERT INTO users (email_phone, password, role) VALUES ("admin@unisontrading.com", "admin1234", "admin")');
                    console.log("নতুন কোড অনুযায়ী সকল টেবিল ফ্রেশভাবে তৈরি ও সিঙ্ক সম্পন্ন হয়েছে।");
                });
            });
        });
    });
};

// সার্ভার রানিং হওয়ার সাথে সাথে ডাটাবেজ ফ্লাশ ও রিক্রিয়েট চালু হবে
initTables();

// ================= API ENDPOINTS =================

// ১. ইউজার রেজিস্ট্রেশন (Sign Up)
app.post('/api/register', (req, res) => {
    const { email_phone, password } = req.body;
    
    if (!email_phone || !password) {
        return res.status(400).json({ success: false, message: 'সবগুলো ঘর পূরণ করুন!' });
    }

    pool.query('SELECT * FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি!' });
        if (results && results.length > 0) {
            return res.status(400).json({ success: false, message: 'এই ইমেইল বা ফোন ইতিমধ্যে নিবন্ধিত!' });
        }

        pool.query('INSERT INTO users (email_phone, password) VALUES (?, ?)', [email_phone, password], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'রেজিস্ট্রেশন ব্যর্থ হয়েছে!' });
            res.json({ success: true, message: 'রেজিস্ট্রেশন সফল হয়েছে!' });
        });
    });
});

// ২. ইউজার ও অ্যাডমিন লগইন (Login)
app.post('/api/login', (req, res) => {
    const { email_phone, password } = req.body;
    
    if (!email_phone || !password) {
        return res.status(400).json({ success: false, message: 'সবগুলো ঘর পূরণ করুন!' });
    }

    pool.query('SELECT * FROM users WHERE email_phone = ? AND password = ?', [email_phone, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি!' });
        if (!results || results.length === 0) {
            return res.status(400).json({ success: false, message: 'ভুল তথ্য বা পাসওয়ার্ড!' });
        }
        if (results[0].status === 'banned') {
            return res.status(403).json({ success: false, message: 'আপনার অ্যাকাউন্ট ব্লক করা!' });
        }

        res.json({ 
            success: true, 
            message: 'লগইন সফল হয়েছে!', 
            role: results[0].role 
        });
    });
});

// ৩. ড্যাশবোর্ড ও প্রোফাইল ডেটা লোড
app.get('/api/user/dashboard', (req, res) => {
    const { email_phone } = req.query;
    pool.query('SELECT balance, todays_profit, team_member, todays_commission, kyc_status FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (err || !results || results.length === 0) {
            return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি' });
        }
        res.json({ success: true, user: results[0] });
    });
});

// ৪. ফান্ড অ্যাড রিকোয়েস্ট (Add Fund)
app.post('/api/user/add-fund', (req, res) => {
    const { email_phone, amount, txid } = req.body; 
    
    if (!email_phone || !amount || !txid) {
        return res.status(400).json({ success: false, message: 'সবগুলো তথ্য সঠিকভাবে দিন!' });
    }

    const query = 'INSERT INTO transactions (email_phone, type, amount, proof_or_address, status) VALUES (?, "deposit", ?, ?, "pending")';
    pool.query(query, [email_phone, amount, txid], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'ডেটাবেজ ত্রুটি।' });
        res.json({ success: true, message: 'রিকোয়েস্ট সফলভাবে জমা হয়েছে!' });
    });
});

// ৫. উইথড্র রিকোয়েস্ট (Withdraw)
app.post('/api/fund/withdraw', (req, res) => {
    const { email_phone, amount, trc20_address } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (!email_phone || !withdrawAmount || !trc20_address) {
        return res.status(400).json({ success: false, message: 'সবগুলো তথ্য সঠিকভাবে দিন!' });
    }

    pool.query('SELECT balance FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি!' });
        if (!results || results.length === 0) return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি।' });

        const currentBalance = parseFloat(results[0].balance);
        if (withdrawAmount > currentBalance) {
            return res.status(400).json({ success: false, message: 'আপনার অ্যাকাউন্টে পর্যাপ্ত ব্যালেন্স নেই!' });
        }

        pool.query('UPDATE users SET balance = balance - ? WHERE email_phone = ?', [withdrawAmount, email_phone], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'ব্যালেন্স আপডেট ব্যর্থ।' });

            const txQuery = 'INSERT INTO transactions (email_phone, type, amount, proof_or_address, status) VALUES (?, "withdraw", ?, ?, "pending")';
            pool.query(txQuery, [email_phone, withdrawAmount, trc20_address], (err) => {
                if (err) return res.status(500).json({ success: false, message: 'ট্রানজেকশন রেকর্ড ব্যর্থ।' });
                res.json({ success: true, message: 'উইথড্র রিকোয়েস্ট সফলভাবে জমা হয়েছে!' });
            });
        });
    });
});

// ৬. সাইট সেটিংস ও নোটিশ লোড
app.get('/api/site/settings', (req, res) => {
    pool.query('SELECT notice, about_text, admin_trc20 FROM site_settings WHERE id = 1', (err, results) => {
        if (err || !results || results.length === 0) {
            return res.status(500).json({ success: false, message: 'সেটিংস লোড ব্যর্থ।' });
        }
        res.json({ success: true, settings: results[0] });
    });
});

// অ্যাডমিনদের জন্য ডেডিকেটেড সিক্রেট লগইন এপিআই (ডাটাবেজ ডাউন থাকলেও ব্যাকআপ হিসেবে কাজ করবে)
app.post('/api/admin/secret-login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin@unisontrading.com' && password === 'admin1234') {
        return res.json({ success: true, message: 'অ্যাডমিন লগইন সফল!', role: 'admin' });
    } else {
        return res.status(401).json({ success: false, message: 'ভুল অ্যাডমিন ক্রেডেনশিয়াল!' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// সার্ভার পোর্ট লিসেনিং
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`UNISON TRADING সার্ভার সফলভাবে চালু হয়েছে। পোর্ট: ${PORT}`);
});


