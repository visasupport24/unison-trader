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

// =========================================================================
// ১. ডেটাবেস টেবিলসমূহ তৈরি করার সেকশন (নতুন ফিক্সড টেবিল নেম)
// =========================================================================

// ইউজার টেবিল
pool.query(`
    CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        balance DECIMAL(10, 2) DEFAULT 30.00,
        vip_level INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => { if (err) console.error("Users table error:", err); });

// রিচার্জ টেবিল (নতুন নাম: user_deposits)
pool.query(`
    CREATE TABLE IF NOT EXISTS user_deposits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        txid VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(255) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => { if (err) console.error("Deposits table error:", err); });

// উইথড্রল টেবিল (নতুন নাম: user_withdrawals)
pool.query(`
    CREATE TABLE IF NOT EXISTS user_withdrawals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        address VARCHAR(255) NOT NULL,
        status VARCHAR(255) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => { if (err) console.error("Withdrawals table error:", err); });

// =========================================================================
// ২. ইউজার অথেন্টিকেশন ও কোর এপিআই রুটসমূহ
// =========================================================================

// সাইন-আপ এপিআই
app.post('/api/signup', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "ইমেইল এবং পাসওয়ার্ড দুটিই প্রয়োজন!" });

    pool.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "ডেটাবেস যাচাইকরণ ত্রুটি" });
        if (results.length > 0) return res.status(400).json({ success: false, message: "এই ইমেইল ইতিমধ্যে ব্যবহৃত!" });

        pool.query('INSERT INTO users (email, password) VALUES (?, ?)', [email, password], (err) => {
            if (err) return res.status(500).json({ success: false, message: "অ্যাকাউন্ট তৈরি করতে সমস্যা হয়েছে" });
            res.json({ success: true, message: "অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে! এখন লগইন করুন।" });
        });
    });
});

// লগইন এপিআই
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "ইমেইল এবং পাসওয়ার্ড দুটিই দিন!" });

    pool.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "ডেটাবেস ত্রুটি" });
        if (results.length === 0) return res.status(401).json({ success: false, message: "ভুল ইমেইল অথবা পাসওয়ার্ড!" });

        res.json({ 
            success: true, 
            message: "লগইন সফল হয়েছে!",
            user: { email: results[0].email, balance: results[0].balance, vip: results[0].vip_level }
        });
    });
});

// টাস্ক কমপ্লিট এপিআই
app.post('/api/task/complete', (req, res) => {
    const { email } = req.body;
    const taskReward = 0.50; 

    pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [taskReward, email], (err) => {
        if (err) return res.status(500).json({ success: false, message: "ব্যালেন্স আপডেট করতে সমস্যা হয়েছে" });

        pool.query('SELECT balance FROM users WHERE email = ?', [email], (err, rows) => {
            if (err || rows.length === 0) return res.status(500).json({ success: false, message: "নতুন ব্যালেন্স লোড করা যায়নি" });
            res.json({ success: true, message: `টাস্ক সফল! আপনি ${taskReward} USDT পেয়েছেন।`, newBalance: rows[0].balance });
        });
    });
});

// =========================================================================
// ৩. ট্রানজেকশন সাবমিশন এপিআই সেকশন
// =========================================================================

// রিচার্জ সাবমিট এপিআই
app.post('/api/recharge/submit', (req, res) => {
    const { email, amount, txid } = req.body;
    if (!email || !amount || !txid) return res.status(400).json({ success: false, message: "সবগুলো ফিল্ড পূরণ করুন!" });

    pool.query('INSERT INTO user_deposits (email, amount, txid) VALUES (?, ?, ?)', [email, amount, txid], (err) => {
        if (err) {
            if(err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: "এই TxID টি ইতিমধ্যে ব্যবহৃত হয়েছে!" });
            return res.status(500).json({ success: false, message: "রিকোয়েস্ট জমা নেওয়া যায়নি।" });
        }
        res.json({ success: true, message: "আপনার রিচার্জ রিকোয়েস্টটি পেন্ডিংয়ে জমা হয়েছে।" });
    });
});

// উইথড্র সাবমিট এপিআই
app.post('/api/withdraw/submit', (req, res) => {
    const { email, amount, address } = req.body;
    if (!email || !amount || !address) return res.status(400).json({ success: false, message: "সবগুলো ফিল্ড পূরণ করুন!" });

    pool.query('SELECT balance FROM users WHERE email = ?', [email], (err, rows) => {
        if (err || rows.length === 0) return res.status(500).json({ success: false, message: "ইউজার তথ্য পাওয়া যায়নি" });
        
        if (parseFloat(rows[0].balance) < parseFloat(amount)) return res.status(400).json({ success: false, message: "পর্যাপ্ত ব্যালেন্স নেই!" });

        pool.query('INSERT INTO user_withdrawals (email, amount, address) VALUES (?, ?, ?)', [email, amount, address], (err) => {
            if (err) return res.status(500).json({ success: false, message: "রিকোয়েস্ট প্রসেস করা যায়নি।" });

            pool.query('UPDATE users SET balance = balance - ? WHERE email = ?', [amount, email], (err) => {
                pool.query('SELECT balance FROM users WHERE email = ?', [email], (err, newRows) => {
                    res.json({ success: true, message: "উইথড্র রিকোয়েস্টটি পেন্ডিংয়ে জমা হয়েছে।", newBalance: newRows[0].balance });
                });
            });
        });
    });
});

// =========================================================================
// ৪. অ্যাডমিন কন্ট্রোল ও ওনার ম্যানেজমেন্ট এপিআই রুটসমূহ
// =========================================================================

// সব রিকোয়েস্ট দেখার এপিআই
app.get('/api/admin/requests', (req, res) => {
    pool.query('SELECT * FROM user_deposits ORDER BY id DESC', (err, deposits) => {
        if (err) return res.status(500).json({ success: false, message: "ডিপোজিট ডেটা লোড ত্রুটি" });
        
        pool.query('SELECT * FROM user_withdrawals ORDER BY id DESC', (err, withdrawals) => {
            if (err) return res.status(500).json({ success: false, message: "উইথড্র ডেটা লোড ত্রুটি" });
            res.json({ success: true, deposits, withdrawals });
        });
    });
});

// রিচার্জ অনুমোদন (Approve)
app.post('/api/admin/recharge/approve', (req, res) => {
    const { id, email, amount } = req.body;
    pool.query('UPDATE user_deposits SET status = "Approved" WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });

        pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [amount, email], (err) => {
            if (err) return res.status(500).json({ success: false, message: "ইউজারের ব্যালেন্স আপডেট করা যায়নি" });
            res.json({ success: true, message: "রিচার্জ সফলভাবে অনুমোদিত হয়েছে! ✅" });
        });
    });
});

// রিচার্জ বাতিল (Reject)
app.post('/api/admin/recharge/reject', (req, res) => {
    const { id } = req.body;
    pool.query('UPDATE user_deposits SET status = "Rejected" WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });
        res.json({ success: true, message: "রিচার্জ রিকোয়েস্টটি বাতিল করা হয়েছে! ❌" });
    });
});

// উইথড্রল অ্যাকশন (Success / Reject)
app.post('/api/admin/withdraw/action', (req, res) => {
    const { id, action, email, amount } = req.body;
    pool.query('UPDATE user_withdrawals SET status = ? WHERE id = ?', [action, id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });

        if (action === 'Rejected') {
            pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [amount, email], (err) => {
                if (err) return res.status(500).json({ success: false, message: "ব্যালেন্স ফেরত দেওয়া যায়নি" });
                res.json({ success: true, message: "উইথড্র বাতিল এবং ব্যালেন্স ফেরত দেওয়া হয়েছে। ❌" });
            });
        } else {
            res.json({ success: true, message: "উইথড্র রিকোয়েস্টটি সফলভাবে সম্পন্ন করা হয়েছে! ✅" });
        }
    });
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

const PORT = process.env.PORT || 3000;
// =========================================================================
// ৫. ব্রাউজার থেকে সরাসরি ডেটাবেস টেবিল ফিক্স করার স্পেশাল এপিআই রুট
// =========================================================================
app.get('/fix-tables', (req, res) => {
    console.log("ব্রাউজার থেকে টেবিল ফিক্স করার রিকোয়েস্ট এসেছে...");

    // ১. পুরনো সব জটলা টেবিল এক ক্লিকে সম্পূর্ণ ড্রপ/মুছে ফেলা
    pool.query("DROP TABLE IF EXISTS user_deposits, user_withdrawals, deposits, withdrawals", (dropErr) => {
        if (dropErr) {
            return res.status(500).send("পুরনো টেবিল মুছতে ডেটাবেসে সমস্যা হয়েছে: " + dropErr.message);
        }

        // ২. নতুন বড় সাইজের (VARCHAR 255) স্ট্যাটাস ফিল্ড দিয়ে রিচার্জ টেবিল তৈরি
        pool.query(`
            CREATE TABLE user_deposits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                txid VARCHAR(255) NOT NULL UNIQUE,
                status VARCHAR(255) DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `, (depErr) => {
            if (depErr) console.error("Deposits table create error:", depErr);

            // ৩. নতুন বড় সাইজের (VARCHAR 255) স্ট্যাটাস ফিল্ড দিয়ে উইথড্রল টেবিল তৈরি
            pool.query(`
                CREATE TABLE user_withdrawals (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    email VARCHAR(255) NOT NULL,
                    amount DECIMAL(10, 2) NOT NULL,
                    address VARCHAR(255) NOT NULL,
                    status VARCHAR(255) DEFAULT 'Pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `, (witErr) => {
                if (witErr) console.error("Withdrawals table create error:", witErr);

                // সফল হলে ব্রাউজার স্ক্রিনে এই মেসেজটি দেখাবে
                res.send("<h1>ডেটাবেস টেবিল সফলভাবে ফিক্স করা হয়েছে! 🎉</h1><p>পুরনো টেবিলগুলো মুছে নতুন সঠিক টেবিল তৈরি হয়েছে। এখন আপনি নতুন রিকোয়েস্ট পাঠিয়ে পরীক্ষা করতে পারেন।</p>");
            });
        });
    });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
