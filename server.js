require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// সব ফাইল মেইন বা রুট ডিরেক্টরিতে থাকায় কারেন্ট ফোল্ডার স্ট্যাটিক করা হলো
app.use(express.static(__dirname));

// Aiven MySQL কানেকশন পুল (SSL সচল সহ শক্তিশালী কানেকশন)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000, // ১০ সেকেন্ড টাইমআউট
    ssl: {
        rejectUnauthorized: false
    }
});

// ডেটাবেজের পুরনো টেবিল সম্পূর্ণ মুছে নতুন করে তৈরি করার ফাংশন
const initTables = () => {
    // সেফটি এবং ফরেন কি সিরিয়াল ঠিক রাখার জন্য প্রথমে পুরনো টেবিলগুলো মুছে ফেলা
    const dropTxTable = `DROP TABLE IF EXISTS transactions;`;
    const dropSettingsTable = `DROP TABLE IF EXISTS site_settings;`;
    const dropUsersTable = `DROP TABLE IF EXISTS users;`;

    // নতুন টেবিল তৈরির কুয়েরি সমূহ
    const usersTable = `
    CREATE TABLE users (
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
    CREATE TABLE transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email_phone VARCHAR(100) NOT NULL,
        type ENUM('deposit', 'withdraw') NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        proof_or_address VARCHAR(255) NOT NULL,
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`;

    const settingsTable = `
    CREATE TABLE site_settings (
        id INT PRIMARY KEY DEFAULT 1,
        notice TEXT,
        admin_trc20 VARCHAR(255) DEFAULT 'TY7RkX9pQzWv4mMn5sLtKdJfHgFdSaQwEr',
        telegram_link VARCHAR(255) DEFAULT '',
        support_email VARCHAR(100) DEFAULT 'support@unisontrading.com',
        about_text TEXT
    );`;

    // সিরিয়াল অনুযায়ী প্রথমে ডিলিট করা এবং তারপর নতুন করে তৈরি করার প্রসেস
    pool.query(dropTxTable, () => {
        pool.query(dropSettingsTable, () => {
            pool.query(dropUsersTable, () => {
                console.log("পুরনো সব টেবিল ডেটাবেজ থেকে মুছে ফেলা হয়েছে।");
                
                // এবার নতুন করে টেবিলগুলো তৈরি করা
                pool.query(usersTable, (err) => {
                    if (err) console.error("users টেবিল তৈরিতে সমস্যা:", err.message);
                    
                    pool.query(txTable, (err) => {
                        if (err) console.error("transactions টেবিল তৈরিতে সমস্যা:", err.message);
                        
                        pool.query(settingsTable, (err) => {
                            if (err) console.error("site_settings টেবিল তৈরিতে সমস্যা:", err.message);
                            
                            // ডিবল্ট সাইট সেটিংস ডেটা ইনসার্ট করা
                            pool.query('INSERT IGNORE INTO site_settings (id, notice, about_text) VALUES (1, "Welcome to Unison Trading!", "Company details here...")');
                            console.log("Aiven MySQL-এ একদম নতুন ফ্রেশ টেবিল তৈরি সম্পন্ন হয়েছে।");
                        });
                    });
                });
            });
        });
    });
};

// সার্ভার রানিং হওয়ার সাথে সাথে টেবিল রিসেট প্রসেসটি চালু হবে
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
            console.error("ডেটাবেজ কোয়েরি এরর (Select):", err.message);
            return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি! ডেটাবেজ কানেকশন চেক করুন।' });
        }
        if (results && results.length > 0) {
            return res.status(400).json({ success: false, message: 'এই ইমেইল বা ফোন ইতিমধ্যে নিবন্ধিত!' });
        }

        pool.query('INSERT INTO users (email_phone, password) VALUES (?, ?)', [email_phone, password], (err) => {
            if (err) {
                console.error("ডেটাবেজ কোয়েরি এরর (Insert):", err.message);
                return res.status(500).json({ success: false, message: 'রেজিস্ট্রেশন ব্যর্থ হয়েছে! ডেটাবেজ চেক করুন।' });
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
        if (err) {
            console.error("লগইন ডেটাবেজ এরর:", err.message);
            return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি!' });
        }
        if (!results || results.length === 0) {
            return res.status(400).json({ success: false, message: 'ভুল তথ্য বা পাসওয়ার্ড!' });
        }
        if (results[0].status === 'banned') {
            return res.status(403).json({ success: false, message: 'আপনার অ্যাকাউন্ট ব্লক করা!' });
        }

        res.json({ success: true, message: 'লগইন সফল হয়েছে!' });
    });
});

