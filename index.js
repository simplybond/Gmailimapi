import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Telegram Bot Token
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

// Настройки почтового ящика
const email = process.env.GMAIL_EMAIL;
const password = process.env.GMAIL_APP_PASSWORD;
const imapHost = process.env.IMAP_HOST || 'imap.yandex.ru';
const imapPort = parseInt(process.env.IMAP_PORT || '993', 10);

// Путь к сертификату
const certPath = './yandex-cert.pem'; // Убедитесь, что путь соответствует Railway

if (!email || !password || !botToken) {
    console.error('Ошибка: Отсутствуют необходимые переменные окружения.');
    process.exit(1);
}

console.log('Бот запущен...');

// Функция для проверки непрочитанных писем
async function checkUnreadEmails(chatId) {
    const imap = new Imap({
        user: email,
        password: password,
        host: imapHost,
        port: imapPort,
        tls: true,
        tlsOptions: {
            ca: [fs.readFileSync(certPath)], // Подключаем сертификат
        },
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
                bot.sendMessage(chatId, emailInfo);
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

// Обработка команд
bot.onText(/\/checkEmails/, (msg) => {
    const chatId = msg.chat.id;
    checkUnreadEmails(chatId);
});

console.log('Бот работает!');

