import { BACKEND_URL } from "./config";
// removed the old line "const BACKEND_URL = ..."

export async function fetchWhatsAppLeads() {
  try {
    // Added this header to bypass the ngrok warning
    const res = await fetch(`${BACKEND_URL}/api/whatsapp-leads`, {
      headers: {
        "ngrok-skip-browser-warning": "any-value"
      }
    });
    
    if (!res.ok) throw new Error("Backend not reachable");
    return await res.json();
  } catch (e) {
    console.warn("WhatsApp backend offline:", e.message);
    return [];
  }
}