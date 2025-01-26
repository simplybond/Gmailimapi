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

// Добавим обработку команды /start
bot.onText(/\/start/, (msg) => {
    console.log("Получено сообщение /start:", msg); // Log the message
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Привет! Я ваш бот.');
    console.log('Отправлено сообщение в ответ на /start');
});
    
bot.on('message', (msg) => {
   console.log("Получено сообщение:", msg); // Log all incoming messages
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
        await new Promise((resolve, reject) => {
            imap.once('ready', resolve);
            imap.once('error', reject);
            imap.connect();
        });

        const box = await new Promise((resolve, reject) => {
            imap.openBox('INBOX', true, (err, box) => {
                if (err) {
                    reject(new Error(`Ошибка открытия почтового ящика: ${err.message}`));
                } else {
                    resolve(box);
                }
            });
        });

        const searchResults = await new Promise((resolve, reject) => {
            imap.search(['UNSEEN'], (err, results) => {
                if (err) {
                    reject(new Error(`Ошибка поиска писем: ${err.message}`));
                } else {
                    resolve(results);
                }
            });
        });

        if (searchResults.length === 0) {
            bot.sendMessage(chatId, 'Нет новых писем.');
            imap.end();
            return;
        }

        bot.sendMessage(chatId, `Найдено ${searchResults.length} непрочитанных писем.`);

        const fetch = imap.fetch(searchResults, { bodies: '', struct: true, uid: true });
        fetch.on('message', async (msg, seqno) => {
            try {
                const attributes = await new Promise((resolve) => {
                    msg.on('attributes', (attrs) => resolve(attrs));
                });

                const parsedMail = await new Promise((resolve, reject) => {
                    msg.on('body', (stream, info) => {
                        simpleParser(stream, {}, (err, mail) => {
                            if (err) {
                                reject(new Error(`Ошибка парсинга письма: ${err.message}`));
                            } else {
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
                const deleteButton = {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: 'Удалить 🗑️', callback_data: `delete_${attributes.uid}` }
                        ]]
                    }
                };

                bot.sendMessage(chatId, emailInfo, deleteButton);
            } catch (parseError) {
                console.error(`Ошибка при обработке письма #${seqno}:`, parseError);
            }
        });

        await new Promise((resolve, reject) => {
            fetch.once('error', reject);
            fetch.once('end', resolve);
        });
        console.log('Все письма получены.');
        imap.end();
    } catch (error) {
        console.error('Произошла ошибка:', error);
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
        await new Promise((resolve, reject) => {
            imap.once('ready', resolve);
            imap.once('error', reject);
            imap.connect();
        });

        await new Promise((resolve, reject) => {
            imap.openBox('INBOX', false, (err, box) => {
                if (err) {
                    reject(new Error(`Ошибка открытия почтового ящика для удаления: ${err.message}`));
                } else {
                    resolve(box);
                }
            });
        });

        await new Promise((resolve, reject) => {
            imap.addFlags(uid, '\\Deleted', (err) => {
                if (err) {
                    reject(new Error(`Ошибка добавления флага удаления: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });

        await new Promise((resolve, reject) => {
            imap.expunge((err) => {
                if (err) {
                    reject(new Error(`Ошибка очистки почтового ящика: ${err.message}`));
                } else {
                    console.log(`Письмо с UID ${uid} успешно удалено.`);
                    bot.sendMessage(chatId, `Письмо с UID ${uid} успешно удалено.`);
                    resolve();
                }
            });
        });

        imap.end();
    } catch (error) {
        console.error('Ошибка при удалении письма:', error);
        bot.sendMessage(chatId, `Ошибка при удалении письма: ${error.message}`);
        imap.end();
    }
}

// Обработка команд
bot.onText(/\/checkEmails/, (msg) => {
    const chatId = msg.chat.id;
    checkUnreadEmails(chatId);
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('delete_')) {
        const uid = data.split('_')[1];
        deleteEmail(chatId, uid);
        bot.answerCallbackQuery(query.id);
    }
});

console.log('Бот работает!');
