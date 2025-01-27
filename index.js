const Imap = require('imap');
const { simpleParser } = require('mailparser');
require('dotenv').config();

// Create IMAP connection configuration
const imapConfig = {
  user: process.env.YANDEX_USER,
  password: process.env.YANDEX_PASSWORD,
  host: 'imap.yandex.ru',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false } // This allows self-signed certificates
};

// Create IMAP instance
const imap = new Imap(imapConfig);

function openInbox(cb) {
  imap.openBox('INBOX', false, cb);
}

imap.once('ready', () => {
  openInbox((err, box) => {
    if (err) throw err;
    
    // Search for all unread messages
    imap.search(['UNSEEN'], (err, results) => {
      if (err) throw err;
      
      if (!results || !results.length) {
        console.log('No unread emails');
        imap.end();
        return;
      }

      const f = imap.fetch(results, {
        bodies: '',
        markSeen: false
      });

      f.on('message', (msg, seqno) => {
        msg.on('body', (stream) => {
          simpleParser(stream, async (err, parsed) => {
            if (err) {
              console.error(err);
              return;
            }
            
            console.log('-------------------');
            console.log('Email №', seqno);
            console.log('From:', parsed.from.text);
            console.log('Subject:', parsed.subject);
            console.log('Date:', parsed.date);
          });
        });
      });

      f.once('error', (err) => {
        console.error('Fetch error:', err);
      });

      f.once('end', () => {
        console.log('Done fetching all messages!');
        imap.end();
      });
    });
  });
});

imap.once('error', (err) => {
  console.error('IMAP error:', err);
});

imap.once('end', () => {
  console.log('Connection ended');
});

// Connect to the mail server
imap.connect();

