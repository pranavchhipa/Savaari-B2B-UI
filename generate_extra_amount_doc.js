/**
 * Generates a simple Word doc explaining how to handle the
 * "Additional amount in booking" case for Savaari B2B.
 *
 * Run: node generate_extra_amount_doc.js
 * Output: Additional_Amount_Handling.docx
 */
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, BorderStyle, WidthType, ShadingType, LevelFormat, AlignmentType,
} = require('docx');

const PAGE_WIDTH = 12240;          // US Letter
const PAGE_HEIGHT = 15840;
const MARGIN = 1080;               // 0.75"
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 10080

const COLOR = {
  primary: '0EA5E9',  // sky-500
  text: '1E293B',     // slate-800
  muted: '64748B',    // slate-500
  headerBg: 'E0F2FE', // sky-100
  altRow: 'F8FAFC',   // slate-50
  border: 'CBD5E1',   // slate-300
};

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: COLOR.border };
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

// Helper: simple bold heading
const heading = (text, level = HeadingLevel.HEADING_2) =>
  new Paragraph({
    heading: level,
    children: [new TextRun({ text, bold: true })],
  });

// Helper: simple paragraph
const p = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, ...opts })],
  });

// Helper: bullet
const bullet = (text) =>
  new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [new TextRun({ text })],
  });

// Helper: table cell
const td = (text, opts = {}) => new TableCell({
  borders: cellBorders,
  width: { size: opts.width, type: WidthType.DXA },
  shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
  margins: { top: 100, bottom: 100, left: 140, right: 140 },
  children: [new Paragraph({ children: [new TextRun({ text, bold: !!opts.bold, color: opts.color || COLOR.text })] })],
});

