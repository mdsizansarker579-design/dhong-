import { useEffect, useRef, useState } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

export default function App() {
  const [command, setCommand] = useState('');
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    let active = true;
    async function checkHealth() {
      try {
        const response = await fetch(`${API_BASE}/api/health`);
        if (!response.ok) throw new Error('API offline');
        if (active) setConnected(true);
      } catch {
        if (active) setConnected(false);
      }
    }
    checkHealth();
    const timer = window.setInterval(checkHealth, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), [events]);

  async function submit(e) {
    e.preventDefault();
    if (!command.trim() || busy) return;
    const current = command.trim();
    setCommand('');
    setEvents((old) => [...old, { kind: 'user', text: current }]);
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: current })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');
      setEvents((old) => [...old, { kind: 'assistant', text: `${data.plan.goal}\n\nপরিকল্পনা:\n${data.plan.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nফলাফল: ${data.result.message}` }]);
    } catch (error) {
      setEvents((old) => [...old, { kind: 'assistant', text: `সংযোগ সমস্যা: ${error.message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="top">
      <div className="mark">J</div>
      <div><h1>J.A.R.V.I.S</h1><p>PERSONAL AUTONOMOUS ASSISTANT</p></div>
      <span className={`connection ${connected ? 'on' : ''}`}>{connected ? 'LIVE CONNECTED' : 'OFFLINE'}</span>
    </header>
    <section className="hero">
      <div className="orb"><div className="orb-core">J</div></div>
      <h2>আপনার নির্দেশের অপেক্ষায়</h2>
      <p>বাংলায় লিখুন। JARVIS আপনার কমান্ড বিশ্লেষণ করে পরিকল্পনা দেখাবে।</p>
    </section>
    <section className="panel">
      <div className="panel-head"><strong>কমান্ড সেন্টার</strong><span>DEMO AGENT · v0.1.0</span></div>
      <div className="feed">
        {events.length === 0 && <div className="empty">উদাহরণ: “JARVIS, সার্ভারের স্ট্যাটাস দেখাও” অথবা “এখন কয়টা বাজে?”</div>}
        {events.map((item, i) => <div key={i} className={`bubble ${item.kind}`}><small>{item.kind === 'user' ? 'YOU' : 'JARVIS'}</small><div>{item.text}</div></div>)}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="composer">
        <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="JARVIS-কে নির্দেশ দিন..." />
        <button disabled={busy}>{busy ? 'চলছে…' : 'পাঠান'}</button>
      </form>
    </section>
    <footer>নিরাপদ প্রাথমিক সংস্করণ · কোনো OS command স্বয়ংক্রিয়ভাবে চালানো হয় না</footer>
  </main>;
}
