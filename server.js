const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Aiven MySQL সংযোগ কনফিগারেশন
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 25255,
    ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed: ' + err.stack);
    } else {
        console.log('Successfully connected to Aiven MySQL database.');
        createTables();
    }
});

function createTables() {
    const userTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            balance DECIMAL(10,2) DEFAULT 0.00,
            earnings DECIMAL(10,2) DEFAULT 0.00,
            role VARCHAR(50) DEFAULT 'user'
        );
    `;
    db.query(userTable, (err) => { if (err) console.error("Error creating users table", err); });
}

// জেনুইন TRC-20 অ্যাড্রেস মেকার (৩৪ ক্যারেক্টার লম্বা এবং 'T' দিয়ে শুরু)
function generateFakeTRC20() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
    let address = 'T';
    for (let i = 0; i < 33; i++) {
        address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // রিয়েলিস্টিক লুকের জন্য অর্ধেক হাইড করা (যেমন: TX7e...7XbW)
    const hiddenAddress = address.substring(0, 6) + '...' + address.substring(address.length - 6);
    return hiddenAddress;
}

// পুরো পেজ জুড়ে দেখানোর জন্য ৩০টি ফেক লাইভ ট্রানজেকশন জেনারেটর এপিআই
app.get('/api/live-transactions', (req, res) => {
    const fakeData = [];
    const types = ['Deposit', 'Withdraw'];
    
    // রো সংখ্যা ১২ থেকে বাড়িয়ে ৩০ করা হয়েছে যাতে পুরো পেজ কভার করে
    for (let i = 1; i <= 30; i++) {
        fakeData.push({
            id: `USR${Math.floor(10000 + Math.random() * 90000)}`, // ৫ ডিজিটের রিয়েলিস্টিক ইউজার আইডি
            amount: `$${(Math.random() * 2450 + 50).toFixed(2)}`,  // \$50 থেকে \$2500 এর ট্রানজেকশন
            type: types[Math.floor(Math.random() * types.length)],
            address: generateFakeTRC20() // জেনুইন স্টাইলের মাস্কড TRC20 অ্যাড্রেস
        });
    }
    res.json(fakeData);
});

// অথেন্টিকেশন এপিআই
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    const query = `INSERT INTO users (email, password) VALUES (?, ?)`;
    db.query(query, [email, password], (err, result) => {
        if (err) return res.status(400).send("Email already exists or invalid data.");
        res.redirect('/dashboard');
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const query = `SELECT * FROM users WHERE email = ? AND password = ?`;
    db.query(query, [email, password], (err, results) => {
        if (err || results.length === 0) return res.status(401).send("Invalid email or password.");
        res.redirect('/dashboard');
    });
});

// পেজ রাউটিং
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/affiliate', (req, res) => res.sendFile(path.join(__dirname, 'affiliate.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.listen(PORT, () => console.log(`Server is running live on port ${PORT}`));
