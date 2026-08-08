/**
 * Sistema de iconos.
 *
 * Trazo de 1.75 sobre rejilla de 24, extremos y uniones redondeados.
 * Todos heredan `currentColor`, así que un icono dentro de un botón toma
 * el color del botón sin necesidad de variantes.
 *
 * Sustituyen a los emoji del sistema, que cambiaban de dibujo según la
 * plataforma, traían color propio (el fondo blanco de 📋 recortaba un
 * rectángulo sobre el banner azul) y tenían pesos ópticos incompatibles
 * entre sí.
 *
 * Uso:
 *   <Icon name="pencil" />              → 20px, hereda color
 *   <Icon name="trash" size={16} />
 *   <Icon name="check" className="…" />
 *
 * Son decorativos por defecto (`aria-hidden`): el nombre accesible lo
 * pone el `aria-label` del botón que los contiene.
 */

const paths = {
  // --- Navegación y estructura ---
  menu: <><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></>,
  close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m18 15-6-6-6 6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronLeft: <path d="m15 18-6-6 6 6" />,
  more: <><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /><circle cx="5" cy="12" r="1.2" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,

  // --- Acciones ---
  pencil: <><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" /><path d="M10 11v6" /><path d="M14 11v6" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></>,
  check: <path d="M20 6 9 17l-5-5" />,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  refresh: <><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.6-4.2" /><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.6 4.2" /><path d="M20 3v5h-5" /><path d="M4 21v-5h5" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  sparkles: <><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" /><path d="M18.5 16.5 19 18l1.5.5L19 19l-.5 1.5L18 19l-1.5-.5L18 18Z" /></>,
  bolt: <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12Z" />,

  // --- Objetos ---
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18" /><path d="M8 2v4" /><path d="M16 2v4" /></>,
  list: <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3.5 6h.01" /><path d="M3.5 12h.01" /><path d="M3.5 18h.01" /></>,
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  bulb: <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2Z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.54 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.54a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.46 9v.09a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 8h.01" /><path d="M15 8h.01" /><path d="M9 12h.01" /><path d="M15 12h.01" /><path d="M10 21v-4h4v4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></>,
  folder: <path d="M3 8a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L8 20" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3" /><path d="M13 15h4" /></>,
  filter: <path d="M3 5h18l-7 8.5V20l-4-2v-4.5Z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16.5 5.2a3.5 3.5 0 0 1 0 5.6" /><path d="M18.5 14.4A6.5 6.5 0 0 1 21.5 20" /></>,
  alert: <><path d="M12 3 2.5 20h19Z" /><path d="M12 10v4" /><path d="M12 17.5h.01" /></>,
  message: <path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.2-4.2A8 8 0 0 1 13 4a8 8 0 0 1 8 8Z" />,

  // --- Formatos de publicación ---
  formatPost: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5L8 20" /></>,
  formatReel: <><rect x="2.5" y="4" width="19" height="16" rx="2.5" /><path d="M2.5 9h19" /><path d="m7.5 4-2 5" /><path d="m13 4-2 5" /><path d="m18.5 4-2 5" /><path d="m10.5 13 4 2.5-4 2.5Z" /></>,
  formatCarrusel: <><rect x="7" y="4" width="10" height="16" rx="2" /><path d="M3.5 7.5v9" /><path d="M20.5 7.5v9" /></>,
  formatHistoria: <><circle cx="12" cy="12" r="9" strokeDasharray="3.2 2.4" /><circle cx="12" cy="12" r="4" /></>,
  formatLive: <><circle cx="12" cy="12" r="3" /><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9" /><path d="M16.5 16.5a6.4 6.4 0 0 0 0-9" /><path d="M4.7 4.7a10.3 10.3 0 0 0 0 14.6" /><path d="M19.3 19.3a10.3 10.3 0 0 0 0-14.6" /></>,
};

export default function Icon({ name, size = 20, strokeWidth = 1.75, className, style }) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, display: "block", ...style }}
      aria-hidden="true"
      focusable="false"
    >
      {d}
    </svg>
  );
}
