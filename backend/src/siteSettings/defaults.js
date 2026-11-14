// Mirrors the text and colours currently hard-coded in customer-site/src/App.jsx,
// so turning the site over to these settings changes nothing visually until an
// owner or sysadmin actually edits something. Keep this in sync if that hard-coded
// copy ever changes outside of this system.
//
// footer.text has no current equivalent - the customer site footer only shows the
// legal (name + registration number) and copyright lines, which are compliance
// text, not editable marketing copy, so they are intentionally left out of this
// system. footer.text defaults to '' until an owner adds something there.

const content = {
  hero: {
    heading: 'Effortless Booking. Endless Beauty.',
    subtext: 'Lash extensions, brow lamination & luxe wigs.',
    tagline: "Hair so good, it's by her.",
    bookButtonLabel: 'Book Now',
    shopButtonLabel: 'Shop Products',
    occasionMessage: '',
  },
  contact: {
    addressLine1: '125 Piet Retief Boulevard, SE1',
    addressLine2: 'Vanderbijlpark, Gauteng',
    phone: '+27 82 685 5399',
    email: 'lashesbyretha@gmail.com',
    hoursLabel: 'Beauty Hours',
    hoursLine1: 'Tuesday to Saturday',
    hoursLine2: '8:00 AM to 5:00 PM',
    whatsappLabel: 'WhatsApp',
    whatsappText: 'Chat with us on WhatsApp',
  },
  sectionHeadings: {
    products: 'Our Products',
    classes: 'Lash Training',
    gallery: 'Our Work',
    contact: 'Contact Us',
  },
  footer: {
    text: '',
  },
}

const theme = {
  colors: {
    background: '#FFFAF8',
    accent: '#C47A8A',
    navBackground: '#FDF0F3',
    text: '#2C2C2C',
    mutedText: '#7A6670',
  },
  fonts: {
    heading: 'Cormorant Garamond',
    body: 'Lato',
  },
  preset: 'default',
}

module.exports = { content, theme }
