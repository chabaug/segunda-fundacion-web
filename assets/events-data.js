// Shared upcoming-shows data — used by segunda-fundacion.html's ticket banner
// (shown on every page except eventos.html) and eventos.html's Próximos
// shows cards + event modal. Set ticketUrl once a Passline/etc. link exists;
// leave it null while the show is still "Entradas próximamente".
//
// venue is just the venue's name; venueAddress is its street address (both
// shown together on the card, and separately — each its own link — in the
// event modal). flyer, description and venueInstagram are optional: flyer
// shows a poster image on the card and in the event modal (path relative to
// the site root, e.g. "assets/flyers/my-flyer.jpg"); description is the
// modal's blurb about the date (falls back to lineup when omitted);
// venueInstagram makes the venue's name in the modal a link to its
// Instagram (left as plain text when omitted).
//
// TEMPORARY: the entry below is test data (placeholder flyer, fake ticket
// link, fake Instagram link) used to preview the active-event banner/card/
// modal — swap in the real Passline link, flyer and Instagram URL once they
// exist, or clear back to [] if Fiebre Lunar Vol. 2 is still paused.
const UPCOMING_EVENTS = [
  {
    name: "Fiebre Lunar Vol. 2",
    date: "2026-10-03",
    dateLabel: "Sábado 3 de octubre, 2026",
    venue: "Quetrén Club Cultural",
    venueAddress: "Av. Olazábal 1784, CABA",
    venueInstagram: "https://instagram.com/quetren.club",
    lineup: "Radio Mercurio, Lu Kompel, Emi Esparza + DJs",
    ticketUrl: "https://passline.com/eventos/fiebre-lunar-vol-2",
    flyer: "assets/flyers/radiomercurio-fiebrelunar-laquince.jpg",
    // Artist/DJ social links are still pending — Augusto will send those
    // separately, to be added once the event goes live with its real flyer
    // and ticket link.
    description:
      "Regresa la Fiebre Lunar! Vení a pasar otra noche con increíbles bandas y DJs hasta la madrugada.\n\n" +
      "Una noche a puro groove, funk y neo soul porteño de la mano de Radio Mercurio, Lu Kompel y Emi Esparza & Suristas. Tres bandas con mucho color y despliegue, grandes ensambles con una amplia paleta de sonidos.\n\n" +
      "Pero después de medianoche sigue la fiesta con los DJs:",
  },
];
