export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

export const daysSince = (iso) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));

export const isToday = (iso) => {
  if (!iso) return false;
  const d = new Date(iso), n = new Date();
  return d.toDateString() === n.toDateString();
};

export const uid = (p = "L") => p + Math.floor(1000 + Math.random() * 9000);

export const parseCSV = (text) => {
  const rows = text.trim().split(/\r?\n/).map((r) => r.split(","));
  const headers = rows.shift().map((h) => h.trim());
  return rows.map((cols) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] || "").trim()));
    return obj;
  });
};

export const toCSV = (leads) => {
  const headers = ["id", "name", "phone", "email", "source", "requirement", "status", "assignedTo", "createdAt"];
  const lines = [headers.join(",")];
  leads.forEach((l) => lines.push(headers.map((h) => `"${l[h] ?? ""}"`).join(",")));
  return lines.join("\n");
};

// --- Naye Employee & Business Metrics ---

export const employeeStats = (empId, leads) => {
  const mine = leads.filter((l) => l.assignedTo === empId && !l.blacklisted);
  const won = mine.filter((l) => l.status === "Closed-Won").length;
  const lost = mine.filter((l) => l.status === "Lost").length;
  const active = mine.length - won - lost;
  const convRate = mine.length ? Math.round((won / mine.length) * 100) : 0;

  const closed = mine.filter((l) => l.status === "Closed-Won");
  const avgClose = closed.length
    ? Math.round(closed.reduce((s, l) => s + (new Date(l.lastUpdated) - new Date(l.createdAt)) / 36e5, 0) / closed.length)
    : 0;

  const stale = mine.filter((l) => !["Closed-Won", "Lost"].includes(l.status) && Math.floor((Date.now() - new Date(l.lastUpdated)) / 864e5) >= 3).length;
  const callsToday = mine.filter((l) => l.notes?.some((n) => new Date(n.at).toDateString() === new Date().toDateString())).length;

  return { total: mine.length, won, lost, active, convRate, avgClose, stale, callsToday, leads: mine };
};

export const fmtMoney = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

export const pipelineValue = (leads) => {
  const open = leads.filter((l) => !l.blacklisted && !["Closed-Won", "Lost"].includes(l.status));
  const wonValue = leads.filter((l) => l.status === "Closed-Won").reduce((s, l) => s + (l.value || 0), 0);
  const openValue = open.reduce((s, l) => s + (l.value || 0), 0);
  return { wonValue, openValue };
};

export const sourceStats = (leads) => {
  const active = leads.filter((l) => !l.blacklisted);
  const sources = [...new Set(active.map((l) => l.source))];
  return sources.map((src) => {
    const list = active.filter((l) => l.source === src);
    const won = list.filter((l) => l.status === "Closed-Won").length;
    return {
      source: src,
      total: list.length,
      won,
      rate: list.length ? Math.round((won / list.length) * 100) : 0,
      revenue: list.filter((l) => l.status === "Closed-Won").reduce((s, l) => s + (l.value || 0), 0),
    };
  });
};
// Last 7 din ka conversion trend (ek employee ke liye)
export const last7DaysTrend = (leads, empId) => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-IN", { weekday: "short" });
    const dateStr = d.toDateString();
    const count = leads.filter(
      (l) =>
        l.assignedTo === empId &&
        l.status === "Closed-Won" &&
        new Date(l.lastUpdated).toDateString() === dateStr
    ).length;
    days.push({ name: label, value: count });
  }
  return days;
};

// Employee ka rank team mein (conversions ke hisaab se)
export const employeeRank = (empId, users, leads) => {
  const emps = users.filter((u) => u.role === "employee");
  const ranked = emps
    .map((u) => ({
      id: u.id,
      won: leads.filter((l) => l.assignedTo === u.id && l.status === "Closed-Won").length,
    }))
    .sort((a, b) => b.won - a.won);
  const idx = ranked.findIndex((r) => r.id === empId);
  return { rank: idx + 1, totalEmployees: emps.length };
};

// WhatsApp ke liye phone number ko international format mein convert karo
export const toWaNumber = (phone) => {
  const clean = (phone || "").replace(/\D/g, "");
  return clean.length === 10 ? "91" + clean : clean;
};
export const fmtDuration = (sec) => {
  if (sec === null || sec === undefined) return "—";
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};
// ServiceNow style timeline entry formatter
export const createActivityEntry = (type, text, user, metadata = {}) => {
  return {
    id: "ACT" + Date.now() + Math.floor(Math.random() * 1000),
    type, // 'worknote', 'status_change', 'call', 'assignment', 'system'
    text,
    authorId: user.id,
    authorName: user.name,
    authorRole: user.role,
    createdAt: new Date().toISOString(),
    metadata
  };
};