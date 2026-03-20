const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  HeadingLevel, BorderStyle, LevelFormat
} = require('docx');

const DATE_NOW = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

function heading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 120 },
    children: [new TextRun({ text, bold: true, font: 'Calibri', size: 26 })]
  });
}

function subheading(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, font: 'Calibri', size: 22 })]
  });
}

function line(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after || 80 },
    children: [new TextRun({ text, font: 'Calibri', size: 21, bold: opts.bold || false })]
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 }, spacing: { after: 50 },
    children: [new TextRun({ text, font: 'Calibri', size: 21 })]
  });
}

function numberedItem(text) {
  return new Paragraph({
    numbering: { reference: 'numbered', level: 0 }, spacing: { after: 50 },
    children: [new TextRun({ text, font: 'Calibri', size: 21 })]
  });
}

function blank() {
  return new Paragraph({ spacing: { after: 40 }, children: [] });
}

const doc = new Document({
  styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      },
      {
        reference: 'numbered',
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      }
    ]
  },
  sections: [{
    properties: {
      page: { margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 } }
    },
    children: [
      // Title
      new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 40 },
        children: [new TextRun({ text: 'Savaari B2B Portal', font: 'Calibri', size: 32, bold: true })] }),
      new Paragraph({ spacing: { after: 60 },
        children: [new TextRun({ text: 'Blockers & Requirements — ' + DATE_NOW, font: 'Calibri', size: 21 })] }),
      new Paragraph({ spacing: { after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999', space: 4 } },
        children: [] }),

      // ── 1. Wallet API ──
      heading('1. Wallet API'),
      line('Server: apiext.alphasavaari.com/wallet/public (alpha server)'),
      line('Auth: B2B login token (Bearer header)'),
      line('Agent ID: 983680', { after: 120 }),

      subheading('Tested and working:'),
      bullet('/create — 201 Created, wallet_id: 6, balance: 0.00, status: ACTIVE'),
      bullet('/balance — 200 OK, returns current balance'),
      bullet('/history — 200 OK, returns transaction list'),
      blank(),

      subheading('Not yet tested (blocked):'),
      bullet('/topup/initiate — Needs Razorpay key_id to open payment popup'),
      bullet('/topup/verify — Needs Razorpay integration'),
      bullet('/pay-booking — Needs wallet balance > 0 (top-up first)'),
      bullet('/refund — Needs a paid booking to refund'),
      blank(),

      line('Blocker: Need Razorpay key_id (test mode) from wallet team to proceed.', { bold: true, after: 160 }),

      // ── 2. Profile Update ──
      heading('2. Profile Update API — Broken'),
      line('Endpoint: POST /user?userEmail=<email>&token=<JWT>'),
      line('Server: api23.savaari.com'),
      line('Page: Account Settings', { after: 120 }),

      line('What happens:', { bold: true }),
      bullet('Sending any JSON body to POST /user returns HTTP 400 Bad Request'),
      bullet('Tested with: {"name":"Bincy Joseph","phone":"9876543210","company":"Test Company"}'),
      bullet('Response: {"status":400,"message":"Bad Request"}'),
      bullet('Agent profile changes cannot be saved'),
      blank(),

      line('Question for backend team:', { bold: true }),
      bullet('Is the correct endpoint /user/update-profile instead of /user?'),
      bullet('If /user is correct, the backend validation needs to be fixed'),
      blank(),

      // ── 3. Country Code ──
      heading('3. Country Code API — Not Found'),
      line('Endpoint: GET /country-code?userEmail=<email>&token=<JWT>'),
      line('Server: api23.savaari.com'),
      line('Page: Booking confirmation (country code dropdown)', { after: 120 }),

      line('What happens:', { bold: true }),
      bullet('Returns HTTP 404 — endpoint does not exist on api23.savaari.com'),
      bullet('B2C site uses /userlogin/public/country-code on a different server'),
      blank(),

      line('Current workaround: Using a hardcoded country code list. Booking flow works fine with +91 default.', { after: 160 }),

      // ── 4. Beta Server ──
      heading('4. Switching to Beta Servers'),
      line('Currently all APIs hit PRODUCTION servers (except wallet on alpha). To test safely, we need to switch to beta.', { after: 120 }),

      subheading('URLs to change:'),
      bullet('Partner API: api.savaari.com → api.betasavaari.com'),
      bullet('B2B API: api23.savaari.com → api23.betasavaari.com'),
      bullet('Wallet API: alphasavaari.com → TBD (where will wallet be on beta?)'),
      blank(),

      subheading('What we need from the team:'),
      numberedItem('Beta login credentials (email + password for test agent)'),
      numberedItem('Beta Partner API keys (api_key and app_id)'),
      numberedItem('VPN access or IP whitelist (beta servers need VPN)'),
      numberedItem('Wallet beta URL (where will wallet be hosted on beta?)'),
      numberedItem('Razorpay test key_id for wallet top-up'),
      numberedItem('Test data on beta (agent account with dummy bookings)'),
      blank(),

      line('From our side, switching takes 5 minutes — just config file changes, no code changes.', { after: 160 }),

      // ── 5. Summary ──
      heading('5. All Blockers'),
      numberedItem('Razorpay key_id — needed for wallet top-up flow'),
      numberedItem('Profile update API returns 400 — backend needs to fix or clarify endpoint'),
      numberedItem('Country code API returns 404 — need correct path'),
      numberedItem('Beta login credentials — production credentials wont work on beta'),
      numberedItem('Beta API keys — need api_key + app_id for beta'),
      numberedItem('VPN access — beta servers require VPN'),
      numberedItem('Wallet production URL — where will wallet be hosted when going live?'),
      blank(),

      line('Frontend is fully built and ready. All blockers above are backend/infra side.', { bold: true }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = 'C:\\Users\\Pranav\\.gemini\\antigravity\\scratch\\savaari-b2b-scratch\\docs\\B2B-Blockers-v2.docx';
  fs.writeFileSync(outPath, buffer);
  console.log(`Created: ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
}).catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
