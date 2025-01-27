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

// Инициализация бота
const bot = new TelegramBot(botToken, { polling: true });

// Функция для соединения с IMAP сервером
function openImapConnection() {
    return new Imap({
        user: emailUser,
        password: emailPassword,
        host: imapHost,
        port: imapPort,
        tls: true,
    });
}

// Обработчик команды /check
bot.onText(/\/check/, async (msg) => {
    const chatId = msg.chat.id;
    const imap = openImapConnection();

    try {
        // Подключаемся к почтовому серверу
        await new Promise((resolve, reject) => {
            imap.once('ready', resolve);
            imap.once('error', reject);
            imap.connect();
        });

        // Открываем папку входящих сообщений
        await new Promise((resolve, reject) => {
            imap.openBox('INBOX', false, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Ищем непрочитанные письма
        const unreadMessages = await new Promise((resolve, reject) => {
            imap.search(['UNSEEN'], (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });

        if (unreadMessages.length === 0) {
            bot.sendMessage(chatId, 'Новых писем нет.');
            imap.end();
            return;
        }

        // Список сообщений с кнопками "Удалить"
        const emailPromises = [];
        const inlineKeyboard = [];

        const fetch = imap.fetch(unreadMessages, { bodies: '' });

        fetch.on('message', (msg, seqno) => {
            const emailPromise = new Promise((resolve) => {
                msg.on('body', (stream) => {
                    simpleParser(stream, (err, parsed) => {
                        if (err) {
                            console.error('Ошибка парсинга:', err);
                            resolve();
                            return;
                        }

                        const subject = parsed.subject || 'Без темы';
                        const from = parsed.from?.text || 'Неизвестно';
                        const date = parsed.date ? parsed.date.toLocaleString() : 'Неизвестно';

                        // Добавляем кнопку для каждого письма
                        inlineKeyboard.push([{
                            text: `Удалить письмо ${seqno}`,
                            callback_data: `delete_email_${seqno}`,
                        }]);

                        bot.sendMessage(chatId, `Письмо от: ${from}\nТема: ${subject}\nДата: ${date}`, {
                            reply_markup: { inline_keyboard: inlineKeyboard },
                        });

                        resolve();
                    });
                });
            });
            emailPromises.push(emailPromise);
        });

        fetch.on('end', async () => {
            await Promise.all(emailPromises);
            imap.end();
        });

        fetch.on('error', (err) => {
            console.error('Ошибка получения писем:', err);
        });

    } catch (err) {
        console.error('Ошибка проверки почты:', err);
        bot.sendMessage(chatId, 'Произошла ошибка при проверке почты.');
    }
});

// Обработчик callback-запросов для удаления писем
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const seqno = query.data.split('_')[2]; // Получаем номер письма для удаления

    const imap = openImapConnection();

    bot.editMessageText(`Удаляю письмо №${seqno}...`, { chat_id: chatId, message_id: query.message.message_id });

    try {
        // Подключаемся к IMAP
        await new Promise((resolve, reject) => {
            imap.once('ready', resolve);
            imap.once('error', reject);
            imap.connect();
        });

        // Удаляем письмо
        await new Promise((resolve, reject) => {
            imap.openBox('INBOX', false, (err) => {
                if (err) reject(err);
                else {
                    imap.setFlags([seqno], ['\\Deleted'], (err) => {
                        if (err) reject(err);
                        else {
                            imap.expunge((err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        }
                    });
                }
            });
        });

        bot.editMessageText(`Письмо №${seqno} успешно удалено.`, { chat_id: chatId, message_id: query.message.message_id });

    } catch (err) {
        console.error('Ошибка удаления письма:', err);
        bot.editMessageText(`Ошибка удаления письма №${seqno}: ${err.message}`, { chat_id: chatId, message_id: query.message.message_id });
    } finally {
        imap.end();
    }

    bot.answerCallbackQuery(query.id);
});

// Обработчик ошибок
bot.on('polling_error', (err) => {
    console.error('Ошибка polling:', err.message);
});

