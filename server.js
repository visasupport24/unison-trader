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
    connectTimeout: 10000, // ১০ সেকেন্ড টাইমআউট
    ssl: {
        rejectUnauthorized: false
    }
});

// ডেটাবেজ টেবিল সুরক্ষিতভাবে তৈরি করার ফাংশন (ডাটা ডিলিট হবে না)
const initTables = () => {
    // IF NOT EXISTS ব্যবহার করা হয়েছে যাতে সার্ভার রিস্টার্ট হলেও আগের ডাটা ডিলিট না হয়
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

    // টেবিলগুলো সিরিয়ালি তৈরি করা
    pool.query(usersTable, (err) => {
        if (err) console.error("users টেবিল তৈরিতে সমস্যা:", err.message);
        
        pool.query(txTable, (err) => {
            if (err) console.error("transactions টেবিল তৈরিতে সমস্যা:", err.message);
            
            pool.query(settingsTable, (err) => {
                if (err) console.error("site_settings টেবিল তৈরিতে সমস্যা:", err.message);
                
                // ডিফল্ট সাইট সেটিংস ডেটা ইনসার্ট করা (যদি না থাকে)
                pool.query('INSERT IGNORE INTO site_settings (id, notice, about_text) VALUES (1, "Welcome to Unison Trading!", "UNISON TRADING is a secure crypto investment platform.")');
                console.log("MySQL ডাটাবেজ টেবিল ভেরিফিকেশন সম্পন্ন হয়েছে।");
            });
        });
    });
};

// সার্ভার রানিং হওয়ার সাথে সাথে টেবিল চেক চালু হবে
initTables();

// ================= API ENDPOINTS =================

// ১. ইউজার রেজিস্ট্রেশন (Sign Up)
app.post('/api/register', (req, res) => {
    const { email_phone, password } = req.body;
    
    if (!email_phone || !password) {
        return res.status(400).json({ success: false, message: 'সবগুলো ঘর পূরণ করুন!' });
    }

    pool.query('SELECT * FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (err) {
            console.error("Select Error:", err.message);
            return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি!' });
        }
        if (results && results.length > 0) {
            return res.status(400).json({ success: false, message: 'এই ইমেইল বা ফোন ইতিমধ্যে নিবন্ধিত!' });
        }

        pool.query('INSERT INTO users (email_phone, password) VALUES (?, ?)', [email_phone, password], (err) => {
            if (err) {
                console.error("Insert Error:", err.message);
                return res.status(500).json({ success: false, message: 'রেজিস্ট্রেশন ব্যর্থ হয়েছে!' });
            }
            res.json({ success: true, message: 'রেজিস্ট্রেশন সফল হয়েছে!' });
        });
    });
});

// ২. ইউজার লগইন (Login)
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

        res.json({ success: true, message: 'লগইন সফল হয়েছে!' });
    });
});

// ৩. ড্যাশবোর্ড ও প্রোফাইল ডেটা লোড (ফ্রন্টএন্ড ক্র্যাশ বাগ ফিক্সড)
app.get('/api/user/dashboard', (req, res) => {
    const { email_phone } = req.query;
    pool.query('SELECT balance, todays_profit, team_member, todays_commission, kyc_status FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (err || !results || results.length === 0) {
            return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি' });
        }
        // ফ্রন্টএন্ড কোডের সাথে ম্যাচ করানোর জন্য অবজেক্ট রিটার্ন
        res.json({ success: true, user: results[0] });
    });
});

// ৪. ফান্ড অ্যাড রিকোয়েস্ট (Add Fund)
app.post('/api/fund/add', (req, res) => {
    const { email_phone, amount, proof } = req.body;
    
    if (!email_phone || !amount || !proof) {
        return res.status(400).json({ success: false, message: 'সবগুলো তথ্য সঠিকভাবে দিন!' });
    }

    const query = 'INSERT INTO transactions (email_phone, type, amount, proof_or_address, status) VALUES (?, "deposit", ?, ?, "pending")';
    pool.query(query, [email_phone, amount, proof], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'ডেটাবেজ ত্রুটি।' });
        res.json({ success: true, message: 'রিকোয়েস্ট সফলভাবে জমা হয়েছে!' });
    });
});

// ৫. উইথড্র রিকোয়েস্ট (Withdraw - সম্পূর্ণ ফিক্সড এবং ক্লোজড)
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

        // ব্যবহারকারীর ব্যালেন্স থেকে টাকা কেটে নেওয়া এবং ট্রানজেকশনে যুক্ত করা
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

// ৬. সাইট সেটিংস লোড (Notice Board & About Us)
app.get('/api/site/settings', (req, res) => {
    pool.query('SELECT notice, about_text, admin_trc20, telegram_link FROM site_settings WHERE id = 1', (err, results) => {
        if (err || !results || results.length === 0) {
            return res.status(500).json({ success: false, message: 'সেটিংস লোড ব্যর্থ।' });
        }
        res.json({ success: true, settings: results[0] });
    });
});

// ================= SERVING STATIC HTML PAGES =================
// লিনাক্স হোস্টিংয়ের জন্য এক্সপ্লিসিট স্ট্যাটিক রেন্ডারিং রাউট
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/profile.html', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/about.html', (req, res) => res.sendFile(path.join(__dirname, 'about.html')));
app.get('/affiliate.html', (req, res) => res.sendFile(path.join(__dirname, 'affiliate.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// এড ফান্ড এবং উইথড্র পেজ ওপেন নিশ্চিত করার জন্য ডিরেক্ট রাউট
app.get('/add_fund.html', (req, res) => res.sendFile(path.join(__dirname, 'add_fund.html')));
app.get('/withdraw.html', (req, res) => res.sendFile(path.join(__dirname, 'withdraw.html')));

// ================= SERVER PORT CONFIGURATION =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`সার্ভারটি সফলভাবে পোর্ট ${PORT}-এ সচল হয়েছে।`);
});
