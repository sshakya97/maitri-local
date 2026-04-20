import { useState } from "react";

const API_BASE = "http://localhost:3001";

export default function Login({ dark, onSuccess }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !token.trim()) {
      setError("Both fields are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/verify`, {
        headers: { "x-jira-email": email.trim(), "x-jira-token": token.trim() },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Verification failed (${res.status})`);
      }
      const data = await res.json();
      onSuccess({ email: email.trim(), token: token.trim(), displayName: data.displayName });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const bg = dark ? "#0B0D14" : "#F1F4FB";
  const cardBg = dark ? "#111520" : "#FFFFFF";
  const bdr = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,60,0.07)";
  const txt = dark ? "#E2E8F0" : "#0F172A";
  const txt2 = dark ? "#64748B" : "#4A5280";
  const txt3 = dark ? "#334155" : "#94A3B8";
  const inputBg = dark ? "#181D2C" : "#F8FAFF";

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
      <div style={{ width: 380, background: cardBg, border: `1px solid ${bdr}`, borderRadius: 16, padding: "40px 32px", boxShadow: dark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(0,0,60,0.08)" }}>

        {/* Logo + Title */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#E85D8A,#4F8EF7)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: "#fff", marginBottom: 12 }}>M</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: txt }}>Maitri Dashboard</div>
          <div style={{ fontSize: 12, color: txt3, marginTop: 4 }}>Connect your Jira account to continue</div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Email field */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: txt2, marginBottom: 6 }}>Jira Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: inputBg, color: txt, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {/* Token field */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: txt2, marginBottom: 6 }}>API Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ATATT3x..."
              autoComplete="current-password"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${bdr}`, background: inputBg, color: txt, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noreferrer"
              style={{ display: "inline-block", marginTop: 6, fontSize: 11, color: "#4F8EF7", textDecoration: "none" }}
            >
              How to generate an API token
            </a>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: "rgba(247,79,79,0.1)", border: "1px solid rgba(247,79,79,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 16, color: "#F74F4F", fontSize: 12, fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", background: loading ? "#334155" : "linear-gradient(135deg,#E85D8A,#4F8EF7)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "wait" : "pointer", fontFamily: "inherit", transition: "opacity 0.15s" }}
          >
            {loading ? "Connecting..." : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
