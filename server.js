require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));


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

// সুরক্ষিত উপায়ে টেবিল চেক করার ফাংশন (কোনো ডেটা ডিলিট হবে না)
const initTables = () => {
    console.log("ডাটাবেজ টেবিল চেকিং শুরু হচ্ছে...");
        // [১ বারের জন্য কলাম তৈরির বিকল্প সুরক্ষিত মেথড]
    pool.query("ALTER TABLE site_settings ADD COLUMN admin_qr VARCHAR(500) DEFAULT '';", (err) => {
        if (err) {
            // যদি কলামটি আগে থেকেই তৈরি করা থাকে (Duplicate column error), তবে এটি ইগনোর হবে
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log("admin_qr কলামটি ইতিমধ্যে ডাটাবেজে উপস্থিত আছে।");
            } else {
                console.log("কলাম তৈরিতে অন্য সমস্যা:", err.message);
            }
        } else {
            console.log("অভিনন্দন! admin_qr কলামটি সফলভাবে ডাটাবেজে যুক্ত হয়েছে।");
        }
    });
    // [১ বারের জন্য ফোর্স সেটিংস ইনসার্ট লজিক - ডাটাবেজে আইডি ১ নিশ্চিত করতে]
    pool.query("INSERT IGNORE INTO site_settings (id, notice, admin_trc20, admin_qr, telegram_link, support_email, about_text) VALUES (1, 'Welcome to Unison Trading!', 'TY7RkX9pQzWv4mMn5sLtKdJfHgFdSaQwEr', '', '', 'support@unisontrading.com', 'UNISON TRADING is a secure crypto investment platform.');", (err) => {
        if (err) console.log("ডিফল্ট সেটিংস ইনসার্ট এরর (হয়তো আগে থেকেই আইডি ১ আছে):", err.message);
        else console.log("সাফল্যের সাথে ডাটাবেজে আইডি ১ এর ডিফল্ট সেটিংস রো ইনসার্ট করা হয়েছে।");
    });
    // ইউজার টেবিলে KYC ডকুমেন্ট ছবির কলাম যোগ করা
    pool.query("ALTER TABLE users ADD COLUMN kyc_image LONGTEXT;", (err) => {
        if (err && err.code !== 'ER_DUP_FIELDNAME') console.log("KYC Image Column Error:", err.message);
    });


    // ১. ইউজার টেবিল
    const usersTable = `
    CREATE TABLE IF NOT EXISTS users (
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

    // ২. ট্রানজেকশন টেবিল
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
    admin_qr VARCHAR(500) DEFAULT '',
    telegram_link VARCHAR(255) DEFAULT '',
    support_email VARCHAR(100) DEFAULT 'support@unisontrading.com',
    about_text TEXT
);`;


    // ক্রমান্বয়ে টেবিল চেক করা ও ডিফল্ট ডেটা সেট করা
    pool.query(usersTable, (err) => {
        if (err) return console.error("users টেবিল চেকিংয়ে সমস্যা:", err.message);
        
        pool.query(txTable, (err) => {
            if (err) return console.error("transactions টেবিল চেকিংয়ে সমস্যা:", err.message);
            
            pool.query(settingsTable, (err) => {
                if (err) return console.error("site_settings টেবিল চেকিংয়ে সমস্যা:", err.message);
                
                // INSERT IGNORE ব্যবহারের ফলে ডুপ্লিকেট ডেটা বা এরর আসবে না
                pool.query('INSERT IGNORE INTO site_settings (id, notice, about_text) VALUES (1, "Welcome to Unison Trading!", "UNISON TRADING is a secure crypto investment platform.")');
                pool.query('INSERT IGNORE INTO users (email_phone, password, role) VALUES ("admin@unisontrading.com", "admin1234", "admin")');
                console.log("ডাটাবেজ সুরক্ষিত: সকল টেবিল ও ডিফল্ট ডেটা সিঙ্ক সম্পন্ন হয়েছে।");
            });
        });
    });
};

