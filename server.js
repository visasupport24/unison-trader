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

// উইথড্র হিস্ট্রি রাখার জন্য নতুন টেবিল
pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        address VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) console.error("Withdrawals টেবিল তৈরিতে সমস্যা:", err);
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

// --- উইথড্র রিকোয়েস্ট সাবমিট এবং ব্যালেন্স কাটার এপিআই ---
app.post('/api/withdraw/submit', (req, res) => {
    const { email, amount, address } = req.body;

    if (!email || !amount || !address) {
        return res.status(400).json({ success: false, message: "সবগুলো ফিল্ড পূরণ করা বাধ্যতামূলক!" });
    }

    // প্রথমে চেক করা ইউজারের পর্যাপ্ত ব্যালেন্স আছে কিনা
    pool.query('SELECT balance FROM users WHERE email = ?', [email], (err, rows) => {
        if (err || rows.length === 0) return res.status(500).json({ success: false, message: "ইউজার তথ্য পাওয়া যায়নি" });
        
        const currentBalance = parseFloat(rows[0].balance);
        if (currentBalance < parseFloat(amount)) {
            return res.status(400).json({ success: false, message: "পর্যাপ্ত ব্যালেন্স নেই!" });
        }

        // ১. উইথড্রাল টেবিলে রিকোয়েস্ট ইনসার্ট করা
        pool.query('INSERT INTO withdrawals (email, amount, address) VALUES (?, ?, ?)', [email, amount, address], (err) => {
            if (err) return res.status(500).json({ success: false, message: "রিকোয়েস্ট প্রসেস করা যায়নি।" });

            // ২. মেইন ইউজার টেবিল থেকে ব্যালেন্স কেটে নেওয়া
            pool.query('UPDATE users SET balance = balance - ? WHERE email = ?', [amount, email], (err) => {
                if (err) return res.status(500).json({ success: false, message: "ব্যালেন্স আপডেট করতে সমস্যা হয়েছে" });

                // নতুন ব্যালেন্স কত হলো তা তুলে আনা
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
// --- অ্যাডমিন প্যানেলের জন্য সব রিকোয়েস্টের ডেটা পাঠানোর এপিআই ---
app.get('/api/admin/requests', (req, res) => {
    // deposits এবং withdrawals দুই টেবিল থেকেই সব ডেটা তুলে আনা
    pool.query('SELECT * FROM deposits ORDER BY id DESC', (err, deposits) => {
        if (err) return res.status(500).json({ success: false, message: "ডেটাবেস ত্রুটি" });
        
        pool.query('SELECT * FROM withdrawals ORDER BY id DESC', (err, withdrawals) => {
            if (err) return res.status(500).json({ success: false, message: "ডেটাবেস ত্রুটি" });
            
            res.json({ success: true, deposits, withdrawals });
        });
    });
});

// --- অ্যাডমিন কর্তৃক রিচার্জ অনুমোদন (Approve) করার এপিআই ---
app.post('/api/admin/recharge/approve', (req, res) => {
    const { id, email, amount } = req.body;

    if (!id || !email || !amount) {
        return res.status(400).json({ success: false, message: "প্রয়োজনীয় তথ্য পাওয়া যায়নি" });
    }

    // ১. প্রথমে ডিপোজিটের স্ট্যাটাস 'Approved' করা
    pool.query('UPDATE deposits SET status = "Approved" WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });

        // ২. ইউজারের মেইন ব্যালেন্সে টাকা যোগ করে দেওয়া
        pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [amount, email], (err) => {
            if (err) return res.status(500).json({ success: false, message: "ইউজারের ব্যালেন্স আপডেট করা যায়নি" });
            
            res.json({ success: true, message: `ইউজার ${email}-এর ব্যালেন্স সফলভাবে আপডেট করা হয়েছে এবং রিকোয়েস্টটি অনুমোদিত হয়েছে! ✅` });
        });
    });
});

// --- অ্যাডমিন কর্তৃক উইথড্রল রিকোয়েস্ট সফল বা বাতিল করার এপিআই ---
app.post('/api/admin/withdraw/action', (req, res) => {
    const { id, action, email, amount } = req.body; // action হতে পারে 'Success' অথবা 'Rejected'

    if (!id || !action || !email || !amount) {
        return res.status(400).json({ success: false, message: "প্রয়োজনীয় তথ্য পাওয়া যায়নি" });
    }

    if (action === 'Success') {
        // উইথড্র সফল হলে স্ট্যাটাস 'Success' করে দেওয়া
        pool.query('UPDATE withdrawals SET status = "Success" WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });
            res.json({ success: true, message: "উইথড্র রিকোয়েস্টটি সফলভাবে সম্পন্ন (Success) করা হয়েছে! ✅" });
        });
    } else if (action === 'Rejected') {
        // উইথড্র বাতিল হলে স্ট্যাটাস 'Rejected' হবে এবং কেটে নেওয়া টাকা ইউজারের মেইন ব্যালেন্সে ফেরত যাবে
        pool.query('UPDATE withdrawals SET status = "Rejected" WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });

            pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [amount, email], (err) => {
                if (err) return res.status(500).json({ success: false, message: "ইউজারের ব্যালেন্স ফেরত দেওয়া যায়নি" });
                res.json({ success: true, message: "উইথড্র রিকোয়েস্টটি বাতিল করা হয়েছে এবং ব্যালেন্স ফেরত দেওয়া হয়েছে। ❌" });
            });
        });
    }
});

// রুট পেজ এবং সার্ভার লিসেনিং কোড আগের মতোই নিচে থাকবে...

// রুট পেজ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`সার্ভার চলছে পোর্ট: ${PORT}`));
