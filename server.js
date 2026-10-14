const express = require('express');
const mysql = require('mysql2');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ফ্রন্টএন্ড স্ট্যাটিক ফাইলসমূহ (HTML, CSS) সরাসরি রুট থেকে পড়ার অনুমতি
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
        rejectUnauthorized: false // Aiven-এর জন্য এটি অত্যন্ত জরুরী
    }
});

// =========================================================================
// ১. ডেটাবেস টেবিলসমূহ তৈরি করার সেকশন (স্বয়ংক্রিয়ভাবে ডাটাবেস সেটআপ হবে)
// =========================================================================
pool.query("DROP TABLE IF EXISTS deposits, withdrawals", (err) => { 
    if(!err) console.log("পুরনো টেবিল মুছে ফেলা হয়েছে, নতুন টেবিল তৈরি হচ্ছে..."); 
});

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
    if (err) {
        console.error("users টেবিল তৈরি করতে সমস্যা হয়েছে:", err);
    } else {
        console.log("MySQL 'users' টেবিল সম্পূর্ণ রেডি! ✅");
    }
});

// রিচার্জ/ডিপোজিট টেবিল
pool.query(`
    CREATE TABLE IF NOT EXISTS deposits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        txid VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(255) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err, results) => {
    if (err) {
        console.error("deposits টেবিল তৈরি করতে সমস্যা হয়েছে:", err);
    } else {
        console.log("MySQL 'deposits' টেবিল সম্পূর্ণ রেডি! ✅");
    }
});

// উইথড্রল টেবিল
pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        address VARCHAR(255) NOT NULL,
        status VARCHAR(255) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`, (err, results) => {
    if (err) {
        console.error("withdrawals টেবিল তৈরি করতে সমস্যা হয়েছে:", err);
    } else {
        console.log("MySQL 'withdrawals' টেব일 সম্পূর্ণ রেডি! ✅");
    }
});

// =========================================================================
// ২. ইউজার অথেন্টিকেশন ও কোর এপিআই রুটসমূহ (লগইন, সাইন-আপ, টাস্ক)
// =========================================================================

// নতুন সাইন-আপ এপিআই
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

        const user = results[0]; // আগের সেই ফিক্সড ইন্ডেক্সিং
        res.json({ 
            success: true, 
            message: "লগইন সফল হয়েছে!",
            user: { email: user.email, balance: user.balance, vip: user.vip_level }
        });
    });
});

// টাস্ক কমপ্লিট করে ব্যালেন্স বাড়ানোর এপিআই
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
                message: `টাস্ক সফলভাবে সম্পন্ন হয়েছে! আপনি ${taskReward} USDT পেয়েছেন।`,
                newBalance: rows[0].balance
            });
        });
    });
});

// =========================================================================
// ৩. ট্রানজেকশন সাবমিশন এপিআই সেকশন (রিচার্জ ও উইথড্রল সাবমিট)
// =========================================================================

// রিচার্জ রিকোয়েস্ট জমা দেওয়ার এপিআই
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

// উইথড্র রিকোয়েস্ট সাবমিট এবং ইনস্ট্যান্ট মেইন ব্যালেন্স কাটার এপিআই
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

        pool.query('INSERT INTO withdrawals (email, amount, address) VALUES (?, ?, ?)', [email, amount, address], (err) => {
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
// ৪. অ্যাডমিন কন্ট্রোল ও ওনার ম্যানেজমেন্ট এপিআই রুটসমূহ (Approve/Reject সিস্টেম)
// =========================================================================

// অ্যাডমিন প্যানেলের জন্য সব রিকোয়েস্টের ডেটা লিস্টিং এপিআই
app.get('/api/admin/requests', (req, res) => {
    pool.query('SELECT * FROM deposits ORDER BY id DESC', (err, deposits) => {
        if (err) return res.status(500).json({ success: false, message: "ডিপোজিট ডেটা লোড ত্রুটি" });
        
        pool.query('SELECT * FROM withdrawals ORDER BY id DESC', (err, withdrawals) => {
            if (err) return res.status(500).json({ success: false, message: "উইথড্র ডেটা লোড ত্রুটি" });
            
            res.json({ success: true, deposits, withdrawals });
        });
    });
});

// অ্যাডমিন কর্তৃক রিচার্জ অনুমোদন (Approve) করার এপিআই
app.post('/api/admin/recharge/approve', (req, res) => {
    const { id, email, amount } = req.body;

    if (!id || !email || !amount) {
        return res.status(400).json({ success: false, message: "প্রয়োজনীয় তথ্য পাওয়া যায়নি" });
    }

        pool.query('UPDATE deposits SET status = "Approved" WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });

        pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [amount, email], (err) => {
            if (err) return res.status(500).json({ success: false, message: "ইউজারের ব্যালেন্স আপডেট করা যায়নি" });
            
            res.json({ success: true, message: `ইউজার ${email}-এর ব্যালেন্স সফলভাবে আপডেট করা হয়েছে এবং রিকোয়েস্টটি অনুমোদিত হয়েছে! ✅` });
        });
    });
});

// অ্যাডমিন কর্তৃক রিচার্জ রিকোয়েস্ট বাতিল (Reject) করার এপিআই
app.post('/api/admin/recharge/reject', (req, res) => {
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ success: false, message: "প্রয়োজনীয় আইডি পাওয়া যায়নি" });
    }

    pool.query('UPDATE deposits SET status = "Rejected" WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });
        
        res.json({ success: true, message: "রিচার্জ রিকোয়েস্টটি সফলভাবে বাতিল (Rejected) করা হয়েছে! ❌" });
    });
});

// অ্যাডমিন কর্তৃক উইথড্রল রিকোয়েস্ট সফল (Success) বা বাতিল (Reject) করার এপিআই
app.post('/api/admin/withdraw/action', (req, res) => {
    const { id, action, email, amount } = req.body; // action হতে পারে 'Success' অথবা 'Rejected'

    if (!id || !action || !email || !amount) {
        return res.status(400).json({ success: false, message: "প্রয়োজনীয় তথ্য পাওয়া যায়নি" });
    }

    if (action === 'Success') {
        pool.query('UPDATE withdrawals SET status = "Success" WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });
            res.json({ success: true, message: "উইথড্র রিকোয়েস্টটি সফলভাবে সম্পন্ন (Success) করা হয়েছে! ✅" });
        });
    } else if (action === 'Rejected') {
        pool.query('UPDATE withdrawals SET status = "Rejected" WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ success: false, message: "স্ট্যাটাস আপডেট করা যায়নি" });

            // উইথড্র বাতিল হলে কেটে নেওয়া টাকা ইউজারের মেইন ব্যালেন্সে রিফান্ড (Refund) হবে
            pool.query('UPDATE users SET balance = balance + ? WHERE email = ?', [amount, email], (err) => {
                if (err) return res.status(500).json({ success: false, message: "ইউজারের ব্যালেন্স ফেরত দেওয়া যায়নি" });
                res.json({ success: true, message: "উইথড্র রিকোয়েস্টটি বাতিল করা হয়েছে এবং ব্যালেন্স ফেরত দেওয়া হয়েছে। ❌" });
            });
        });
    }
});

// বেসিক রুট - index.html ওপেন করবে
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// সার্ভার পোর্ট লিসেনিং
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`সার্ভারটি সফলভাবে চালু হয়েছে পোর্ট: ${PORT}`);
});
