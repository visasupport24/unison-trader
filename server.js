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

// সার্ভার চালু হওয়ার সাথে সাথে ডেটাবেসে টেবিল তৈরি করার লজিক
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
        console.error("ডেটাবেস টেবিল তৈরি করতে সমস্যা হয়েছে:", err);
    } else {
        console.log("MySQL ডেটাবেস কানেক্টেড এবং 'users' টেবিল সম্পূর্ণ রেডি! ✅");
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
