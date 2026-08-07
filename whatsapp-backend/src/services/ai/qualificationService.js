/**
 * AI Lead Qualification flow.
 *
 * ARCHITECTURAL DECISION: Qualification is a DETERMINISTIC state machine, not
 * an LLM behaviour. Asking "what's your name?" then "what do you need?" in a
 * fixed order is a scripted business process — routing it through the intent
 * classifier and confidence gates would make it unreliable (the model has to
 * re-infer its position in the flow from chat history every turn) and would
 * burn tokens on questions that never change.
 *
 * So this runs BEFORE processWithAI() in the bridge. While a lead is being
 * qualified, this owns the conversation; once complete it steps aside
 * permanently and the normal AI answering path takes over.
 *
 * State lives in a `qualification` map on the lead document:
 *   { step, answers: {questionId: {value, optionId}}, complete,
 *     startedAt, completedAt, lastAskedStepId, lastAskedAtMs }
 *
 * Questions are answered either by free text or by tapping a WhatsApp reply
 * button / list row — both are normalized to the same answer shape, so a
 * customer who ignores the buttons and types instead still advances the flow.
 */

import { db } from "../../bootstrap/firebase.js";
import { nowIso, orgCollection } from "../helpers.js";
import { sendPlainText, sendInteractiveButtons, sendInteractiveList } from "../whatsappInteractive.js";
import { logger } from "../../middleware/logger.js";

// Re-asking the same question within this window is suppressed, so a burst of
// inbound messages can't spam the customer with duplicate questions.
const REASK_COOLDOWN_MS = 5000;

// Lead fields the flow is allowed to write. Anything else is kept in
// qualification.answers only, so a misconfigured question can never
// overwrite arbitrary lead state (status, assignedTo, blacklisted...).
const WRITABLE_LEAD_FIELDS = new Set(["name", "email", "requirement", "priority", "city", "company"]);

export const DEFAULT_QUALIFICATION_QUESTIONS = [
  {
    id: "name",
    field: "name",
    type: "text",
    question: "Hi! 👋 Thanks for reaching out. Before we begin — may I know your name?",
  },
  {
    id: "interest",
    field: "requirement",
    type: "buttons",
    question: "Great to meet you! What can we help you with today?",
    options: [
      { id: "pricing", title: "Pricing" },
      { id: "products", title: "Product info" },
      { id: "support", title: "Support" },
    ],
  },
  {
    id: "timeline",
    type: "buttons",
    question: "Got it. When are you looking to move forward?",
    options: [
      { id: "immediately", title: "Immediately" },
      { id: "this_month", title: "This month" },
      { id: "exploring", title: "Just exploring" },
    ],
  },
];

const DEFAULT_COMPLETE_MESSAGE =
  "Thank you! 🙏 I have everything I need. Go ahead and ask me anything — I'm here to help.";

function resolveQuestions(config) {
  const custom = config?.qualificationQuestions;
  if (Array.isArray(custom) && custom.length > 0) {
    return custom
      .filter((q) => q?.id && q?.question)
      .map((q) => ({
        ...q,
        type: ["text", "buttons", "list"].includes(q.type) ? q.type : "text",
      }));
  }
  return DEFAULT_QUALIFICATION_QUESTIONS;
}

/** Send one question using the transport its type calls for. */
async function askQuestion({ orgId, leadId, phone, question, businessName }) {
  const footer = businessName ? String(businessName).slice(0, 60) : "";

  if (question.type === "buttons" && Array.isArray(question.options) && question.options.length) {
    return sendInteractiveButtons({
      orgId, leadId, phone,
      bodyText: question.question,
      options: question.options.map((o) => ({
        id: `qual:${question.id}:${o.id}`,
        title: o.title,
      })),
      footerText: footer,
      noteLabel: "AI asked (buttons)",
    });
  }

  if (question.type === "list" && Array.isArray(question.options) && question.options.length) {
    return sendInteractiveList({
      orgId, leadId, phone,
      bodyText: question.question,
      buttonLabel: question.buttonLabel || "Choose",
      sections: [{
        title: question.sectionTitle || "Options",
        rows: question.options.map((o) => ({
          id: `qual:${question.id}:${o.id}`,
          title: o.title,
          description: o.description || null,
        })),
      }],
      footerText: footer,
      noteLabel: "AI asked (menu)",
    });
  }

  return sendPlainText({
    orgId, leadId, phone,
    text: question.question,
    noteLabel: "AI asked",
  });
}

/**
 * Extract the answer for the CURRENT question from this inbound message.
 * A tapped option carries `qual:<questionId>:<optionId>`; free text is taken
 * as-is so customers who type instead of tapping still progress.
 */
function readAnswer({ question, message, interactiveReply }) {
  if (interactiveReply?.id?.startsWith("qual:")) {
    const [, questionId, optionId] = interactiveReply.id.split(":");
    // A tap on a stale (previous) question must not answer the current one.
    if (questionId && questionId !== question.id) return null;
    return { value: interactiveReply.title || optionId || "", optionId: optionId || null };
  }
  if (interactiveReply?.title) {
    return { value: interactiveReply.title, optionId: interactiveReply.id || null };
  }
  const text = String(message || "").trim();
  if (!text) return null;
  return { value: text, optionId: null };
}