// সার্ভার চালু হওয়ার সময় টেবিল স্ট্রাকচার চেক হবে
initTables();


// ================= API ENDPOINTS =================

// ১. ইউজার রেজিস্ট্রেশন (Sign Up) - [রেফারেল ও টিম মেম্বার ফিক্সড]
app.post('/api/register', (req, res) => {
    const { email_phone, password, referred_by } = req.body; 
    
    if (!email_phone || !password) {
        return res.status(400).json({ success: false, message: 'সবগুলো ঘর পূরণ করুন!' });
    }

    // ইমেইল বা ফোন ইতিমধ্যে ডাটাবেজে আছে কি না চেক করা
    pool.query('SELECT * FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি!' });
        if (results && results.length > 0) {
            return res.status(400).json({ success: false, message: 'এই ইমেইল বা ফোন ইতিমধ্যে নিবন্ধিত!' });
        }

        // নতুন ইউজার ডাটাবেজে ইনসার্ট করা (referred_by তথ্য সহ)
        const refUser = referred_by ? referred_by.trim() : null;
        
        pool.query('INSERT INTO users (email_phone, password, referred_by) VALUES (?, ?, ?)', [email_phone, password, refUser], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'রেজিস্ট্রেশন ব্যর্থ হয়েছে!' });
            
            // যদি নতুন ইউজার কারো রেফার লিংকের মাধ্যমে আসে, তবে রেফারারের টিম মেম্বার সংখ্যা ১ বাড়িয়ে দেওয়া
            if (refUser) {
                pool.query('UPDATE users SET team_member = team_member + 1 WHERE email_phone = ?', [refUser], (err) => {
                    if (err) console.error("Team member update error:", err.message);
                });
            }

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
        
        // [সংশোধিত] results[0] ব্যবহার নিশ্চিত করা হলো
        if (results[0].status === 'banned') {
            return res.status(403).json({ success: false, message: 'আপনার অ্যাকাউন্ট ব্লক করা!' });
        }

        res.json({ 
            success: true, 
            message: 'লগইন সফল হয়েছে!', 
            role: results[0].role // [সংশোধিত] results[0] করা হলো
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

// ১৩. ইউজারের নিজস্ব ট্রানজেকশন হিস্ট্রি (Add Fund & Withdraw) দেখার এপিআই
app.get('/api/user/transactions', (req, res) => {
    const { email_phone } = req.query;
    
    if (!email_phone) {
        return res.status(400).json({ success: false, message: 'ইউজার আইডি প্রদান করা বাধ্যতামূলক।' });
    }

    // নির্দিষ্ট ইউজারের সমস্ত ট্রানজেকশন নতুন থেকে পুরনো ক্রমানুসারে (DESC) আনার কুয়েরি
    const query = "SELECT id, type, amount, status, created_at FROM transactions WHERE email_phone = ? ORDER BY created_at DESC";
    pool.query(query, [email_phone], (err, results) => {
        if (err) {
            console.error("User Fetch History Error:", err);
            return res.status(500).json({ success: false, message: 'হিস্ট্রি লোড করতে ডাটাবেজ ত্রুটি।' });
        }
        res.json({ success: true, history: results });
    });
});

// ৪. ফান্ড অ্যাড রিকোয়েস্ট (Add Fund) - [১০০% ফিক্সড কুয়েরি]
app.post('/api/user/add-fund', (req, res) => {
    const { email_phone, amount, txid } = req.body; 
    
    const parsedAmount = parseFloat(amount);
    
    if (!email_phone || isNaN(parsedAmount) || !txid) {
        return res.status(400).json({ success: false, message: 'সবগুলো তথ্য সঠিকভাবে দিন!' });
    }

    // এখানে "deposit" এর জায়গায় সিঙ্গেল কোটেশন 'deposit' ব্যবহার করে ফিক্স করা হলো
    const query = "INSERT INTO transactions (email_phone, type, amount, proof_or_address, status) VALUES (?, 'deposit', ?, ?, 'pending')";
    pool.query(query, [email_phone, parsedAmount, txid], (err) => {
        if (err) {
            console.error("Deposit Error Details:", err);
            return res.status(500).json({ success: false, message: 'ডেটাবেজ ত্রুটি।' });
        }
        res.json({ success: true, message: 'রিকোয়েস্ট সফলভাবে জমা হয়েছে!' });
    });
});


// ৫. উইথড্র রিকোয়েস্ট (Withdraw) - [১০০% ফিক্সড কুয়েরি]
app.post('/api/fund/withdraw', (req, res) => {
    const { email_phone, amount, trc20_address } = req.body;
    const withdrawAmount = parseFloat(amount);

    if (!email_phone || isNaN(withdrawAmount) || !trc20_address) {
        return res.status(400).json({ success: false, message: 'সবগুলো তথ্য সঠিকভাবে দিন!' });
    }

    pool.query('SELECT balance FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি!' });
        if (!results || results.length === 0) return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি।' });

        const currentBalance = parseFloat(results[0].balance);
        if (withdrawAmount > currentBalance) {
            return res.status(400).json({ success: false, message: 'আপনার অ্যাকাউন্টে পর্যাপ্ত ব্যালেন্স নেই!' });
        }

        // প্রথমে ডাটাবেজে ট্রানজেকশন রেকর্ড নিশ্চিত করা (ডাবল কোটেশন বদলে সিঙ্গেল কোটেশন 'withdraw' করা হলো)
        const txQuery = "INSERT INTO transactions (email_phone, type, amount, proof_or_address, status) VALUES (?, 'withdraw', ?, ?, 'pending')";
        pool.query(txQuery, [email_phone, withdrawAmount, trc20_address], (err) => {
            if (err) {
                console.error("Withdraw Tx Error:", err.message);
                return res.status(500).json({ success: false, message: 'ট্রানজেকশন রেকর্ড ব্যর্থ।' });
            }

            // ট্রানজেকশন রেকর্ড সফল হলেই কেবল ইউজারের মেইন ব্যালেন্স থেকে টাকা কাটা হবে (সেফটি মেথড)
            pool.query('UPDATE users SET balance = balance - ? WHERE email_phone = ?', [withdrawAmount, email_phone], (err) => {
                if (err) {
                    console.error("Balance Update Error:", err.message);
                    return res.status(500).json({ success: false, message: 'ব্যালেন্স আপডেট ব্যর্থ।' });
                }
                
                res.json({ success: true, message: 'উইথড্র রিকোয়েস্ট সফলভাবে জমা হয়েছে!' });
            });
        });
    });
});



