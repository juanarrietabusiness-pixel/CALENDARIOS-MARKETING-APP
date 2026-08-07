import { DAYS } from "./constants";

export const uid = () => Math.random().toString(36).slice(2, 10);

export const fmtDate = (d) => d.toISOString().split("T")[0];

export const daysInMonth = (year, month) => {
  const days = [];
  const dt = new Date(year, month, 1);
  while (dt.getMonth() === month) {
    days.push(new Date(dt));
    dt.setDate(dt.getDate() + 1);
  }
  return days;
};

export const getWeekNumber = (date, monthStart) => {
  const d = new Date(date + "T12:00:00");
  const start = new Date(monthStart + "T12:00:00");
  const diff = Math.floor((d - start) / 86400000);
  return Math.floor(diff / 7) + 1;
};

export const dayName = (dateStr) => {
  const d = new Date(dateStr + "T12:00:00");
  return DAYS[d.getDay()];
};

export const lsGet = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};

export const lsSet = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* */ }
};

export const escapeHTML = (s) => {
  if (!s) return "";
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
};

export async function compressImage(file, maxSize = 400) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export function parseVideoURL(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return { type: "youtube", id: yt[1], thumbnail: `https://img.youtube.com/vi/${yt[1]}/mqdefault.jpg` };
  const vi = url.match(/vimeo\.com\/(\d+)/);
  if (vi) return { type: "vimeo", id: vi[1] };
  const tk = url.match(/tiktok\.com\/@[\w.]+\/video\/(\d+)/);
  if (tk) return { type: "tiktok", id: tk[1] };
  const ig = url.match(/instagram\.com\/(reel|p)\/([\w-]+)/);
  if (ig) return { type: "instagram", id: ig[2] };
  return { type: "link", url };
}

export function createEmptyClient() {
  return {
    id: "client-" + uid(),
    name: "",
    industry: "",
    instagram: "",
    phone: "",
    whatsapp: "",
    primaryColor: "#1E90FF",
    secondaryColor: "#FFFFFF",
    accentColor: "#F5A623",
    logo: null,
    sucursales: "",
    direcciones: "",
    descripcion: "",
    valores: "",
    audiencia: "",
    competencia: "",
    estiloGuion: "",
    estiloLocucion: "",
    hashtags: "",
    notasInspeccion: "",
    githubRepo: "",
    githubFolder: "",
    githubToken: "",
    githubContext: "",
    ideasBank: [],
    savedPlans: [],
    savedCategories: [],
    calendars: [],
  };
}
