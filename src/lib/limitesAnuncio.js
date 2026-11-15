// ============================================================
// Los topes de un anuncio, solos (puro, sin importaciones)
//
// Vivían en estudioMercado.js, y lib/pauta.js —que carga el panel de cada publicación— importaba esta constante de
// ahí y arrastraba el estudio de mercado entero (16,5 kB comprimidos) a algo que se abre a cada rato. estudioMercado.js
// la reexporta: quien la importaba de allí no cambia.
//
// El del texto principal es UNO para toda la aplicación (el estudio de mercado, los textos de lo que va a pauta
// —lib/pauta.js— y el asistente de campañas —lib/anuncios.js `MAX_TEXTO`—): antes eran 300, 600 y 2.000 según la
// pantalla. 600 deja sitio al de evaluación, más largo a propósito.
// ============================================================

export const LIMITES_ANUNCIO = Object.freeze({ titulo: 40, textoPrincipal: 600, descripcion: 30 });