// ৬. সাইট সেটিংস ও নোটিশ লোড (টেলিগ্রাম, ইমেল এবং কিউআর কোডসহ সম্পূর্ণ সংশোধিত)
app.get('/api/site/settings', (req, res) => {
    // এখানে কুয়েরির ভেতর 'admin_qr' যুক্ত করে দেওয়া হয়েছে
    pool.query('SELECT notice, about_text, admin_trc20, admin_qr, telegram_link, support_email FROM site_settings WHERE id = 1', (err, results) => {
        if (err || !results || results.length === 0) {
            return res.status(500).json({ success: false, message: 'সেটিংস লোড ব্যর্থ।' });
        }
        // results[0] দেওয়ার ফলে ফ্রন্টঅ্যান্ডে ডেটা রিড করতে কোনো বাগ আসবে না
        res.json({ success: true, settings: results[0] });
    });
});


// ১১. অ্যাডমিন প্যানেল থেকে সাইট সেটিংস (টেলিগ্রাম ও ইমেইল) আপডেট করার এপিআই
app.post('/api/admin/update-settings', (req, res) => {
    const { telegram_link, support_email } = req.body;

    if (!telegram_link || !support_email) {
        return res.status(400).json({ success: false, message: 'টেলিগ্রাম এবং ইমেইল দুটোই প্রদান করুন।' });
    }

    const query = "UPDATE site_settings SET telegram_link = ?, support_email = ? WHERE id = 1";
    pool.query(query, [telegram_link, support_email], (err) => {
        if (err) {
            console.error("Settings Update Error:", err);
            return res.status(500).json({ success: false, message: 'সেটিংস আপডেট করতে ডাটাবেজ ত্রুটি।' });
        }
        res.json({ success: true, message: 'সাপোর্ট টেলিগ্রাম এবং ইমেইল সফলভাবে আপডেট হয়েছে!' });
    });
});

