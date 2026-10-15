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

// টেবিল স্ট্রাকচার আপডেট (ইমেইল এবং ফোন উভয়ই সাপোর্ট করার জন্য)
function createTables() {
    const userTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NULL,
            phone VARCHAR(50) NULL,
            password VARCHAR(255) NOT NULL,
            balance DECIMAL(10,2) DEFAULT 0.00,
            earnings DECIMAL(10,2) DEFAULT 0.00,
            role VARCHAR(50) DEFAULT 'user'
        );
    `;
    db.query(userTable, (err) => { 
        if (err) console.error("Error creating users table", err); 
        else console.log("Users table verified/created successfully.");
    });
}

// ৩০টি ফেক লাইভ ট্রানজেকশন জেনারেটর এপিআই
function generateFakeTRC20() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
    let address = 'T';
    for (let i = 0; i < 33; i++) {
        address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return address.substring(0, 6) + '...' + address.substring(address.length - 6);
}

app.get('/api/live-transactions', (req, res) => {
    const fakeData = [];
    const types = ['Deposit', 'Withdraw'];
    for (let i = 1; i <= 30; i++) {
        fakeData.push({
            id: `USR${Math.floor(10000 + Math.random() * 90000)}`,
            amount: `$${(Math.random() * 2450 + 50).toFixed(2)}`,
            type: types[Math.floor(Math.random() * types.length)],
            address: generateFakeTRC20()
        });
    }
    res.json(fakeData);
});

// 🛠️ ডাইনামিক সাইন-আপ এপিআই (যা আসল সমস্যা পপ-আপে দেখাবে)
app.post('/api/register', (req, res) => {
    const { email, phone, password } = req.body;
    
    // ইমেইল অথবা ফোন যেকোনো একটি দিয়ে ডাটা ইনসার্ট করা
    const query = `INSERT INTO users (email, phone, password) VALUES (?, ?, ?)`;
    db.query(query, [email || null, phone || null, password], (err, result) => {
        if (err) {
            console.error("Signup Database Error: ", err);
            // ডাটাবেজের আসল এরর মেসেজটি পপ-আপে দেখাবে যাতে আমরা বুঝতে পারি সমস্যা কোথায়
            return res.send(`
                <script>
                    alert("Database Error: ${err.message.replace(/"/g, '\\"')}");
                    window.location.href = "/register";
                </script>
            `);
        }
        res.send(`
            <script>
                alert("Account created successfully!");
                window.location.href = "/dashboard";
            </script>
        `);
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    // ইমেইল বা ফোন নম্বর যেকোনো একটি দিয়ে লগইন চেক
    const query = `SELECT * FROM users WHERE (email = ? OR phone = ?) AND password = ?`;
    db.query(query, [email, email, password], (err, results) => {
        if (err || results.length === 0) {
            return res.send(`
                <script>
                    alert("Invalid Credentials. Please try again.");
                    window.location.href = "/login";
                </script>
            `);
        }
        res.send(`
            <script>
                window.location.href = "/dashboard";
            </script>
        `);
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