// ৩. ড্যাশবোর্ড ডেটা লোড
app.get('/api/user/dashboard', (req, res) => {
    const { email_phone } = req.query;
    pool.query('SELECT balance, todays_profit, team_member, todays_commission, kyc_status FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (err || !results || results.length === 0) {
            return res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি' });
        }
        res.json({ success: true, user: results[0] });
    });
});


// ৪. ফান্ড অ্যাড রিকোয়েস্ট (Add Fund) - ১০০% ফিক্সড
app.post('/api/fund/add', (req, res) => {
    const { email_phone, amount, proof } = req.body;
    
    if (!email_phone || !amount || !proof) {
        return res.status(400).json({ success: false, message: 'সবগুলো তথ্য সঠিকভাবে দিন!' });
    }

    const query = 'INSERT INTO transactions (email_phone, type, amount, proof_or_address, status) VALUES (?, "deposit", ?, ?, "pending")';
    
    pool.query(query, [email_phone, amount, proof], (err, result) => {
        if (err) {
            console.error('ডিপোজিট ইনসার্ট এরর:', err.message);
            return res.status(500).json({ success: false, message: 'রিকোয়েস্ট ব্যর্থ! ডেটাবেজ ত্রুটি।' });
        }
        res.json({ success: true, message: 'রিকোয়েস্ট সফলভাবে জমা হয়েছে!' });
    });
});

// ৫. উইথড্র রিকোয়েস্ট (Withdraw) - ১০০% ফিক্সড
app.post('/api/fund/withdraw', (req, res) => {
    const { email_phone, amount, trc20_address } = req.body;

    if (!email_phone || !amount || !trc20_address) {
        return res.status(400).json({ success: false, message: 'সবগুলো তথ্য সঠিকভাবে দিন!' });
    }

    // অ্যারে রিটার্ন হ্যান্ডেল করার জন্য কুয়েরি ফিক্স করা হয়েছে
    pool.query('SELECT balance FROM users WHERE email_phone = ?', [email_phone], (err, results) => {
        if (err) {
            console.error('ব্যালেন্স চেক এরর:', err.message);
            return res.status(500).json({ success: false, message: 'সার্ভার ত্রুটি!' });
        }

        if (results && results.length > 0) {
            const currentBalance = parseFloat(results[0].balance); // এখানে results[0] ব্যবহার করা হয়েছে
            const withdrawAmount = parseFloat(amount);

            if (currentBalance >= withdrawAmount) {
                const insertQuery = 'INSERT INTO transactions (email_phone, type, amount, proof_or_address, status) VALUES (?, "withdraw", ?, ?, "pending")';
                
                pool.query(insertQuery, [email_phone, withdrawAmount, trc20_address], (err) => {
                    if (err) {
                        console.error('উইথড্র ইনসার্ট এরর:', err.message);
                        return res.status(500).json({ success: false, message: 'উইথড্র রিকোয়েস্ট ব্যর্থ হয়েছে!' });
                    }
                    res.json({ success: true, message: 'উইথড্র রিকোয়েস্ট সফলভাবে জমা হয়েছে!' });
                });
            } else {
                res.status(400).json({ success: false, message: 'পর্যাপ্ত ব্যালেন্স নেই!' });
            }
        } else {
            res.status(404).json({ success: false, message: 'ইউজার পাওয়া যায়নি!' });
        }
    });
});


// ৬. সাইট সেটিংস লোড (Notice, About Us, Address)
app.get('/api/site/settings', (req, res) => {
    pool.query('SELECT * FROM site_settings WHERE id = 1', (err, results) => {
        if (err || !results || results.length === 0) return res.json({ success: false });
        res.json({ success: true, settings: results[0] });
    });
});

// ================= ADMIN PANEL API ENDPOINTS =================

// ১. অ্যাডমিন প্যানেল: সব ডিপোজিট রিকোয়েস্ট (Add fund Table & Proofment Box) দেখা
app.get('/api/admin/deposits', (req, res) => {
    pool.query('SELECT * FROM transactions WHERE type = "deposit" ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'ডেটা লোড ব্যর্থ!' });
        res.json({ success: true, requests: results });
    });
});

// ২. অ্যাডমিন প্যানেল: সব উইথড্র রিকোয়েস্ট (Withdraw fund Table) দেখা
app.get('/api/admin/withdraws', (req, res) => {
    pool.query('SELECT * FROM transactions WHERE type = "withdraw" ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'ডেটা লোড ব্যর্থ!' });
        res.json({ success: true, requests: results });
    });
});

