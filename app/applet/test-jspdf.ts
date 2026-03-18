import { jsPDF, GState } from "jspdf";
const doc = new jsPDF();
console.log(typeof doc.GState);
console.log(typeof GState);
