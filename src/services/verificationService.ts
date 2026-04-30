/**
 * Service pour interagir avec le backend personnalisé de vérification multi-canal.
 */

const API_URL = ""; // Relatif en dev car proxy Vite actif

export async function sendVerificationCode(contact: string, mode: 'email' | 'phone') {
  const response = await fetch(`${API_URL}/api/auth/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact, mode }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Erreur lors de l'envoi");
  return data;
}

export async function verifyOTPCode(contact: string, code: string) {
  const response = await fetch(`${API_URL}/api/auth/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contact, code }),
  });
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Code invalide");
  return data;
}
