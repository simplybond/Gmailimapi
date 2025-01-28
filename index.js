import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

// Загрузка переменных из .env
dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const emailUser = process.env.YANDEX_USER;
const emailPassword = process.env.YANDEX_APP_PASSWORD;
const imapHost = process.env.IMAP_HOST || 'imap.mail.yandex.ru';
const imapPort = parseInt(process.env.IMAP_PORT, 10) || 993;

// Проверка необходимых переменных окружения
if (!botToken || !emailUser || !emailPassword) {
    console.error('Ошибка: не заданы необходимые переменные окружения.');
    process.exit(1);
}

// Инициализация бота
const bot = new TelegramBot(botToken, { polling: true });

// Функция для получения UID писем
async function getUIDs(imap) {
    return new Promise((resolve, reject) => {
        imap.openBox('INBOX', false, (err, box) => {
            if (err) reject(err);
            imap.search(['UNSEEN'], (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
    });
}

// Функция для удаления письма по UID
async function deleteEmailByUID(imap, uid) {
  return new Promise((resolve, reject) => {
    imap.openBox('INBOX', false, (err) => {
      if (err) reject(err);
      imap.addFlags(uid, ['\\Deleted'], (err) => {
        if (err) reject(err);
        imap.expunge((err) => {
          if (err) reject(err);
            resolve();
        });
      });
    });
  });
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Привет! Напиши /check, чтобы проверить новые письма.');
});

// Обработчик команды /check
bot.onText(/\/check/, async (msg) => {
  const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Проверяю новые письма...');
    try {
        const imap = new Imap({
            user: emailUser,
            password: emailPassword,
            host: imapHost,
            port: imapPort,
            tls: true,
        });

      imap.once('ready', async () => {
        const uids = await getUIDs(imap);
        if (uids.length === 0) {
          bot.sendMessage(chatId, 'Нет новых писем.');
          imap.end();
          return;
        }

        for (const uid of uids) {
          const fetch = imap.fetch(uid, { bodies: 'TEXT' });
          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
                simpleParser(stream, (err, mail) => {
                    if (err) {
                        console.error('Ошибка парсинга:', err);
                        return;
                  }
                    bot.sendMessage(chatId, `UID:${uid}\nОт: ${mail.from?.text || 'Неизвестно'}\nТема: ${mail.subject || 'Без темы'}\nДата: ${mail.date?.toLocaleString() || 'Неизвестно'}\n\nТекст:\n${mail.text?.substring(0, 400) || 'Текст не доступен'}`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: 'Удалить', callback_data: `delete:${uid}` }],
                            ],
                        },
                    });
                });
            });
          });
          fetch.once('error', (err) => {
              console.error('Fetch error:', err);
          });
        }
      });
        imap.once('error', (err) => {
            console.error("IMAP Error:", err);
            bot.sendMessage(chatId, `Ошибка: ${err.message}`);
        });
        imap.connect();
    } catch (err) {
        console.error('Ошибка:', err);
       bot.sendMessage(chatId, `Ошибка: ${err.message}`);
    }
});


// Обработчик callback для удаления
bot.on('callback_query', async (query) => {
  if (query.data?.startsWith('delete:')) {
    const uid = query.data.split(':')[1];
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const imap = new Imap({
            user: emailUser,
            password: emailPassword,
            host: imapHost,
            port: imapPort,
            tls: true,
    });
        try {
            await new Promise((resolve, reject) => {
                imap.once('ready', async () => {
                   await deleteEmailByUID(imap, uid);
                   bot.editMessageText('Письмо удалено!', { chat_id: chatId, message_id: messageId });
                    imap.end();
                    resolve();
                });
                imap.once('error', reject);
                 imap.connect();
           });
        } catch (err) {
            console.error('Ошибка удаления:', err);
           bot.sendMessage(chatId, `Ошибка при удалении письма: ${err.message}`);
        }
    }
});



bot.on('polling_error', (err) => {
  console.error('Polling Error:', err);
});

