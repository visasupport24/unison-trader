const express = require('express');
const mysql = require('mysql2');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ফ্রন্টএন্ড স্ট্যাটিক ফাইলসমূহ সরাসরি রুট থেকে পড়ার অনুমতি
app.use(express.static(path.join(__dirname, './')));

// Aiven MySQL ডেটাবেস কানেকশন সেটআপ
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
// ১. ডেটাবেস টেবিলসমূহ তৈরি করার সেকশন (স্বয়ংক্রিয়ভাবে ডাটাবেস সেটআপ হবে)
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
`, (err, results) => {
    if (err) console.error("users টেবিল তৈরি করতে সমস্যা:", err);
    else console.log("MySQL 'users' টেবিল সম্পূর্ণ রেডি! ✅");
});

// রিচার্জ/ডিপোজিট টেবিল
pool.query(`
    CREATE TABLE IF NOT EXISTS user_deposits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        txid VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(255) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err, results) => {
    if (err) console.error("user_deposits টেবিল তৈরি করতে সমস্যা:", err);
    else console.log("MySQL 'user_deposits' টেবিল সম্পূর্ণ রেডি! ✅");
});

// উইথড্রল টেবিল
pool.query(`
    CREATE TABLE IF NOT EXISTS user_withdrawals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        address VARCHAR(255) NOT NULL,
        status VARCHAR(255) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err, results) => {
    if (err) console.error("user_withdrawals টেবিল তৈরি করতে সমস্যা:", err);
    else console.log("MySQL 'user_withdrawals' টেবিল সম্পূর্ণ রেডি! ✅");
});

// =========================================================================
// ২. ইউজার অথেন্টিকেশন ও কোর এপিআই রুটসমূহ (লগইন, সাইন-আপ, টাস্ক)
// =========================================================================

// সাইন-আপ এপিআই
app.post('/api/signup', (req, res) => {
    const { email, password } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ success: false, message: "ইমেইল এবং পাসওয়ার্ড দুটিই প্রয়োজন!" });
    }

    pool.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "ডেটাবেস যাচাইকরণ ত্রুটি" });
        if (results.length > 0) {
            return res.status(400).json({ success: false, message: "এই ইমেইল দিয়ে ইতিমধ্যে অ্যাকাউন্ট তৈরি করা আছে!" });
        }

        pool.query('INSERT INTO users (email, password) VALUES (?, ?)', [email, password], (err) => {
            if (err) return res.status(500).json({ success: false, message: "অ্যাকাউন্ট তৈরি করতে সমস্যা হয়েছে" });
            res.json({ success: true, message: "অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে! এখন লগইন করুন।" });
        });
    });
});

// লগইন এপিআই
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: "ইমেইল এবং পাসওয়ার্ড দুটিই দিন!" });
    }

    pool.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "ডেটাবেস ত্রুটি" });
        if (results.length === 0) {
            return res.status(401).json({ success: false, message: "ভুল ইমেইল অথবা পাসওয়ার্ড!" });
        }

        const user = results[0];
        res.json({ 
            success: true, 
            message: "লগইন সফল হয়েছে!",
            user: { email: user.email, balance: user.balance, vip: user.vip_level }
        });
    });
});

// টাস্ক কমপ্লিট এপিআই
app.post('/api/task/complete', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: "ইউজার ইমেইল প্রয়োজন!" });
    }

    const taskReward = 0.50; 

    pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [taskReward, email], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "ব্যালেন্স আপডেট করতে সমস্যা হয়েছে" });

        pool.query('SELECT balance FROM users WHERE email = ?', [email], (err, rows) => {
            if (err || rows.length === 0) return res.status(500).json({ success: false, message: "নতুন ব্যালেন্স লোড করা যায়নি" });
            
            res.json({ 
                success: true, 
                message: `টাস্ক সফল! আপনি ${taskReward} USDT পেয়েছেন।`,
                newBalance: rows[0].balance
            });
        });
    });
});

// =========================================================================
// ৩. ট্রানজেকশন সাবমিশন এপিআই সেকশন (রিচার্জ ও উইথড্রল সাবমিট)
// =========================================================================

// রিচার্জ রিকোয়েস্ট সাবমিট
app.post('/api/recharge/submit', (req, res) => {
    const { email, amount, txid } = req.body;

    if (!email || !amount || !txid) {
        return res.status(400).json({ success: false, message: "সবগুলো ফিল্ড পূরণ করা বাধ্যতামূলক!" });
    }

    pool.query('INSERT INTO user_deposits (email, amount, txid) VALUES (?, ?, ?)', [email, amount, txid], (err) => {
        if (err) {
            if(err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ success: false, message: "এই TxID টি ইতিমধ্যে ব্যবহার করা হয়েছে!" });
            }
            return res.status(500).json({ success: false, message: "রিকোয়েস্ট জমা নেওয়া যায়নি।" });
        }
        res.json({ success: true, message: "আপনার রিচার্জ রিকোয়েস্টটি পেন্ডিংয়ে জমা হয়েছে।" });
    });
});

// উইথড্র রিকোয়েস্ট সাবমিট
app.post('/api/withdraw/submit', (req, res) => {
    const { email, amount, address } = req.body;

    if (!email || !amount || !address) {
        return res.status(400).json({ success: false, message: "সবগুলো ফিল্ড পূরণ করা বাধ্যতামূলক!" });
    }

    pool.query('SELECT balance FROM users WHERE email = ?', [email], (err, rows) => {
        if (err || rows.length === 0) return res.status(500).json({ success: false, message: "ইউজার তথ্য পাওয়া যায়নি" });
        
        const currentBalance = parseFloat(rows[0].balance);
        if (currentBalance < parseFloat(amount)) {
            return res.status(400).json({ success: false, message: "পর্যাপ্ত ব্যালেন্স নেই!" });
        }

        pool.query('INSERT INTO user_withdrawals (email, amount, address) VALUES (?, ?, ?)', [email, amount, address], (err) => {
            if (err) return res.status(500).json({ success: false, message: "রিকোয়েস্ট প্রসেস করা যায়নি।" });

            pool.query('UPDATE users SET balance = balance - ? WHERE email = ?', [amount, email], (err) => {
                if (err) return res.status(500).json({ success: false, message: "ব্যালেন্স আপডেট করতে সমস্যা হয়েছে" });

                pool.query('SELECT balance FROM users WHERE email = ?', [email], (err, newRows) => {
                    res.json({ 
                        success: true, 
                        message: "আপনার উইথড্র রিকোয়েস্টটি সফলভাবে পেন্ডিংয়ে জমা হয়েছে।", 
                        newBalance: newRows[0].balance 
                    });
                });
            });
        });
    });
});

// =========================================================================
// ৪. অ্যাডমিন কন্ট্রোল ও ওনার ম্যানেজমেন্ট এপিআই রুটসমূহ (সংশোধিত ইনডেক্সিং)
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

// রিচার্জ অনুমোদন (Approve) - [সংশোধিত ইনডেক্স লজিক]
app.post('/api/admin/recharge/approve', (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ success: false, message: "প্রয়োজনীয় আইডি পাওয়া যায়নি" });
    }

    // প্রথমে ডিপোজিট আইডি থেকে রিয়েল ডেটা অ্যারে ধরে তুলে আনা
    pool.query('SELECT * FROM user_deposits WHERE id = ?', [id], (err, rows) => {
        if (err || rows.length === 0) return res.status(500).json({ success: false, message: "রিকোয়েস্ট ডেটাবেসে পাওয়া যায়নি" });
        
        const depositData = rows[0]; // এখানে প্রথম রো [0] ফিক্স করা হয়েছে
        if (depositData.status !== 'Pending') return res.status(400).json({ success: false, message: "এটি ইতিমধ্যে প্রসেস করা হয়েছে!" });

        // ১. user_deposits টেবিলে স্ট্যাটাস 'Approved' করা
        pool.query('UPDATE user_deposits SET status = "Approved" WHERE id = ?', [id], (upErr) => {
            if (upErr) return res.status(500).json({ success: false, message: "ডিপোজিট স্ট্যাটাস আপডেট করা যায়নি" });
            // ২. ইউজারের মূল ব্যালেন্সে টাকা যোগ করে দেওয়া
            pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [depositData.amount, depositData.email], (userErr) => {
                if (userErr) return res.status(500).json({ success: false, message: "ইউজারের ব্যালেন্স যোগ করা যায়নি" });
                
                res.json({ success: true, message: "রিচার্জ সফলভাবে অনুমোদিত হয়েছে! ✅" });
            });
        });
    });
});

// রিচার্জ বাতিল (Reject)
app.post('/api/admin/recharge/reject', (req, res) => {
    const { id } = req.body;

    if (!id) return res.status(400).json({ success: false, message: "প্রয়োজনীয় আইডি পাওয়া যায়নি" });

    pool.query('UPDATE user_deposits SET status = "Rejected" WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });
        res.json({ success: true, message: "রিচার্জ রিকোয়েস্টটি সফলভাবে বাতিল করা হয়েছে! ❌" });
    });
});

// উইথড্রল অ্যাকশন (Success / Reject)
app.post('/api/admin/withdraw/action', (req, res) => {
    const { id, action } = req.body; 

    if (!id || !action) return res.status(400).json({ success: false, message: "প্রয়োজনীয় তথ্য পাওয়া যায়নি" });

    pool.query('SELECT * FROM user_withdrawals WHERE id = ?', [id], (err, rows) => {
        if (err || rows.length === 0) return res.status(500).json({ success: false, message: "রিকোয়েস্ট পাওয়া যায়নি" });
        
        const withdrawalData = rows[0]; // প্রথম রো ফিক্স করা হয়েছে

        pool.query('UPDATE user_withdrawals SET status = ? WHERE id = ?', [action, id], (upErr) => {
            if (upErr) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });

            if (action === 'Rejected') {
                pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [withdrawalData.amount, withdrawalData.email], (userErr) => {
                    if (userErr) return res.status(500).json({ success: false, message: "ব্যালেন্স ফেরত দেওয়া যায়নি" });
                    res.json({ success: true, message: "উইথড্র বাতিল এবং ব্যালেন্স ফেরত দেওয়া হয়েছে। ❌" });
                });
            } else {
                res.json({ success: true, message: "উইথড্র রিকোয়েস্টটি সফলভাবে সম্পন্ন করা হয়েছে! ✅" });
            }
        });
    });
});

// =========================================================================
// ৫. ব্রাউজার ওয়ান-ক্লিক টেবিল ফিক্স লিংক
// =========================================================================
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
                res.send("<h1>Aiven ডেটাবেস টেবিল সম্পূর্ণ সফলভাবে ফিক্স করা হয়েছে! 🎉</h1>");
            });
        });
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

