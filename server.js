const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Aiven MySQL সংযোগ (Render Environment Variables থেকে রিড করবে)
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'your-aiven-host',
    user: process.env.DB_USER || 'your-user',
    password: process.env.DB_PASSWORD || 'your-password',
    database: process.env.DB_NAME || 'your-db-name',
    port: process.env.DB_PORT || 12345,
    ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) console.error('Database connection failed: ' + err.stack);
    else console.log('Connected to Aiven MySQL database.');
});

// ফেক লাইভ ট্রানজেকশন জেনারেটর (এপিআই)
app.get('/api/live-transactions', (req, res) => {
    const fakeData = [];
    const types = ['Deposit', 'Withdraw'];
    for (let i = 1; i <= 12; i++) {
        fakeData.push({
            id: `USR${Math.floor(1000 + Math.random() * 9000)}`,
            amount: `$${(Math.random() * 500).toFixed(2)}`,
            type: types[Math.floor(Math.random() * types.length)],
            address: `T${['A','B','C','X','Y','Z'][Math.floor(Math.random()*6)]}${Math.random().toString(36).substring(2, 12).toUpperCase()}`
        });
    }
    res.json(fakeData);
});

// রাউটিং
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/affiliate', (req, res) => res.sendFile(path.join(__dirname, 'affiliate.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
