import Database from 'better-sqlite3';

const db = new Database('markez.db');

db.exec(`
  DELETE FROM transactions;
  DELETE FROM orders;
  UPDATE profile SET whatsapp_template = '*Markez Tapicería - Confirmación de Pedido*%0A%0A👤 *Cliente:* {cliente}%0A🛠️ *Trabajo:* {trabajo}%0A🧵 *Material:* {material}%0A📅 *Entrega:* {entrega}%0A%0A💰 *Total:* {total}%0A💵 *Anticipo:* {anticipo}%0A📉 *Restante:* {restante}%0A%0A¡Gracias por su confianza!';
`);

console.log('Database cleaned and WhatsApp template reset.');
