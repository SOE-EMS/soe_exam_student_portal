let s1 = '10:30:00AM TO 11:30:00AM / 01:30:00PM TO 02:30:00PM';
let s2 = '10:30:00 AM TO 11:30:00 AM / 01:30:00 PM TO 02:30:00 PM';
console.log(s1.replace(/(:\d{2}):\d{2}\b/g, '$1'));
console.log(s2.replace(/(:\d{2}):\d{2}\b/g, '$1'));
// A better regex: remove :00 when followed by space or AM/PM
console.log(s1.replace(/(:\d{2}):\d{2}(?=\s*[AP]M|\s|\b)/gi, '$1'));
console.log(s2.replace(/(:\d{2}):\d{2}(?=\s*[AP]M|\s|\b)/gi, '$1'));