// অ্যাডমিন সিক্রেট লগইন
app.post('/api/admin/secret-login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin@unisontrading.com' && password === 'admin1234') {
        return res.json({ success: true, message: 'অ্যাডমিন লগইন সফল!', role: 'admin' });
    } else {
        return res.status(401).json({ success: false, message: 'ভুল অ্যাডমিন ক্রেডেনশিয়াল!' });
    }
});

// ================= ADMIN CONTROL API ENDPOINTS =================

// ১. পেন্ডিং ট্রানজেকশন (ডিপোজিট/উইথড্র) রিকোয়েস্ট লিস্ট লোড করা
app.get('/api/admin/transactions', (req, res) => {
    const { type } = req.query; // ফ্রন্টএন্ড থেকে 'deposit' অথবা 'withdraw' আসবে
    if (!type) return res.status(400).json({ success: false, message: 'টাইপ উল্লেখ করুন।' });

    const query = "SELECT id, email_phone, amount, proof_or_address, status FROM transactions WHERE type = ? AND status = 'pending' ORDER BY created_at DESC";
    pool.query(query, [type], (err, results) => {
        if (err) {
            console.error("Admin Fetch Error:", err);
            return res.status(500).json({ success: false, message: 'ডাটাবেজ ত্রুটি!' });
        }
        res.json({ success: true, requests: results });
    });
});

// ২. ডিপোজিট/উইথড্র রিকোয়েস্ট অ্যাপ্রুভ বা রিজেক্ট করা
app.post('/api/admin/update-transaction', (req, res) => {
    const { id, status, email_phone, amount } = req.body;

    if (!id || !status || !email_phone) {
        return res.status(400).json({ success: false, message: 'সবগুলো তথ্য প্রদান করুন।' });
    }

    // ট্রানজেকশন স্ট্যাটাস আপডেট করা (Approved/Rejected)
    const updateTxQuery = 'UPDATE transactions SET status = ? WHERE id = ?';
    pool.query(updateTxQuery, [status, id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'ট্রানজেকশন স্ট্যাটাস আপডেট ব্যর্থ।' });

        // রিকোয়েস্টটি যদি 'deposit' এবং 'approved' হয়, তবে ইউজারের মেইন ব্যালেন্স বাড়িয়ে দেওয়া
        if (status === 'approved' && amount > 0) {
            const updateBalanceQuery = 'UPDATE users SET balance = balance + ? WHERE email_phone = ?';
            pool.query(updateBalanceQuery, [parseFloat(amount), email_phone], (err) => {
                if (err) return res.status(500).json({ success: false, message: 'ইউজার ব্যালেন্স আপডেট ব্যর্থ।' });
                return res.json({ success: true, message: 'রিকোয়েস্টটি সফলভাবে অ্যাপ্রুভ করা হয়েছে এবং ব্যালেন্স যোগ হয়েছে।' });
            });
        } else {
            return res.json({ success: true, message: `রিকোয়েস্টটি সফলভাবে ${status === 'rejected' ? 'রিজেক্ট' : 'আপডেট'} করা হয়েছে।` });
        }
    });
});
// ১০. ইউজারের পাসওয়ার্ড পরিবর্তনের এপিআই (Password Change)
app.post('/api/user/change-password', (req, res) => {
    const { email_phone, oldPassword, newPassword } = req.body;

    if (!email_phone || !oldPassword || !newPassword) {
        return res.status(400).json({ success: false, message: 'সবগুলো তথ্য সঠিকভাবে দিন।' });
    }

    // প্রথমে ইউজারের পুরনো পাসওয়ার্ড চেক করা
    pool.query('SELECT password FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি!' });
        if (!results || results.length === 0) return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি।' });

        const currentDbPassword = results[0].password;
        
        // বর্তমান প্লেইন পাসওয়ার্ডের সাথে ম্যাচ করানো
        if (oldPassword !== currentDbPassword) {
            return res.status(400).json({ success: false, message: 'আপনার বর্তমান পাসওয়ার্ডটি ভুল!' });
        }

        // ম্যাচ করলে নতুন পাসওয়ার্ড আপডেট করা
        pool.query('UPDATE users SET password = ? WHERE email_phone = ?', [newPassword, email_phone], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'ডাটাবেজ আপডেট ব্যর্থ।' });
            res.json({ success: true, message: 'পাসওয়ার্ড সফলভাবে পরিবর্তিত হয়েছে।' });
        });
    });
});

