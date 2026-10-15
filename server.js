// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// .env ফাইল লোড করা
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// মিডলওয়্যার
app.use(cors());
app.use(express.json());

// ফ্রন্টএন্ড স্ট্যাটিক ফাইলগুলো লোড করার জন্য লিংক করা
app.use(express.static(path.join(__dirname, 'public')));

// টেস্ট রুট (সার্ভার ঠিক আছে কিনা চেক করার জন্য API)
app.get('/api/health', (req, res) => {
    res.json({ status: "running", message: "Unison Trading Backend is alive!" });
});

// মূল ইউআরএলে গেলে যাতে হোম পেজ (index.html) ওপেন হয়
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// সার্ভার স্টার্ট
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
