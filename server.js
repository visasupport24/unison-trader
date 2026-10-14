const express = require('express');
const mysql = require('mysql2');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    ssl: { rejectUnauthorized: false }
});

// ১. ডেটাবেস টেবিলসমূহ স্বয়ংক্রিয়ভাবে তৈরি করার সেকশন
pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        balance DECIMAL(10, 2) DEFAULT 30.00,
        vip_level INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => { if (err) console.error("users টেবিল তৈরিতে সমস্যা:", err); });

pool.query(`
    CREATE TABLE IF NOT EXISTS user_deposits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        txid VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(255) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => { if (err) console.error("user_deposits টেবিল তৈরিতে সমস্যা:", err); });

pool.query(`
    CREATE TABLE IF NOT EXISTS user_withdrawals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        address VARCHAR(255) NOT NULL,
        status VARCHAR(255) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => { if (err) console.error("user_withdrawals টেবিল তৈরিতে সমস্যা:", err); });

// ২. ইউজার অথেন্টিকেশন কোর এপিআই
app.post('/api/signup', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "ইমেইল এবং পাসওয়ার্ড প্রয়োজন!" });

    pool.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "ডেটাবেস ত্রুটি" });
        if (results.length > 0) return res.status(400).json({ success: false, message: "ইমেইল ইতিমধ্যে ব্যবহৃত!" });

        pool.query('INSERT INTO users (email, password) VALUES (?, ?)', [email, password], (err) => {
            if (err) return res.status(500).json({ success: false, message: "অ্যাকাউন্ট তৈরিতে সমস্যা" });
            res.json({ success: true, message: "অ্যাকাউন্ট তৈরি হয়েছে! লগইন করুন।" });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    pool.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "ডেটাবেস ত্রুটি" });
        if (results.length === 0) return res.status(401).json({ success: false, message: "ভুল ইমেইল বা পাসওয়ার্ড!" });
        res.json({ success: true, message: "লগইন সফল!", user: results[0] });
    });
});

app.post('/api/task/complete', (req, res) => {
    const { email } = req.body;
    pool.query('UPDATE users SET balance = balance + 0.50 WHERE email = ?', [email], (err) => {
        if (err) return res.status(500).json({ success: false, message: "টাস্ক প্রসেস ত্রুটি" });
        pool.query('SELECT balance FROM users WHERE email = ?', [email], (err, rows) => {
            res.json({ success: true, message: "টাস্ক সফল! \$0.50 যোগ হয়েছে।", newBalance: rows[0].balance });
        });
    });
});

// ৩. ট্রানজেকশন সাবমিশন
app.post('/api/recharge/submit', (req, res) => {
    const { email, amount, txid } = req.body;
    pool.query('INSERT INTO user_deposits (email, amount, txid) VALUES (?, ?, ?)', [email, amount, txid], (err) => {
        if (err) return res.status(400).json({ success: false, message: "TxID টি ইতিমধ্যে ব্যবহৃত হয়েছে!" });
        res.json({ success: true, message: "রিচার্জ রিকোয়েস্ট পেন্ডিংয়ে জমা হয়েছে।" });
    });
});

app.post('/api/withdraw/submit', (req, res) => {
    const { email, amount, address } = req.body;
    pool.query('SELECT balance FROM users WHERE email = ?', [email], (err, rows) => {
        if (parseFloat(rows[0].balance) < parseFloat(amount)) return res.status(400).json({ success: false, message: "পর্যাপ্ত ব্যালেন্স নেই!" });
        pool.query('INSERT INTO user_withdrawals (email, amount, address) VALUES (?, ?, ?)', [email, amount, address], (err) => {
            pool.query('UPDATE users SET balance = balance - ? WHERE email = ?', [amount, email], (err) => {
                pool.query('SELECT balance FROM users WHERE email = ?', [email], (err, newRows) => {
                    res.json({ success: true, message: "উইথড্র রিকোয়েস্ট জমা হয়েছে।", newBalance: newRows[0].balance });
                });
            });
        });
    });
});

