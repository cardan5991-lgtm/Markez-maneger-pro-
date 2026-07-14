const phone = "521234567890";
const text = "Hello";
const w4b = `intent://send/?phone=${phone}&text=${encodeURIComponent(text)}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`;
console.log(w4b);
