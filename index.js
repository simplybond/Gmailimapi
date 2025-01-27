

import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

// Загрузка переменных из Railway
dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const emailUser = process.env.YANDEX_USER;
const emailPassword = process.env.YANDEX_APP_PASSWORD;
const imapHost = process.env.IMAP_HOST || 'imap.mail.yandex.ru';
const imapPort = parseInt(process.env.IMAP_PORT, 10) || 993;

if (!botToken || !emailUser || !emailPassword || !imapHost || isNaN(imapPort)) {
    console.error('Ошибка: не заданы необходимые переменные окружения.');
    process.exit(1);
}

// Инициализация бота
const bot = new TelegramBot(botToken, { polling: true });

bot.getMe()
    .then((botInfo) => {
        console.log(`Бот успешно запущен: ${botInfo.username}`);
    })
    .catch((err) => {
        console.error('Ошибка подключения к Telegram API:', err);
        process.exit(1);
    });

// Функция проверки непрочитанных писем
async function checkUnreadEmails(chatId) {
    const imap = new Imap({
        user: emailUser,
        password: emailPassword,
        host: imapHost,
        port: imapPort,
        tls: true,
    });

    return new Promise((resolve, reject) => {
        imap.once('ready', () => {
            imap.openBox('INBOX', false, (err, box) => {
                if (err) {
                    reject(`Ошибка открытия почтового ящика: ${err.message}`);
                    return;
                }

                imap.search(['UNSEEN'], (err, results) => {
                    if (err) {
                        reject(`Ошибка поиска писем: ${err.message}`);
                        return;
                    }

                    if (results.length === 0) {
                        resolve('Нет новых писем.');
                        imap.end();
                        return;
                    }

                    const fetch = imap.fetch(results, { bodies: '' });
                    let emailSummary = '';

                    fetch.on('message', (msg) => {
                        msg.on('body', (stream) => {
                            simpleParser(stream, (err, parsed) => {
                                if (err) {
                                    console.error('Ошибка парсинга письма:', err.message);
                                    return;
                                }

                                emailSummary += `От: ${parsed.from?.text || 'Неизвестно'}\n`;
                                emailSummary += `Тема: ${parsed.subject || 'Без темы'}\n`;
                                emailSummary += `Дата: ${parsed.date?.toLocaleString() || 'Неизвестно'}\n\n`;
                            });
                        });
                    });

                    fetch.on('end', () => {
                        resolve(emailSummary || 'Писем не найдено.');
                        imap.end();
                    });
                });
            });
        });

        imap.once('error', (err) => {
            reject(`Ошибка IMAP-соединения: ${err.message}`);
        });

        imap.once('end', () => {
            console.log('Соединение IMAP закрыто.');
        });

        imap.connect();
    });
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Привет! Нажми кнопку ниже, чтобы проверить письма:', {
        reply_markup: {
            inline_keyboard: [[{ text: 'Проверить письма', callback_data: 'check_emails' }]],
        },
    });
});

// Обработчик кнопки "Проверить письма"
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    bot.answerCallbackQuery(query.id);

    try {
        bot.sendMessage(chatId, 'Проверяю новые письма...');
        const emailSummary = await checkUnreadEmails(chatId);
        bot.sendMessage(chatId, emailSummary);
    } catch (err) {
        console.error('Ошибка проверки писем:', err);
        bot.sendMessage(chatId, `Ошибка: ${err}`);
    }
});

// Обработчик ошибок
bot.on('polling_error', (err) => {
    console.error('Ошибка polling:', err.message);
});
