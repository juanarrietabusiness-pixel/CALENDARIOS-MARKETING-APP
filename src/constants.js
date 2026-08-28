export const DAYS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
export const DAYS_SHORT = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
export const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// `icon` es el nombre de un icono del set de src/components/Icon.jsx.
// Los emoji anteriores los dibujaba el sistema operativo, así que el
// mismo botón cambiaba de aspecto en cada plataforma.
export const FORMATS = {
  post:     { label: "Post",      icon: "formatPost",     color: "#4DA3FF" },
  reel:     { label: "Reel",      icon: "formatReel",     color: "#FF6392" },
  carrusel: { label: "Carrusel",  icon: "formatCarrusel", color: "#FFA53D" },
  historia: { label: "Historia",  icon: "formatHistoria", color: "#C77DFF" },
  live:     { label: "Live",      icon: "formatLive",     color: "#FF6B5E" },
};

/** Nombre del icono para cada formato de publicación. */
export const FORMAT_ICONS = Object.fromEntries(
  Object.entries(FORMATS).map(([k, v]) => [k, v.icon])
);

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
  custom:   { label: "Personalizada", posts: 1, description: "Elige cuántas publicaciones por semana y en qué días", custom: true },
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
