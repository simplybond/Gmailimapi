const TelegramBot = require('node-telegram-bot-api');
const Imap = require('imap');
const { simpleParser } = require('mailparser');
require('dotenv').config();

// Telegram Bot setup
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Yandex Mail IMAP configuration
const imap = new Imap({
  user: process.env.YANDEX_EMAIL,
  password: process.env.YANDEX_PASSWORD,
  host: 'imap.yandex.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

// Store message UIDs for deletion
const messageCache = new Map();

// Function to check emails
async function checkEmails(chatId) {
  imap.once('ready', () => {
    imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        bot.sendMessage(chatId, 'Error opening mailbox');
        return;
      }

      // Search for unread messages
      imap.search(['UNSEEN'], (err, results) => {
        if (err) {
          bot.sendMessage(chatId, 'Error searching messages');
          return;
        }

        if (results.length === 0) {
          bot.sendMessage(chatId, 'No new messages');
          imap.end();
          return;
        }

        const fetch = imap.fetch(results, { bodies: '' });

        fetch.on('message', (msg, seqno) => {
          msg.on('body', (stream) => {
            simpleParser(stream, async (err, parsed) => {
              if (err) return;

              const uid = results[seqno - 1];
              messageCache.set(seqno.toString(), uid);

              const message = `
Message #${seqno}:
From: ${parsed.from.text}
Subject: ${parsed.subject}
Date: ${parsed.date}

To delete this message, use /delete ${seqno}
`;
              bot.sendMessage(chatId, message);
            });
          });
        });

        fetch.once('error', (err) => {
          bot.sendMessage(chatId, 'Error fetching messages');
        });

        fetch.once('end', () => {
          imap.end();
        });
      });
    });
  });

  imap.once('error', (err) => {
    bot.sendMessage(chatId, 'Connection error');
  });

  imap.connect();
}

// Function to delete email
function deleteEmail(chatId, messageNumber) {
  const uid = messageCache.get(messageNumber);
  if (!uid) {
    bot.sendMessage(chatId, 'Message not found. Please check messages first using /check');
    return;
  }

  imap.once('ready', () => {
    imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        bot.sendMessage(chatId, 'Error opening mailbox');
        return;
      }

      // Move message to Trash
      imap.move(uid, '[Gmail]/Trash', (err) => {
        if (err) {
          bot.sendMessage(chatId, 'Error moving message to trash');
          console.error(err);
        } else {
          bot.sendMessage(chatId, `Message #${messageNumber} moved to trash`);
          messageCache.delete(messageNumber);
        }
        imap.end();
      });
    });
  });

  imap.once('error', (err) => {
    bot.sendMessage(chatId, 'Connection error');
  });

  imap.connect();
}

// Bot commands
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Welcome! Use /check to check for new emails and /delete <number> to move a message to trash.');
});

bot.onText(/\/check/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Checking for new emails...');
  checkEmails(chatId);
});

bot.onText(/\/delete (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const messageNumber = match[1];
  deleteEmail(chatId, messageNumber);
});

console.log('Bot is running...');