// ১২. অ্যাডমিন প্যানেল থেকে কোম্পানির TRC-20 অ্যাড্রেস ও কিউআর কোড লিংক আপডেট করার এপিআই
app.post('/api/admin/update-gateway', (req, res) => {
    const { admin_trc20, admin_qr } = req.body;

    if (!admin_trc20) {
        return res.status(400).json({ success: false, message: 'TRC-20 অ্যাড্রেস প্রদান করা বাধ্যতামূলক।' });
    }

    const query = "UPDATE site_settings SET admin_trc20 = ?, admin_qr = ? WHERE id = 1";
    pool.query(query, [admin_trc20, admin_qr], (err) => {
        if (err) {
            console.error("Gateway Update Error:", err);
            return res.status(500).json({ success: false, message: 'গেটওয়ে আপডেট করতে ডাটাবেজ ত্রুটি।' });
        }
        res.json({ success: true, message: 'কোম্পানি ওয়ালেট অ্যাড্রেস এবং কিউআর কোড সফলভাবে আপডেট হয়েছে!' });
    });
});

// ৬. ইউজারের KYC সাবমিশন রাউট
app.post('/api/user/kyc-submit', (req, res) => {
    const { email_phone, fullName, docType, docNumber } = req.body;
    if (!email_phone || !fullName || !docNumber) {
        return res.status(400).json({ success: false, message: 'সবগুলো তথ্য দিন।' });
    }

    // kyc_status সরাসরি pending এ নিয়ে যাওয়া
    const query = "UPDATE users SET kyc_status = 'pending' WHERE email_phone = ?";
    pool.query(query, [email_phone], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'ডাটাবেজ আপডেট ব্যর্থ।' });
        res.json({ success: true, message: 'KYC রিকোয়েস্ট পেন্ডিং তালিকায় যুক্ত হয়েছে।' });
    });
});

// ৭. অ্যাডমিনের জন্য পেন্ডিং KYC লিস্ট দেখা
app.get('/api/admin/kyc-requests', (req, res) => {
    const query = "SELECT id, email_phone, kyc_status FROM users WHERE kyc_status = 'pending' ORDER BY created_at DESC";
    pool.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'ডাটাবেজ ত্রুটি!' });
        res.json({ success: true, requests: results });
    });
});

