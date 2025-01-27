

import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

dotenv.config();

// Telegram Bot Token
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

// Настройки почтового ящика
const email = process.env.GMAIL_EMAIL;
const password = process.env.GMAIL_APP_PASSWORD;
const imapHost = process.env.IMAP_HOST || 'imap.gmail.com';
const imapPort = parseInt(process.env.IMAP_PORT || '993', 10);

if (!email || !password || !botToken) {
    console.error('Ошибка: Отсутствуют необходимые переменные окружения.');
    process.exit(1);
}

console.log('Бот запущен...');

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
    });

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
    
    const searchResults = await new Promise((resolve, reject) => {
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

        bot.sendMessage(chatId, `Найдено ${searchResults.length} непрочитанных писем.`);

        const fetch = imap.fetch(searchResults, { bodies: '', struct: true, uid: true });
        fetch.on('message', async (msg, seqno) => {
            try {
                 console.log(`checkUnreadEmails: Получено письмо #${seqno}.`);
               const attributes = await new Promise((resolve) => {
                   msg.on('attributes', (attrs) => resolve(attrs));
               });
               console.log(`checkUnreadEmails: Атрибуты письма #${seqno} получены.`);

                const parsedMail = await new Promise((resolve, reject) => {
                     msg.on('body', (stream) => {
                        simpleParser(stream, {}, (err, mail) => {
                            if (err) {
                                reject(new Error(`Ошибка парсинга письма: ${err.message}`));
                            } else {
                                resolve(mail);
                            }
                        });
                    });
                 });
                 console.log(`checkUnreadEmails: Письмо #${seqno} успешно распарсено.`);

               const emailInfo = `
                **От:** ${parsedMail.from.text}
                **Тема:** ${parsedMail.subject}
                **Дата:** ${parsedMail.date}
                `;

               const deleteButton = {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: 'Удалить 🗑️', callback_data: `delete_${attributes.uid}` }
                        ]],
                    },
                };

                bot.sendMessage(chatId, emailInfo, deleteButton);
                 console.log(`checkUnreadEmails: Информация о письме #${seqno} отправлена.`);
            } catch (parseError) {
                console.error(`checkUnreadEmails: Ошибка при обработке письма #${seqno}:`, parseError);
            }
        });

        await new Promise((resolve, reject) => {
            fetch.once('error', reject);
            fetch.once('end', resolve);
        });
           console.log('checkUnreadEmails: Все письма получены.');
           imap.end();
    } catch (error) {
         console.error('checkUnreadEmails: Произошла ошибка:', error);
        bot.sendMessage(chatId, `Произошла ошибка: ${error.message}`);
        imap.end();
    }
}

// Функция для удаления письма
async function deleteEmail(chatId, uid) {
   const imap = new Imap({
      user: email,
      password: password,
      host: imapHost,
      port: imapPort,
      tls: true,
   });

  try {
      console.log("deleteEmail: Подключение к IMAP...");

        await new Promise((resolve, reject) => {
            imap.once('ready', resolve);
            imap.once('error', reject);
            imap.connect();
        });
      console.log("deleteEmail: Успешное подключение к IMAP.");
     
        await new Promise((resolve, reject) => {
            imap.openBox('INBOX', false, (err, box) => {
                if (err) {
                    reject(new Error(`Ошибка открытия почтового ящика для удаления: ${err.message}`));
                } else {
                    resolve(box);
                }
            });
        });
         console.log("deleteEmail: Почтовый ящик открыт для удаления.");

        await new Promise((resolve, reject) => {
            imap.addFlags(uid, '\\Deleted', (err) => {
                if (err) {
                    reject(new Error(`Ошибка добавления флага удаления: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });
        console.log(`deleteEmail: Флаг удаления добавлен к письму с UID ${uid}.`);

        await new Promise((resolve, reject) => {
            imap.expunge((err) => {
                if (err) {
                    reject(new Error(`Ошибка очистки почтового ящика: ${err.message}`));
                } else {
                    console.log(`deleteEmail: Письмо с UID ${uid} успешно удалено.`);
                    bot.sendMessage(chatId, `Письмо с UID ${uid} успешно удалено.`);
                    resolve();
                }
            });
        });

        imap.end();
          console.log('deleteEmail: Соединение с IMAP завершено.');
    } catch (error) {
      console.error('deleteEmail: Ошибка при удалении письма:', error);
        bot.sendMessage(chatId, `Ошибка при удалении письма: ${error.message}`);
        imap.end();
    }
}

// Обработка команд
bot.onText(/\/checkEmails/, (msg) => {
     console.log("Получено сообщение /checkEmails:", msg);
    const chatId = msg.chat.id;
    checkUnreadEmails(chatId);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
     console.log("Получен callback query:", query);
    const data = query.data;

    if (data.startsWith('delete_')) {
        const uid = data.split('_')[1];
          console.log(`Получен запрос на удаление письма с UID ${uid}.`);
        deleteEmail(chatId, uid);
        bot.answerCallbackQuery(query.id);
    }
});

bot.on('message', (msg) => {
    console.log("Получено сообщение:", msg); // Log all incoming messages
});

console.log('Бот работает!');