// ৪. অ্যাডমিন কন্ট্রোল ও ওনার ম্যানেজমেন্ট
app.get('/api/admin/requests', (req, res) => {
    pool.query('SELECT * FROM user_deposits ORDER BY id DESC', (err, deposits) => {
        pool.query('SELECT * FROM user_withdrawals ORDER BY id DESC', (err, withdrawals) => {
            res.json({ success: true, deposits, withdrawals });
        });
    });
});

// রিচার্জ অ্যাপ্রুভ কুয়েরি অপ্টিমাইজড (আইডি দিয়ে ম্যাচ করে ব্যালেন্স লোড)
app.post('/api/admin/recharge/approve', (req, res) => {
    const { id } = req.body;
    
    // প্রথমে ডিপোজিট আইডি থেকে ডেটা তুলে আনা
    pool.query('SELECT * FROM user_deposits WHERE id = ?', [id], (err, rows) => {
        if (err || rows.length === 0) return res.status(500).json({ success: false, message: "রিকোয়েস্ট পাওয়া যায়নি" });
        
        const deposit = rows[0];
        if (deposit.status !== 'Pending') return res.status(400).json({ success: false, message: "এটি ইতিমধ্যে প্রসেস করা হয়েছে!" });

        // স্ট্যাটাস Approved করা
        pool.query('UPDATE user_deposits SET status = "Approved" WHERE id = ?', [id], (upErr) => {
            if (upErr) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });

            // ইউজারের ব্যালেন্স বাড়ানো
            pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [deposit.amount, deposit.email], (userErr) => {
                if (userErr) return res.status(500).json({ success: false, message: "ব্যালেন্স যোগ করা যায়নি" });
                res.json({ success: true, message: "রিচার্জ সফলভাবে অনুমোদিত হয়েছে! ✅" });
            });
        });
    });
});

app.post('/api/admin/recharge/reject', (req, res) => {
    const { id } = req.body;
    pool.query('UPDATE user_deposits SET status = "Rejected" WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });
        res.json({ success: true, message: "রিচার্জ রিকোয়েস্টটি বাতিল করা হয়েছে! ❌" });
    });
});

app.post('/api/admin/withdraw/action', (req, res) => {
    const { id, action } = req.body;
    
    pool.query('SELECT * FROM user_withdrawals WHERE id = ?', [id], (err, rows) => {
        if (err || rows.length === 0) return res.status(500).json({ success: false, message: "রিকোয়েস্ট পাওয়া যায়নি" });
        const withdrawal = rows[0];

        pool.query('UPDATE user_withdrawals SET status = ? WHERE id = ?', [action, id], (upErr) => {
            if (upErr) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });

            if (action === 'Rejected') {
                pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [withdrawal.amount, withdrawal.email], (userErr) => {
                    res.json({ success: true, message: "উইথড্র বাতিল এবং ব্যালেন্স ফেরত দেওয়া হয়েছে। ❌" });
                });
            } else {
                res.json({ success: true, message: "উইথড্র রিকোয়েস্টটি সফলভাবে সম্পন্ন করা হয়েছে! ✅" });
            }
        });
    });
});

// ৫. ব্রাউজার ওয়ান-ক্লিক টেবিল ফিক্স লিংক
app.get('/fix-tables', (req, res) => {
    pool.query("DROP TABLE IF EXISTS user_deposits, user_withdrawals", () => {
        pool.query(`
            CREATE TABLE user_deposits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                txid VARCHAR(255) NOT NULL UNIQUE,
                status VARCHAR(255) DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `, () => {
            pool.query(`
                CREATE TABLE user_withdrawals (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    email VARCHAR(255) NOT NULL,
                    amount DECIMAL(10, 2) NOT NULL,
                    address VARCHAR(255) NOT NULL,
                    status VARCHAR(255) DEFAULT 'Pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `, () => {
                res.send("<h1>ডেটাবেস টেবিল সফলভাবে ফিক্স করা হয়েছে! 🎉</h1>");
            });
        });
    });
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
