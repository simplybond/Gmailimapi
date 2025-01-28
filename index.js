import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

dotenv.config();

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

      // Add Deleted flag and move to Trash
      imap.addFlags(uid, '\\Deleted', (err) => {
        if (err) {
          bot.sendMessage(chatId, 'Error marking message as deleted');
          console.error(err);
          imap.end();
          return;
        }

        // For Yandex.Mail, we need to use 'Trash' folder
        imap.move(uid, 'Trash', (err) => {
          if (err) {
            // If move fails, try expunge
            imap.expunge((expungeErr) => {
              if (expungeErr) {
                bot.sendMessage(chatId, 'Error deleting message');
                console.error(expungeErr);
              } else {
                bot.sendMessage(chatId, `Message #${messageNumber} deleted`);
                messageCache.delete(messageNumber);
              }
              imap.end();
            });
          } else {
            bot.sendMessage(chatId, `Message #${messageNumber} moved to trash`);
            messageCache.delete(messageNumber);
            imap.end();
          }
        });
      });
    });
  });

  imap.once('error', (err) => {
    bot.sendMessage(chatId, 'Connection error');
    console.error(err);
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




