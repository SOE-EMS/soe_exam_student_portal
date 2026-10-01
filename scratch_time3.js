let s = '10:30:00 AM TO 11 AM';
let formatted = String(s).toUpperCase();
// Remove seconds
formatted = formatted.replace(/(:\d{2}):\d{2}\b/g, '$1');
console.log('After removing seconds:', formatted);
// Pad hours
formatted = formatted.replace(/(?<!:)\b(\d{1,2})\s+(AM|PM)\b/gi, '$1:00 $2');
console.log('After padding hours:', formatted);
