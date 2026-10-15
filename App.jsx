import React, { useState, useEffect } from 'react';
import './index.css'; // সরাসরি একই ডিরেক্টরি থেকে স্টাইল লোড

const investmentTiers = [
  { range: "\$10 - \$50", profit: "1.0% - 1.2%" },
  { range: "\$51 - \$200", profit: "1.3% - 1.5%" },
  { range: "\$201 - \$500", profit: "1.6% - 1.8%" },
  { range: "\$501 - \$1000", profit: "1.9% - 2.1%" },
  { range: "\$1001 - \$3000", profit: "2.2% - 2.5%" }
];

const generateFakeTransactions = () => {
  const trc20Prefixes = ["TLx", "TX5", "TY9", "TBs", "TMn", "TKh", "TWr", "TZa"];
  const transactionTypes = ["DP", "Withdraw"];
  const list = [];
  for (let i = 1; i <= 30; i++) {
    const userId = `user_${Math.floor(1000 + Math.random() * 9000)}`;
    const amount = (15 + Math.random() * 2500).toFixed(2);
    const type = transactionTypes[Math.floor(Math.random() * transactionTypes.length)];
    const randomHash = Math.random().toString(16).substring(2, 6);
    const address = `${trc20Prefixes[Math.floor(Math.random() * trc20Prefixes.length)]}...${randomHash}`;
    list.push({ id: i, userId, amount, type, address });
  }
  return list;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [investAmount, setInvestAmount] = useState("");
  const [message, setMessage] = useState("");
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    setTransactions(generateFakeTransactions());
    const interval = setInterval(() => {
      setTransactions(generateFakeTransactions());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) setUser(data);
      else alert(data.error);
    } catch (err) { console.error(err); }
  };

  const handleInvest = async () => {
    if (!investAmount || investAmount < 10) return alert("Minimum investment is \$10");
    try {
      const res = await fetch('/api/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, amount: parseFloat(investAmount) })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        setMessage(data.message);
        setInvestAmount("");
      } else {
        alert(data.error);
      }
    } catch (err) { console.error(err); }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center p-4 max-w-md mx-auto border-x border-slate-900">
        <h1 className="text-3xl font-black text-cyan-400 mb-6 tracking-wider">UNISON TRADING</h1>
        <form onSubmit={handleLogin} className="bg-slate-900 p-6 rounded-2xl border border-slate-800 w-full mb-6">
          <h2 className="text-lg mb-4 text-center font-semibold text-slate-300">Login / Registration</h2>
          <input 
            type="email" placeholder="Enter Email Address" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 rounded-lg bg-slate-800 border border-slate-700 mb-4 focus:outline-none focus:border-cyan-400 text-sm"
          />
          <button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-600 text-slate-950 p-3 rounded-lg font-bold transition">
            Access Platform
          </button>
        </form>

        <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="bg-slate-800 px-4 py-3 text-xs font-bold text-slate-300 border-b border-slate-700 flex justify-between items-center">
            <span>📊 Todays Transaction (Live)</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800 bg-slate-900 sticky top-0">
                  <th className="p-3">User ID</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">TRC20 Address</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                    <td className="p-3 font-medium text-slate-400">{tx.userId}</td>
                    <td className={`p-3 font-bold ${tx.type === 'DP' ? 'text-emerald-400' : 'text-rose-400'}`}>\${tx.amount}</td>
                    <td className="p-3"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${tx.type === 'DP' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>{tx.type}</span></td>
                    <td className="p-3 font-mono text-slate-500">{tx.address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 font-sans max-w-md mx-auto border-x border-slate-900 pb-20">
      <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-4">
        <h1 className="text-xl font-black text-cyan-400 tracking-wider">UNISON TRADING</h1>
        <span className="text-xs bg-slate-900 px-3 py-1 rounded-full text-slate-400 border border-slate-800">{user.email}</span>
      </div>

      <div className="bg-slate-900 text-cyan-300 text-xs py-2 px-3 rounded-lg mb-4 overflow-hidden">
        <marquee scrollamount="4">Notice: Withdrawals are processed automatically. Minimum withdrawal amount is \$5.</marquee>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-500 font-medium mb-1">Available Balance</p>
          <p className="text-xl font-bold text-emerald-400">\${Number(user.balance).toFixed(2)}</p>
        </div>
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-500 font-medium mb-1">Total Invested</p>
          <p className="text-xl font-bold text-amber-400">\${Number(user.invested).toFixed(2)}</p>
        </div>
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
          <p className="text-xs text-slate-500 font-medium mb-1">Daily Commissions</p>
          <p className="text-xl font-bold text-cyan-400">\${Number(user.earnings).toFixed(2)}</p>
        </div>
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-center">
          <button className="w-full bg-cyan-500 hover:bg-cyan-600 text-slate-950 font-bold py-2.5 rounded-lg text-xs transition">Withdraw Funds</button>
        </div>
      </div>

      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 mb-6">
        <h3 className="text-xs font-bold mb-3 text-cyan-400 tracking-wide uppercase">Execute Investment slot</h3>
        {message && <p className="text-xs text-emerald-400 mb-2 font-medium">{message}</p>}
        <div className="flex gap-2">
          <input 
            type="number" placeholder="Enter amount (Min \$10)" value={investAmount}
            onChange={(e) => setInvestAmount(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-cyan-400"
          />
          <button onClick={handleInvest} className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-4 py-2.5 rounded-lg text-xs transition">Invest</button>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
        <div className="bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-300 border-b border-slate-700">Investment Tier Profit Rates</div>
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800">
              <th className="p-3">Deposit Range</th>
              <th className="p-3 text-right">Daily Yield</th>
            </tr>
          </thead>
          <tbody>
            {investmentTiers.map((tier, idx) => (
              <tr key={idx} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                <td className="p-3 text-slate-300">{tier.range}</td>
                <td className="p-3 text-right font-bold text-cyan-400">{tier.profit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-900 border-t border-slate-800 grid grid-cols-4 text-center py-3 text-[11px] text-slate-400 z-50">
        <button className="text-cyan-400 font-bold">🏠 Home</button>
        <button className="hover:text-slate-200">🔗 Affiliate</button>
        <button className="hover:text-slate-200">👤 Profile</button>
        <button className="hover:text-slate-200">ℹ️ About Us</button>
      </div>
    </div>
  );
}
