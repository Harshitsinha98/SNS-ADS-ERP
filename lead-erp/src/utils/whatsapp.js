import { BACKEND_URL } from "./config";
// purani line "const BACKEND_URL = ..." hata do

export async function fetchWhatsAppLeads() {
  try {
    // Ngrok warning bypass karne ke liye humne header add kiya hai
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