/** Map an answer onto the lead document, if the question targets a field. */
function leadPatchFor(question, answer) {
  const field = question.field;
  if (!field || !WRITABLE_LEAD_FIELDS.has(field)) return {};

  const value = String(answer.value || "").trim().slice(0, 200);
  if (!value) return {};

  if (field === "priority") {
    return ["Hot", "Warm", "Cold"].includes(value) ? { priority: value } : {};
  }
  if (field === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? { email: value.toLowerCase() } : {};
  }
  if (field === "name") {
    // Guard against a sentence being stored as the lead's name.
    return value.length <= 60 ? { name: value } : {};
  }
  return { [field]: value };
}

/**
 * Run the qualification step for an inbound message.
 *
 * Returns { handled: true } when qualification consumed this message (the
 * caller must NOT also run the answering AI), or { handled: false } when the
 * lead is already qualified / the flow is off and normal AI should proceed.
 */
export async function runQualification({
  orgId, leadId, phone, message, interactiveReply, config,
}) {
  if (!config?.qualificationEnabled) return { handled: false, reason: "disabled" };

  const leadRef = orgCollection(db, orgId, "leads").doc(leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) return { handled: false, reason: "lead_not_found" };

  const lead = leadSnap.data();
  const state = lead.qualification || null;

  if (state?.complete) return { handled: false, reason: "already_qualified" };

  const questions = resolveQuestions(config);
  if (questions.length === 0) return { handled: false, reason: "no_questions" };

  const businessName = config.businessName || "";

  // ── First contact: greet + ask the first question ──
  if (!state) {
    const first = questions[0];
    await leadRef.set({
      qualification: {
        step: 0,
        answers: {},
        complete: false,
        startedAt: nowIso(),
        firstMessage: String(message || "").slice(0, 500),
        lastAskedStepId: first.id,
        lastAskedAtMs: Date.now(),
      },
    }, { merge: true });

    await askQuestion({ orgId, leadId, phone, question: first, businessName });
    logger.info({ orgId, leadId, questionId: first.id }, "Qualification started");
    return { handled: true, asked: first.id };
  }

  const stepIndex = Number(state.step || 0);
  const current = questions[stepIndex];

  // Config shrank (questions removed) — nothing left to ask, so finish.
  if (!current) {
    await completeQualification({ orgId, leadRef, state, config, phone, leadId, silent: true });
    return { handled: false, reason: "questions_exhausted" };
  }

  const answer = readAnswer({ question: current, message, interactiveReply });

  // Unusable input (empty, or a tap belonging to an older question):
  // re-ask, rate-limited so we never spam.
  if (!answer) {
    const askedRecently = Date.now() - Number(state.lastAskedAtMs || 0) < REASK_COOLDOWN_MS;
    if (!askedRecently) {
      await askQuestion({ orgId, leadId, phone, question: current, businessName });
      await leadRef.set({ qualification: { ...state, lastAskedAtMs: Date.now() } }, { merge: true });
    }
    return { handled: true, reAsked: current.id };
  }

  // ── Record the answer and advance ──
  const answers = { ...(state.answers || {}), [current.id]: answer };
  const nextIndex = stepIndex + 1;
  const next = questions[nextIndex];
  const leadPatch = leadPatchFor(current, answer);

  if (next) {
    await leadRef.set({
      ...leadPatch,
      lastUpdated: nowIso(),
      qualification: {
        ...state,
        step: nextIndex,
        answers,
        lastAskedStepId: next.id,
        lastAskedAtMs: Date.now(),
      },
    }, { merge: true });

    await askQuestion({ orgId, leadId, phone, question: next, businessName });
    return { handled: true, asked: next.id };
  }

  await leadRef.set({ ...leadPatch, lastUpdated: nowIso() }, { merge: true });
  await completeQualification({ orgId, leadRef, state, answers, config, phone, leadId });
  return { handled: true, justCompleted: true };
}

async function completeQualification({
  orgId, leadRef, state, answers, config, phone, leadId, silent = false,
}) {
  await leadRef.set({
    qualification: {
      ...state,
      answers: answers || state?.answers || {},
      step: -1,
      complete: true,
      completedAt: nowIso(),
    },
  }, { merge: true });

  if (!silent) {
    await sendPlainText({
      orgId, leadId, phone,
      text: config?.qualificationCompleteMessage || DEFAULT_COMPLETE_MESSAGE,
      noteLabel: "AI finished qualification",
    });
  }

  // Summarize collected answers into the Activity Stream so the agent sees
  // the qualification result without opening the transcript.
  const summary = Object.entries(answers || state?.answers || {})
    .map(([key, value]) => `${key}: ${value?.value}`)
    .join(" · ");

  orgCollection(db, orgId, "activity").add({
    text: `✅ AI qualified lead${summary ? ` — ${summary}` : ""}`,
    at: nowIso(),
    orgId,
    leadId,
    source: "ai_customer_care",
  }).catch(() => {});

  logger.info({ orgId, leadId }, "Qualification complete");
}
