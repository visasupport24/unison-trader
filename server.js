const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config(); // .env ফাইল থেকে ডেটা লোড করার জন্য

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
    ssl: { rejectUnauthorized: false } // Aiven এর জন্য SSL বাধ্যতামূলক
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed: ' + err.stack);
    } else {
        console.log('Successfully connected to Aiven MySQL database.');
        createTables();
    }
});

// ডাটাবেজ টেবিল অটো-ক্রিয়েশন (যদি আগে থেকে না থাকে)
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

// ফেক লাইভ ট্রানজেকশন জেনারেটর এপিআই (স্কেচ অনুযায়ী ১২টি রো জেনারেট করবে)
app.get('/api/live-transactions', (req, res) => {
    const fakeData = [];
    const types = ['Deposit', 'Withdraw'];
    for (let i = 1; i <= 12; i++) {
        fakeData.push({
            id: `USR${Math.floor(1000 + Math.random() * 9000)}`,
            amount: `$${(Math.random() * 490 + 10).toFixed(2)}`, // \$10 থেকে \$500 এর মধ্যে
            type: types[Math.floor(Math.random() * types.length)],
            address: `T${['A','B','X','Y'][Math.floor(Math.random()*4)]}${Math.random().toString(36).substring(2, 14).toUpperCase()}`
        });
    }
    res.json(fakeData);
});

// অথেন্টিকেশন এপিআই (লগইন এবং রেজিস্ট্রেশন টেস্ট করার জন্য সাধারণ রাউট)
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    const query = `INSERT INTO users (email, password) VALUES (?, ?)`;
    db.query(query, [email, password], (err, result) => {
        if (err) {
            return res.status(400).send("Email already exists or invalid data.");
        }
        res.redirect('/dashboard');
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const query = `SELECT * FROM users WHERE email = ? AND password = ?`;
    db.query(query, [email, password], (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).send("Invalid email or password.");
        }
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