// Build doc
const doc = new Document({
  creator: 'Savaari B2B',
  title: 'Additional Amount Handling',
  styles: {
    default: { document: { run: { font: 'Arial', size: 22, color: COLOR.text } } },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: COLOR.primary },
        paragraph: { spacing: { before: 240, after: 200 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: COLOR.text },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: COLOR.muted },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    children: [
      // Title
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: 'Additional Amount Handling', bold: true })],
      }),
      p('Savaari B2B Cab Portal', { color: COLOR.muted, italics: true }),
      p(''),

      // What is this
      heading('What this is'),
      p('Sometimes a trip ends up costing more than what the agent paid upfront. This doc covers how we handle that extra amount.'),

      // When it happens
      heading('When extra amount happens'),
      bullet('Extra kilometres (quoted 145km, ran 180km)'),
      bullet('Extra hours / waiting time on local trips'),
      bullet('Toll or parking fees added by driver'),
      bullet('Night-time charges if trip extends late'),
      bullet('State entry tax on outstation trips'),
      bullet('Customer no-show or last-minute cancel penalty'),
      bullet('Damage to car reported by driver'),

      // Which payment options
      heading('Which payment options this applies to'),
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: [3360, 6720],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              td('Payment Option', { width: 3360, shade: COLOR.headerBg, bold: true }),
              td('Extra Amount Risk', { width: 6720, shade: COLOR.headerBg, bold: true }),
            ],
          }),
          new TableRow({ children: [
            td('Pay Any Amount Now', { width: 3360, bold: true }),
            td('Driver collects extra cash from customer. Agent rarely involved.', { width: 6720 }),
          ]}),
          new TableRow({ children: [
            td('Pay 25% Now, Auto-Debit', { width: 3360, bold: true, shade: COLOR.altRow }),
            td('Extra goes to agent account. Main case.', { width: 6720, shade: COLOR.altRow }),
          ]}),
          new TableRow({ children: [
            td('Zero Cash (Buffer)', { width: 3360, bold: true }),
            td('20% buffer covers extras first. Beyond that, agent pays.', { width: 6720 }),
          ]}),
        ],
      }),

      // Solution
      heading('How we recover the extra amount'),
      p('We follow a 5-step waterfall. Each step kicks in only if the previous one fails.'),

      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: [720, 2880, 4320, 2160],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              td('#', { width: 720, shade: COLOR.headerBg, bold: true }),
              td('Trigger', { width: 2880, shade: COLOR.headerBg, bold: true }),
              td('Action', { width: 4320, shade: COLOR.headerBg, bold: true }),
              td('Notify Agent', { width: 2160, shade: COLOR.headerBg, bold: true }),
            ],
          }),
          new TableRow({ children: [
            td('1', { width: 720, bold: true }),
            td('Trip closed, extra detected. (Zero Cash bookings only)', { width: 2880 }),
            td('Use buffer first. If buffer is enough, refund the leftover.', { width: 4320 }),
            td('Email summary', { width: 2160 }),
          ]}),
          new TableRow({ children: [
            td('2', { width: 720, bold: true, shade: COLOR.altRow }),
            td('Wallet has enough balance', { width: 2880, shade: COLOR.altRow }),
            td('Auto-deduct from wallet silently. No agent action needed.', { width: 4320, shade: COLOR.altRow }),
            td('Push notification', { width: 2160, shade: COLOR.altRow }),
          ]}),
          new TableRow({ children: [
            td('3', { width: 720, bold: true }),
            td('Wallet not enough', { width: 2880 }),
            td('Send Razorpay payment link. 48-hour clock starts.', { width: 4320 }),
            td('SMS + Email + Dashboard banner', { width: 2160 }),
          ]}),
          new TableRow({ children: [
            td('4', { width: 720, bold: true, shade: COLOR.altRow }),
            td('48 hours, still unpaid', { width: 2880, shade: COLOR.altRow }),
            td('Reminder + dashboard warning. Soft tone.', { width: 4320, shade: COLOR.altRow }),
            td('Push + SMS', { width: 2160, shade: COLOR.altRow }),
          ]}),
          new TableRow({ children: [
            td('5', { width: 720, bold: true }),
            td('7 days, still unpaid', { width: 2880 }),
            td('Soft hold: block new bookings until paid. Existing trips continue.', { width: 4320 }),
            td('Email to agent + ops team', { width: 2160 }),
          ]}),
        ],
      }),

      // Special triggers
      heading('Special cases (handle separately)'),
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: [3600, 6480],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              td('Trigger', { width: 3600, shade: COLOR.headerBg, bold: true }),
              td('What we do', { width: 6480, shade: COLOR.headerBg, bold: true }),
            ],
          }),
          new TableRow({ children: [
            td('Extra is more than 30% of original fare OR more than Rs. 2000', { width: 3600, bold: true }),
            td('Stop the auto-deduct. Flag for ops team to review (could be driver fraud or wrong calculation).', { width: 6480 }),
          ]}),
          new TableRow({ children: [
            td('Same agent has 3 or more extras pending', { width: 3600, bold: true, shade: COLOR.altRow }),
            td('Tighten the timeline. Move from 7-day grace to 3-day grace.', { width: 6480, shade: COLOR.altRow }),
          ]}),
          new TableRow({ children: [
            td('Wallet goes negative beyond Rs. 500', { width: 3600, bold: true }),
            td('Block new bookings until cleared. Small negatives (under Rs. 500) are fine for trust.', { width: 6480 }),
          ]}),
        ],
      }),

      // What frontend shows
      heading('What the agent sees on the portal'),
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: [4320, 5760],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              td('UI Element', { width: 4320, shade: COLOR.headerBg, bold: true }),
              td('When it shows', { width: 5760, shade: COLOR.headerBg, bold: true }),
            ],
          }),
          new TableRow({ children: [
            td('Red dot on trip card with "Rs. X due"', { width: 4320, bold: true }),
            td('From step 3 onwards', { width: 5760 }),
          ]}),
          new TableRow({ children: [
            td('Persistent dashboard banner with deadline', { width: 4320, bold: true, shade: COLOR.altRow }),
            td('From step 4 onwards', { width: 5760, shade: COLOR.altRow }),
          ]}),
          new TableRow({ children: [
            td('"Pay Now" button on the trip card', { width: 4320, bold: true }),
            td('Steps 3 to 5', { width: 5760 }),
          ]}),
          new TableRow({ children: [
            td('Account hold modal on login', { width: 4320, bold: true, shade: COLOR.altRow }),
            td('Step 5 active (account on hold)', { width: 5760, shade: COLOR.altRow }),
          ]}),
        ],
      }),

      // Why this works
      heading('Why this approach works'),
      bullet('Buffer-first keeps the Zero Cash promise intact.'),
      bullet('Silent wallet deduct = best experience for small extras (Rs. 100 to 500).'),
      bullet('48-hour, 5-day, 7-day timeline gives agents room to breathe, no surprise bans.'),
      bullet('Soft hold blocks only new bookings, ongoing trips continue. Less customer impact.'),
      bullet('30% / Rs. 2000 alarm catches edge cases before money moves automatically.'),
      bullet('Negative wallet up to Rs. 500 is allowed for trust, but limits the exposure.'),

      // Summary
      heading('In short'),
      p('Build the 5-step waterfall once on backend. Frontend just shows status. About 90% of cases auto-resolve in step 1 or 2 (buffer or wallet). Only the top 10% need active recovery, which keeps agent trust high and collection rate high.'),
    ],
  }],
});

const outputPath = path.join(__dirname, 'Additional_Amount_Handling.docx');
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outputPath, buf);
  console.log('Generated:', outputPath, '(' + buf.length + ' bytes)');
});
