export const DAYS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
export const DAYS_SHORT = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
export const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export const FORMATS = {
  post:     { label: "Post",      icon: "🖼️", color: "#1E90FF" },
  reel:     { label: "Reel",      icon: "🎬", color: "#E91E63" },
  carrusel: { label: "Carrusel",  icon: "📑", color: "#FF9800" },
  historia: { label: "Historia",  icon: "⭕", color: "#9C27B0" },
  live:     { label: "Live",      icon: "🔴", color: "#F44336" },
};

export const STATUSES = {
  pending:   { label: "Pendiente",    bg: "#0d1f3c", text: "#64B5F6", border: "#1E3A6B" },
  approved:  { label: "✓ Aprobado",   bg: "#0d2a0d", text: "#66BB6A", border: "#388E3C" },
  rejected:  { label: "✗ Cambios",    bg: "#2a0d0d", text: "#EF5350", border: "#C62828" },
  published: { label: "🚀 Publicado", bg: "#200a3a", text: "#CE93D8", border: "#7B1FA2" },
};

export const PLANS = {
  basic:    { label: "Básico",   posts: 1, description: "1 publicación diaria" },
  standard: { label: "Estándar", posts: 2, description: "2 publicaciones diarias" },
  premium:  { label: "Premium",  posts: 3, description: "3 publicaciones diarias" },
};

export const DEFAULT_CATEGORIES = [
  "Producto estrella",
  "Beneficios / Promociones",
  "Tips / Educativo",
  "Testimonios",
  "Tendencia / Viral",
  "Detrás de cámaras",
  "Entretenimiento",
  "Institucional",
  "Inspiracional",
];

export const PALETTE = {
  bg:         "#050D1F",
  card:       "#0A1628",
  cardAlt:    "#0d1f3a",
  accent:     "#1E90FF",
  accentAlt:  "#F5A623",
  border:     "#1E3A6B",
  borderLight:"#152a4a",
  text:       "#FFFFFF",
  textMuted:  "#64B5F6",
  textDim:    "#A0B4CC",
};
