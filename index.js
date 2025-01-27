import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

dotenv.config();

// Telegram Bot Token
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

// Настройки почтового ящика
const email = process.env.YANDEX_EMAIL; // Изменил на YANDEX_EMAIL
const password = process.env.YANDEX_APP_PASSWORD; // Изменил на YANDEX_APP_PASSWORD
const imapHost = process.env.IMAP_HOST || 'imap.yandex.ru';
const imapPort = parseInt(process.env.IMAP_PORT || '993', 10);
const certificate = process.env.CERTIFICATE;

if (!email || !password || !botToken) {
    console.error('Ошибка: Отсутствуют необходимые переменные окружения.');
    process.exit(1);
}

console.log('Бот запущен...');
if (certificate) {
    console.log('Сертификат получен из переменной окружения.');
} else {
    console.log('Сертификат не получен из переменной окружения.');
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Привет! Я ваш бот.');
});

// Функция для проверки непрочитанных писем
async function checkUnreadEmails(chatId) {
    const imap = new Imap({
        user: email,
        password: password,
        host: imapHost,
        port: imapPort,
        tls: true,
        tlsOptions: certificate ? { ca: [certificate] } : undefined,
    });

    let searchResults = [];
    try {
        console.log("checkUnreadEmails: Подключение к IMAP...");
        await new Promise((resolve, reject) => {
            imap.once('ready', resolve);
            imap.once('error', reject);
            imap.connect();
        });
        console.log("checkUnreadEmails: Успешное подключение к IMAP.");

        const box = await new Promise((resolve, reject) => {
            imap.openBox('INBOX', true, (err, box) => {
                if (err) {
                    reject(new Error(`Ошибка открытия почтового ящика: ${err.message}`));
                } else {
                    resolve(box);
                }
            });
        });
        console.log("checkUnreadEmails: Почтовый ящик открыт.");

        searchResults = await new Promise((resolve, reject) => {
            imap.search(['UNSEEN'], (err, results) => {
                if (err) {
                    reject(new Error(`Ошибка поиска писем: ${err.message}`));
                } else {
                    resolve(results);
                }
            });
        });

       console.log(`checkUnreadEmails: Найдено ${searchResults.length} непрочитанных писем.`);

        if (searchResults.length === 0) {
           bot.sendMessage(chatId, 'Нет новых писем.');
           imap.end();
            return;
        }
        const showEmailsButton = {
            reply_markup: {
                inline_keyboard: [[{ text: 'Показать непрочитанные письма', callback_data: `show_emails_${searchResults.length}` }]],
            },
        };
        bot.sendMessage(chatId, `Найдено ${searchResults.length} непрочитанных писем.`, showEmailsButton);
         imap.end();
    } catch (error) {
        console.error('checkUnreadEmails: Произошла ошибка:', error);
        bot.sendMessage(chatId, `Произошла ошибка: ${error.message}`);
          imap.end();
    }
}

// Обработка команд
bot.onText(/\/checkEmails/, (msg) => {
    const chatId = msg.chat.id;
    checkUnreadEmails(chatId);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const messageId = query.message.message_id;
    if (data.startsWith('show_emails_')) {
        bot.deleteMessage(chatId, messageId);
        const totalEmails = parseInt(data.split('_')[2]);
        await showUnreadEmails(chatId, totalEmails);
        bot.answerCallbackQuery(query.id);
    }
});

async function showUnreadEmails(chatId, totalEmails) {
    const imap = new Imap({
        user: email,
        password: password,
        host: imapHost,
        port: imapPort,
        tls: true,
        tlsOptions: certificate ? { ca: [certificate] } : undefined,
    });
  try {
         console.log("showUnreadEmails: Подключение к IMAP...");
        await new Promise((resolve, reject) => {
              imap.once('ready', resolve);
              imap.once('error', reject);
              imap.connect();
          });
          console.log("showUnreadEmails: Успешное подключение к IMAP.");
        const box = await new Promise((resolve, reject) => {
            imap.openBox('INBOX', true, (err, box) => {
                if (err) {
                    reject(new Error(`Ошибка открытия почтового ящика: ${err.message}`));
                } else {
                    resolve(box);
                }
            });
        });
          console.log("showUnreadEmails: Почтовый ящик открыт.");
          const searchResults = await new Promise((resolve, reject) => {
              imap.search(['UNSEEN'], (err, results) => {
                  if (err) {
                      reject(new Error(`Ошибка поиска писем: ${err.message}`));
                  } else {
                       resolve(results);
                  }
             });
        });
           console.log(`showUnreadEmails: Найдено ${searchResults.length} непрочитанных писем.`);
        if (searchResults.length === 0) {
            bot.sendMessage(chatId, 'Нет новых писем.');
             imap.end();
            return;
        }

        const fetch = imap.fetch(searchResults, { bodies: '', struct: true, uid: true });
        fetch.on('message', async (msg, seqno) => {
            try {
                console.log(`showUnreadEmails: Получено письмо #${seqno}.`);
                  const attributes = await new Promise((resolve) => {
                      msg.on('attributes', (attrs) => resolve(attrs));
                  });
                  console.log(`showUnreadEmails: Атрибуты письма #${seqno} получены.`);

              const parsedMail = await new Promise((resolve, reject) => {
                console.log(`showUnreadEmails: Начинаем парсинг письма #${seqno}.`);
                    msg.on('body', (stream) => {
                        simpleParser(stream, {}, (err, mail) => {
                            if (err) {
                                reject(new Error(`Ошибка парсинга письма: ${err.message}`));
                            } else {
                              console.log(`showUnreadEmails: Письмо #${seqno} успешно распарсено.`);
                                resolve(mail);
                            }
                        });
                    });
                });
                const emailInfo = `
                **От:** ${parsedMail.from.text}
                **Тема:** ${parsedMail.subject}
                **Дата:** ${parsedMail.date}
                `;
                bot.sendMessage(chatId, emailInfo);
                console.log(`showUnreadEmails: Информация о письме #${seqno} отправлена.`);
            } catch (parseError) {
                console.error(`showUnreadEmails: Ошибка при обработке письма #${seqno}:`, parseError);
            }
        });

        await new Promise((resolve, reject) => {
            fetch.once('error', reject);
            fetch.once('end', resolve);
        });
           console.log("showUnreadEmails: Все письма получены.");
        imap.end();
   } catch (error) {
       console.error('showUnreadEmails: Произошла ошибка:', error);
       bot.sendMessage(chatId, `Произошла ошибка: ${error.message}`);
         imap.end();
   }
}

bot.on('message', (msg) => {
    console.log("Получено сообщение:", msg); // Log all incoming messages
});

console.log('Бот работает!');