// ডিপোজিট ও উইথড্র রিকোয়েস্ট অ্যাপ্রুভ বা রিজেক্ট করা এবং ইউজারের মূল ব্যালেন্স আপডেট করা
app.post('/api/admin/transaction/update', (req, res) => {
    const { tx_id, status, email_phone, amount, type } = req.body;

    pool.query('UPDATE transactions SET status = ? WHERE id = ?', [status, tx_id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'আপডেট ব্যর্থ!' });

        // যদি ডিপোজিট অ্যাপ্রুভ করা হয়, তবে ইউজারের ব্যালেন্স যোগ হবে
        if (status === 'approved' && type === 'deposit') {
            pool.query('UPDATE users SET balance = balance + ? WHERE email_phone = ?', [amount, email_phone]);
        }
        // যদি উইথড্র রিজেক্ট করা হয়, তবে কেটে নেওয়া ব্যালেন্স ফেরত দেওয়া হবে (উইথড্র রিকোয়েস্টের সময়ই মাইনাস করা হয়েছিল)
        else if (status === 'rejected' && type === 'withdraw') {
            pool.query('UPDATE users SET balance = balance + ? WHERE email_phone = ?', [amount, email_phone]);
        }
        // যদি উইথড্র অ্যাপ্রুভ হয় তবে ইউজারের মূল ব্যালেন্স থেকে অলরেডি মাইনাস করা টাকা ডেটাবেজে স্থায়ী হবে
        else if (status === 'approved' && type === 'withdraw') {
            pool.query('UPDATE users SET balance = balance - ? WHERE email_phone = ?', [amount, email_phone]);
        }

        res.json({ success: true, message: 'ট্রানজেকশন স্ট্যাটাস আপডেট সফল হয়েছে!' });
    });
});

// ৫. অ্যাডমিন প্যানেল: সব ইউজারের তালিকা (User list)
app.get('/api/admin/users', (req, res) => {
    pool.query('SELECT id, email_phone, balance, status, kyc_status FROM users ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, users: results });
    });
});

// ৬. অ্যাডমিন প্যানেল: ম্যানুয়ালি ব্যালেন্স এডিট (Manually balance edit)
app.post('/api/admin/user/balance-edit', (req, res) => {
    const { email_phone, action_type, amount } = req.body; // action_type: 'add' অথবা 'subtract'
    
    let query = 'UPDATE users SET balance = balance + ? WHERE email_phone = ?';
    if (action_type === 'subtract') {
        query = 'UPDATE users SET balance = balance - ? WHERE email_phone = ?';
    }

    pool.query(query, [amount, email_phone], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'ব্যালেন্স পরিবর্তন করা যায়নি!' });
        res.json({ success: true, message: 'ইউজার ব্যালেন্স সফলভাবে আপডেট করা হয়েছে।' });
    });
});

// ৭. অ্যাডমিন প্যানেল: ইউজার একটিভ বা ব্যান করা (User active/banned)
app.post('/api/admin/user/status', (req, res) => {
    const { email_phone, status } = req.body; // status: 'active' বা 'banned'
    pool.query('UPDATE users SET status = ? WHERE email_phone = ?', [status, email_phone], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: `ইউজার সফলভাবে ${status} করা হয়েছে।` });
    });
});

// ১০. অ্যাডমিন প্যানেল: নোটিশ বোর্ড কন্ট্রোল (Notice board control)
app.post('/api/admin/settings/notice', (req, res) => {
    const { notice } = req.body;
    pool.query('UPDATE site_settings SET notice = ? WHERE id = 1', [notice], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: 'নোটিশ বোর্ড আপডেট করা হয়েছে।' });
    });
});

// ১২. অ্যাডমিন প্যানেল: গেটওয়ে টিআরসি-২০ অ্যাড্রেস পরিবর্তন (Update payment address)
app.post('/api/admin/settings/address', (req, res) => {
    const { admin_trc20 } = req.body;
    pool.query('UPDATE site_settings SET admin_trc20 = ? WHERE id = 1', [admin_trc20], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: 'ডিপোজিট ওয়ালেট অ্যাড্রেস আপডেট সম্পন্ন।' });
    });
});

// ১৩. অ্যাডমিন প্যানেল: সাপোর্ট কন্টাক্ট ইনফো চেইঞ্জ (Change contact info)
app.post('/api/admin/settings/contact', (req, res) => {
    const { telegram_link, support_email } = req.body;
    pool.query('UPDATE site_settings SET telegram_link = ?, support_email = ? WHERE id = 1', [telegram_link, support_email], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: 'যোগাযোগের তথ্য আপডেট করা হয়েছে।' });
    });
});

// ১৪. অ্যাডমিন প্যানেল: About Us টেক্সট আপডেট (About us update)
app.post('/api/admin/settings/about', (req, res) => {
    const { about_text } = req.body;
    pool.query('UPDATE site_settings SET about_text = ? WHERE id = 1', [about_text], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: 'পরিচিতি পেজের টেক্সট সফলভাবে সেভ করা হয়েছে।' });
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

// সার্ভার পোর্ট লিসেন
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`UNISON TRADING সার্ভার রানিং পোর্ট: ${PORT}`));
