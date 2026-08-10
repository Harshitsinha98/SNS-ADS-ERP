/**
 * Support controller — AI chat + ticket creation for logged-in customers.
 */

import { aiConfig } from "../config/env.js";
import { logger } from "../middleware/logger.js";
import { getActiveMembership } from "../middleware/auth.js";
import { createTicket, listTickets } from "../services/supportTickets.js";
import { db } from "../bootstrap/firebase.js";

// ── CodeSkate product knowledge base (hardcoded for now; can move to Firestore later)
const CODESKATE_KB = `
## CodeSkate CRM — Support Knowledge Base

### Bridge Calling
- Bridge call connects agent and lead through a virtual number. Neither side sees the other's real number.
- Requires a CodeSkate Voice number (₹500/mo). Go to CodeSkate Voice page to get one.
- Cost: ₹2.20/min, pay only when connected. Failed calls = no charge to customer.
- Recording: All calls are automatically recorded and available in the Recordings page.
- If bridge call fails: check Voice Wallet balance, ensure your number is active.

### Voice Wallet
- Unified rupee wallet. Used for bridge calls (₹2.20/min), AI voice (₹5/min), number rent (₹500/mo).
- Add money via Razorpay (Billing → Voice Wallet → Add Money).
- Balance never expires while plan is active.

### CodeSkate Voice (Dedicated Number)
- Each org needs their own number for bridge calling.
- Submit Udyam/CoI + GST certificate → CodeSkate verifies (24-48 hrs) → Number activated.
- Monthly rent ₹500 auto-deducts from Voice Wallet.
- Cancel anytime from CodeSkate Voice page.

### WhatsApp Integration
- Connect your WhatsApp Business Account from Settings → WhatsApp.
- Templates must be approved by Meta before broadcasting.
- Broadcast limits: Starter 2,000/mo, Growth 10,000/mo, Scale 25,000/mo, Enterprise 50,000/mo.

### Plans & Billing
- Starter ₹599/mo, Growth ₹1,499/mo, Scale ₹3,499/mo, Enterprise ₹7,999/mo.
- Upgrade: Billing page → choose plan → pay (pro-rata for mid-cycle upgrades).
- Add-ons: Extra AI Replies, Team Seats, Leads, Catalogue Pro, Workflows, API Access.

### AI Customer Care
- AI auto-replies to WhatsApp messages using your knowledge base.
- Enable from Settings → AI Customer Care. Add knowledge base articles.
- Limits based on plan (250 to 50,000 replies/mo).

### Common Issues
- "Voice Wallet empty": Top up from Voice Wallet page (Billing → Voice Wallet).
- "No voice number": Go to CodeSkate Voice → submit documents → get number.
- "WhatsApp disconnected": Re-connect from Settings → WhatsApp (token may have expired).
- "Bridge call not connecting": Check your number is active, wallet has balance, employee has phone access.
- "Recording not showing": Recordings appear 2-3 min after call ends. Check Recordings page.
- "Broadcast limit reached": Upgrade your plan for higher broadcast allowance.

### Contact
- For issues AI can't resolve, raise a support ticket and our team will help within 24 hours.
`.trim();

// ── AI Support Chat ──────────────────────────────────────────────────────────
export async function supportChatHandler(req, res) {
  try {
    const { message, history } = req.body || {};
    if (!message) return res.status(400).json({ error: "Message is required." });

    const apiKey = aiConfig.openaiApiKey;
    if (!apiKey) return res.status(503).json({ error: "AI support is not configured." });

    const messages = [
      {
        role: "system",
        content: `You are CodeSkate CRM's support assistant. Help customers resolve their issues using the knowledge base below. Be concise, friendly, and helpful. If you cannot resolve the issue, suggest they raise a support ticket.

${CODESKATE_KB}

Rules:
- Answer only CodeSkate CRM related questions.
- If the issue is technical and you can't resolve it, say: "I recommend raising a support ticket so our team can investigate this for you."
- Never make up features or pricing that's not in the knowledge base.
- Keep responses short (2-4 sentences max).
- Respond in the same language the user writes in (Hindi/English/Hinglish).`,
      },
      ...(history || []).slice(-8).map((h) => ({
        role: h.role === "user" ? "user" : "assistant",
        content: h.text || h.content || "",
      })),
      { role: "user", content: message },
    ];

    const response = await fetch(`${aiConfig.openaiBaseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: aiConfig.openaiModel || "gpt-4.1-nano",
        messages,
        max_tokens: 300,
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      logger.error({ status: response.status, err }, "OpenAI support chat failed");
      return res.status(502).json({ error: "AI service temporarily unavailable." });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "I'm having trouble right now. Please try again or raise a support ticket.";

    return res.json({ ok: true, reply });
  } catch (e) {
    logger.error({ err: e.message }, "Support chat error");
    return res.status(500).json({ error: "Could not process your message." });
  }
}

// ── Create Support Ticket ────────────────────────────────────────────────────
export async function createTicketHandler(req, res) {
  try {
    const { subject, description, conversationHistory, priority } = req.body || {};
    if (!subject && !description) return res.status(400).json({ error: "Subject or description is required." });

    const uid = req.authUser.uid;
    const phone = req.authUser.phone_number || req.authUser.phoneNumber || "";

    // Get user's org info
    let orgId = null, orgName = "", userName = phone, userRole = "user";
    try {
      // Find active membership
      const memSnap = await db.collection("memberships")
        .where("uid", "==", uid)
        .where("active", "==", true)
        .limit(1)
        .get();

      if (!memSnap.empty) {
        const mem = memSnap.docs[0].data();
        orgId = mem.orgId;
        userName = mem.displayName || mem.name || phone;
        userRole = mem.role || "user";

        const orgSnap = await db.collection("organizations").doc(orgId).get();
        if (orgSnap.exists) orgName = orgSnap.data().organizationName || orgSnap.data().name || "";
      }
    } catch { /* non-fatal */ }

    const ticket = await createTicket({
      orgId, orgName, userId: uid, userName, userPhone: phone, userRole,
      subject: subject || "Support request",
      description: description || "",
      conversationHistory: conversationHistory || [],
      priority: priority || "medium",
    });

    // Also create an org-internal ticket so it shows in /admin/tickets + /app/tickets
    if (orgId) {
      try {
        const { createOrgTicket } = await import("../services/orgTickets.js");
        await createOrgTicket({
          orgId,
          raisedBy: uid,
          raisedByName: userName,
          raisedByRole: userRole,
          subject: `[Support] ${subject || "Support request"}`,
          description: description || (conversationHistory || []).filter(m => m.role === "user").map(m => m.text).join(" | ") || "",
          priority: priority || "medium",
        });
      } catch { /* non-fatal */ }
    }

    return res.status(201).json({ ok: true, ticket });
  } catch (e) {
    logger.error({ err: e.message }, "Create ticket error");
    return res.status(500).json({ error: "Could not create ticket." });
  }
}

// ── List User's Tickets ──────────────────────────────────────────────────────
export async function listUserTicketsHandler(req, res) {
  try {
    const uid = req.authUser.uid;
    // Find user's org
    const memSnap = await db.collection("memberships")
      .where("uid", "==", uid)
      .where("active", "==", true)
      .limit(1)
      .get();

    const orgId = memSnap.empty ? null : memSnap.docs[0].data().orgId;
    const tickets = await listTickets({ orgId });
    return res.json({ ok: true, tickets });
  } catch (e) {
    return res.status(500).json({ error: "Could not load tickets." });
  }
}
