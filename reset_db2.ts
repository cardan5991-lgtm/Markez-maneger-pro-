import Database from 'better-sqlite3';

const db = new Database('markez.db');

db.exec(`
  UPDATE profile SET whatsapp_template = '*Markez Tapicería - Confirmación de Pedido*

👤 *Cliente:* {cliente}
🛠️ *Trabajo:* {trabajo}
🧵 *Material:* {material}
📅 *Entrega:* {entrega}

💰 *Total:* {total}
💵 *Anticipo:* {anticipo}
📉 *Restante:* {restante}

¡Gracias por su confianza!';
`);

console.log('Database WhatsApp template reset with actual newlines.');
