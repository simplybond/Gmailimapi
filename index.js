import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

dotenv.config();
console.log('Environment variables loaded');

// Telegram Bot setup
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
console.log('Telegram bot initialized');

// Yandex Mail IMAP configuration
const imap = new Imap({
  user: process.env.YANDEX_EMAIL,
  password: process.env.YANDEX_PASSWORD,
  host: 'imap.yandex.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});
console.log('IMAP configuration set up');

// Store message UIDs for deletion
const messageCache = new Map();
console.log('Message cache initialized');

// Function to check emails
async function checkEmails(chatId) {
  console.log(`Starting email check for chat ID: ${chatId}`);
  
  imap.once('ready', () => {
    console.log('IMAP connection ready');
    imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        console.error('Error opening mailbox:', err);
        bot.sendMessage(chatId, 'Error opening mailbox');
        return;
      }
      console.log('Mailbox opened successfully');

      // Search for unread messages
      imap.search(['UNSEEN'], (err, results) => {
        if (err) {
          console.error('Error searching messages:', err);
          bot.sendMessage(chatId, 'Error searching messages');
          return;
        }
        console.log(`Found ${results.length} unread messages`);
        console.log('Message UIDs:', results);

        if (results.length === 0) {
          bot.sendMessage(chatId, 'No new messages');
          imap.end();
          return;
        }

        const fetch = imap.fetch(results, { bodies: '', struct: true });
        console.log('Started fetching message bodies');

        fetch.on('message', (msg, seqno) => {
          console.log(`Processing message #${seqno}`);
          
          msg.once('attributes', (attrs) => {
            const uid = attrs.uid;
            console.log(`Got UID ${uid} for message #${seqno}`);
            messageCache.set(seqno.toString(), uid);
          });

          msg.on('body', (stream) => {
            simpleParser(stream, async (err, parsed) => {
              if (err) {
                console.error(`Error parsing message #${seqno}:`, err);
                return;
              }
              console.log(`Successfully parsed message #${seqno}`);

              const message = `
Message #${seqno}:
From: ${parsed.from.text}
Subject: ${parsed.subject}
Date: ${parsed.date}

To delete this message, use /delete ${seqno}
`;
              bot.sendMessage(chatId, message);
              console.log(`Sent message #${seqno} details to chat`);
            });
          });
        });

        fetch.once('error', (err) => {
          console.error('Error during fetch:', err);
          bot.sendMessage(chatId, 'Error fetching messages');
        });

        fetch.once('end', () => {
          console.log('Finished fetching all messages');
          console.log('Current message cache:', Object.fromEntries(messageCache));
          imap.end();
        });
      });
    });
  });

  imap.once('error', (err) => {
    console.error('IMAP connection error:', err);
    bot.sendMessage(chatId, 'Connection error');
  });

  console.log('Initiating IMAP connection');
  imap.connect();
}

// Function to delete email
function deleteEmail(chatId, messageNumber) {
  console.log(`Starting delete operation for message #${messageNumber} in chat ${chatId}`);
  console.log('Current message cache:', Object.fromEntries(messageCache));
  
  const uid = messageCache.get(messageNumber);
  if (!uid) {
    console.log(`Message #${messageNumber} not found in cache`);
    bot.sendMessage(chatId, 'Message not found. Please check messages first using /check');
    return;
  }
  console.log(`Found UID ${uid} for message #${messageNumber}`);

  const newImap = new Imap({
    user: process.env.YANDEX_EMAIL,
    password: process.env.YANDEX_PASSWORD,
    host: 'imap.yandex.com',
    port: 993,
    tls: true,
    tlsOptions: { rejectUnauthorized: false }
  });

  newImap.once('ready', () => {
    console.log('IMAP connection ready for deletion');
    newImap.openBox('INBOX', false, (err, box) => {
      if (err) {
        console.error('Error opening mailbox for deletion:', err);
        bot.sendMessage(chatId, 'Error opening mailbox');
        return;
      }
      console.log('Mailbox opened successfully for deletion');

      console.log(`Adding Deleted flag to message UID ${uid}`);
      newImap.addFlags([uid], '\\Deleted', (err) => {
        if (err) {
          console.error('Error marking message as deleted:', err);
          bot.sendMessage(chatId, 'Error marking message as deleted');
          return;
        }
        console.log('Successfully marked message as deleted');

        newImap.expunge((expungeErr) => {
          if (expungeErr) {
            console.error('Expunge failed:', expungeErr);
            bot.sendMessage(chatId, 'Error deleting message');
          } else {
            console.log('Message successfully expunged');
            bot.sendMessage(chatId, `Message #${messageNumber} deleted`);
            messageCache.delete(messageNumber);
          }
          newImap.end();
        });
      });
    });
  });

  newImap.once('error', (err) => {
    console.error('IMAP connection error during deletion:', err);
    bot.sendMessage(chatId, 'Connection error');
  });

  console.log('Initiating IMAP connection for deletion');
  newImap.connect();
}

// Bot commands
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`Start command received from chat ${chatId}`);
  bot.sendMessage(chatId, 'Welcome! Use /check to check for new emails and /delete <number> to move a message to trash.');
});

bot.onText(/\/check/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`Check command received from chat ${chatId}`);
  bot.sendMessage(chatId, 'Checking for new emails...');
  checkEmails(chatId);
});

bot.onText(/\/delete (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const messageNumber = match[1];
  console.log(`Delete command received from chat ${chatId} for message #${messageNumber}`);
  deleteEmail(chatId, messageNumber);
});

console.log('Bot is running...');
