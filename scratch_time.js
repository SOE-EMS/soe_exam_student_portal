let s = '10:30:00 AM TO 11:30:00 AM / 01:30:00 PM TO 02:30:00 PM';
let formatted = String(s).toUpperCase();
formatted = formatted.replace(/\s*-\s*/g, ' TO ');
formatted = formatted.replace(/(:\d{2}):\d{2}\b/g, '$1');
console.log(formatted);
