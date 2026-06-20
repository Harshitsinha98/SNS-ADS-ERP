export const seedUsers = [
  { id: "admin1", name: "Super Admin", phone: "9876500000", role: "admin", active: true },
  { id: "emp1", name: "Rahul Verma", phone: "9876543210", role: "employee", active: true },
  { id: "emp2", name: "Priya Singh", phone: "9123456780", role: "employee", active: true },
];
export const seedStatuses = ["New", "Ringing", "Meeting Fixed", "Negotiation", "Closed-Won", "Lost"];

export const seedSettings = {
  autoAssign: "round-robin", // or "workload"
  statuses: seedStatuses,
};

export const seedLeads = [
  {
    id: "L1001", name: "Amit Kumar", phone: "9876543210", email: "amit@gmail.com",
    source: "Website", requirement: "3BHK Flat", status: "New", assignedTo: "emp1",
    value: 500000, priority: "Hot", blacklisted: false,
    createdAt: "2026-06-15T09:00:00Z", lastUpdated: "2026-06-15T09:00:00Z",
    followUp: null, notes: [],
  },
  {
    id: "L1002", name: "Sneha Patel", phone: "9123456780", email: "sneha@gmail.com",
    source: "Facebook Ad", requirement: "Office Space", status: "Ringing", assignedTo: "emp1",
    value: 1200000, priority: "Warm", blacklisted: false,
    createdAt: "2026-06-12T10:30:00Z", lastUpdated: "2026-06-13T10:30:00Z",
    followUp: "2026-06-20T14:00:00Z", notes: [{ text: "Interested, call back", at: "2026-06-13T10:30:00Z" }],
  },
  {
    id: "L1003", name: "Vikram Rao", phone: "9988776655", email: "vikram@gmail.com",
    source: "Referral", requirement: "Villa", status: "Closed-Won", assignedTo: "emp2",
    value: 3500000, priority: "Hot", blacklisted: false,
    createdAt: "2026-06-01T08:00:00Z", lastUpdated: "2026-06-10T08:00:00Z",
    followUp: null, notes: [{ text: "Deal closed!", at: "2026-06-10T08:00:00Z" }],
  },
  {
    id: "L1004", name: "Junk Caller", phone: "0000000000", email: "spam@x.com",
    source: "Unknown", requirement: "-", status: "Lost", assignedTo: "emp2",
    value: 0, priority: "Cold", blacklisted: true,
    createdAt: "2026-06-09T08:00:00Z", lastUpdated: "2026-06-09T08:00:00Z",
    followUp: null, notes: [],
  },
];