// ৮. অ্যাডমিন দ্বারা KYC অ্যাপ্রুভ বা রিজেক্ট করা
app.post('/api/admin/update-kyc', (req, res) => {
    const { id, status } = req.body; // 'approved' বা 'rejected'
    if (!id || !status) return res.status(400).json({ success: false, message: 'তথ্য অপর্যাপ্ত।' });

    const query = "UPDATE users SET kyc_status = ? WHERE id = ?";
    pool.query(query, [status, id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'KYC স্ট্যাটাস আপডেট ব্যর্থ।' });
        res.json({ success: true, message: `KYC সফলভাবে ${status === 'approved' ? 'Approved' : 'Rejected'} করা হয়েছে।` });
    });
});

// ৯. ডেইলি প্রফিট ও এফিলিয়েট কমিশন ডিস্ট্রিবিউশন এপিআই (রাত ১২টার পর অ্যাডমিন রান করবে)
app.post('/api/admin/distribute-profit', (req, res) => {
    const { profit_rate } = req.body;
    const rate = parseFloat(profit_rate);

    // ১ থেকে ৩ শতাংশের মধ্যে ভ্যালিডেশন চেক
    if (isNaN(rate) || rate < 1 || rate > 3) {
        return res.status(400).json({ success: false, message: 'প্রফিট রেট অবশ্যই ১% থেকে ৩% এর মধ্যে হতে হবে।' });
    }

    const decimalProfitRate = rate / 100; // যেমন: 1.5% কে 0.015 করা হলো
    const decimalCommissionRate = decimalProfitRate / 5; // ৫ ভাগের ১ ভাগ (0.3% বা 0.003)

    // ডাটাবেজের সকল একটিভ ইউজারদের একসাথে ডেটা আপডেট করার কুয়েরি
    // প্রথমে যেসকল ইউজার অন্য কারও মাধ্যমে রেফারড হয়েছে, তাদের রেফারারদের কমিশন যোগ করা
    const affiliateQuery = `
        UPDATE users AS referrer
        JOIN users AS referee ON referee.referred_by = referrer.email_phone
        SET 
            referrer.balance = referrer.balance + (referee.balance * ?),
            referrer.todays_commission = referee.balance * ?
        WHERE referee.status = 'active' AND referee.balance > 0;
    `;

    // এরপর সকল মেইন ইউজারদের ব্যালেন্সে তাদের নিজস্ব প্রফিট যোগ করা
    const userProfitQuery = `
        UPDATE users 
        SET 
            balance = balance + (balance * ?),
            todays_profit = balance * ?
        WHERE status = 'active' AND balance > 0;
    `;

    // প্রথম কুয়েরি (এফিলিয়েট কমিশন বিতরণ)
    pool.query(affiliateQuery, [decimalCommissionRate, decimalCommissionRate], (err) => {
        if (err) {
            console.error("Affiliate Distribution Error:", err);
            return res.status(500).json({ success: false, message: 'এফিলিয়েট কমিশন বিতরণে ডাটাবেজ ত্রুটি।' });
        }

        // দ্বিতীয় কুয়েরি (ইউজারদের মেইন প্রফিট বিতরণ)
        pool.query(userProfitQuery, [decimalProfitRate, decimalProfitRate], (err) => {
            if (err) {
                console.error("User Profit Distribution Error:", err);
                return res.status(500).json({ success: false, message: 'ইউজার প্রফিট বিতরণে ডাটাবেজ ত্রুটি।' });
            }

            res.json({ 
                success: true, 
                message: `সফলভাবে সকল ইউজারের অ্যাকাউন্টে ${rate}% প্রফিট এবং রেফারারদের অ্যাকাউন্টে ৫ ভাগের ১ ভাগ কমিশন যোগ করা হয়েছে!` 
            });
        });
    });
});


// SPA রাউটিং হ্যান্ডলার (সব পেজ রুট থেকে হ্যান্ডেল করার জন্য)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// সার্ভার পোর্ট লিসেনিং ও স্টার্টআপ মেসেজ
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`UNISON TRADING সার্ভার সফলভাবে চালু হয়েছে। পোর্ট: ${PORT}`);
});

