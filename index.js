import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

// Загрузка переменных из .env или Railway
dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const emailUser = process.env.YANDEX_USER;
const emailPassword = process.env.YANDEX_APP_PASSWORD;
const imapHost = process.env.IMAP_HOST || 'imap.mail.yandex.ru';
const imapPort = parseInt(process.env.IMAP_PORT, 10) || 993;

// Проверка необходимых переменных окружения
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

let isCheckingEmails = false;

// Функция проверки непрочитанных писем
async function checkUnreadEmails(chatId, deleteMode = false, imapInstance = null) {
    console.log('Начинаю проверку почты...');
    console.log(`Подключение к IMAP: host=${imapHost}, порт=${imapPort}, пользователь=${emailUser}`);
    
    const imap = imapInstance || new Imap({
        user: emailUser,
        password: emailPassword,
        host: imapHost,
        port: imapPort,
        tls: true,
    });

    return new Promise((resolve, reject) => {
        if (!imapInstance) {
            imap.once('ready', () => {
                console.log('IMAP соединение успешно установлено.');
                openBox();
            });
        } else {
            openBox();
        }

        const openBox = () => {
            imap.openBox('INBOX', false, async (err, box) => {
                if (err) {
                    console.error('Ошибка открытия почтового ящика:', err.message);
                    reject(`Ошибка открытия почтового ящика: ${err.message}`);
                    return;
                }

                console.log(`Почтовый ящик открыт. Найдено писем: ${box.messages.total}`);
                console.log('Ищу непрочитанные письма...');

                imap.search(['UNSEEN'], async (err, results) => {
                    if (err) {
                        console.error('Ошибка поиска писем:', err.message);
                        reject(`Ошибка поиска писем: ${err.message}`);
                        return;
                    }

                    if (results.length === 0) {
                        console.log('Нет новых писем.');
                        resolve('Нет новых писем.');
                        if (!imapInstance) imap.end();
                        return;
                    }

                    console.log(`Найдено ${results.length} непрочитанных писем.`);
                    if (deleteMode) {
                        console.log('Удаляю непрочитанные письма...');
                        try {
                            await new Promise((resolveDelete, rejectDelete) => {
                                imap.setFlags(results, ['\\Deleted'], (err) => {
                                    if (err) {
                                        console.error('Ошибка удаления писем:', err.message);
                                        rejectDelete(`Ошибка удаления писем: ${err.message}`);
                                        return;
                                    }

                                    imap.expunge(err => {
                                        if (err) {
                                            console.error('Ошибка expunge:', err.message);
                                            rejectDelete(`Ошибка expunge: ${err.message}`);
                                            return;
                                        }

                                        console.log('Письма успешно удалены.');
                                        resolveDelete();
                                    });
                                });
                            });

                            resolve('Непрочитанные письма удалены.');
                        } catch (error) {
                            reject(`Ошибка удаления писем: ${error}`);
                        } finally {
                            if (!imapInstance) imap.end();
                        }
                        return;
                    }

                    const fetch = imap.fetch(results, { bodies: '' });
                    let emailSummary = '';
                    const emailPromises = [];
                    fetch.on('message', (msg, seqno) => {
                        console.log(`Обрабатываю письмо №${seqno}`);
                        const emailPromise = new Promise((resolveMessage) => {
                            msg.on('body', (stream) => {
                                simpleParser(stream, (err, parsed) => {
                                    if (err) {
                                        console.error('Ошибка парсинга письма:', err.message);
                                        resolveMessage();
                                        return;
                                    }

                                    console.log(`Письмо от: ${parsed.from?.text}`);
                                    console.log(`Тема: ${parsed.subject}`);
                                    emailSummary += `От: ${parsed.from?.text || 'Неизвестно'}\n`;
                                    emailSummary += `Тема: ${parsed.subject || 'Без темы'}\n`;
                                    emailSummary += `Дата: ${parsed.date?.toLocaleString() || 'Неизвестно'}\n\n`;
                                    resolveMessage();
                                });
                            });
                        });
                        emailPromises.push(emailPromise);
                    });

                    fetch.on('end', async () => {
                        console.log('Все письма обработаны.');
                        await Promise.all(emailPromises);
                        const keyboard = results.map(seqno => ({
                            text: `Удалить ${seqno}`,
                            callback_data: `delete_email_${seqno}`,
                        }));

                        resolve({ summary: emailSummary || 'Писем не найдено.', keyboard: keyboard });
                        if (!imapInstance) imap.end();
                    });

                    fetch.on('error', (err) => {
                        console.error('Ошибка получения писем:', err.message);
                        reject(`Ошибка получения писем: ${err.message}`);
                    });
                });
            });
        }

        if(!imapInstance) {
            imap.once('error', (err) => {
                console.error('Ошибка IMAP-соединения:', err.message);
                reject(`Ошибка IMAP-соединения: ${err.message}`);
            });
            imap.connect();
        }
    });
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`Получена команда /start от пользователя ${chatId}`);
    bot.sendMessage(chatId, 'Привет! Напиши /check, чтобы проверить новые письма.');
});

// Обработчик команды /check
bot.onText(/\/check/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Получена команда /check от пользователя ${chatId}`);

    if (isCheckingEmails) {
        console.log("Проверка почты уже идет.");
        bot.sendMessage(chatId, 'Пожалуйста, подождите, идет проверка почты.');
        return;
    }

    isCheckingEmails = true;
    bot.sendMessage(chatId, 'Проверяю новые письма...');

    try {
        const result = await checkUnreadEmails(chatId);
        if (typeof result === 'string') {
            bot.sendMessage(chatId, result);
        } else {
            bot.sendMessage(chatId, result.summary, { reply_markup: { inline_keyboard: result.keyboard } });
        }
    } catch (err) {
        console.error('Ошибка проверки писем:', err);
        bot.sendMessage(chatId, `Ошибка: ${err}`);
    } finally {
        console.log("Проверка завершена.");
        isCheckingEmails = false;
    }
});

// Обработчик callback запросов
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const callbackData = query.data;

    if (callbackData.startsWith('delete_email_')) {
        const seqno = callbackData.split('_')[2];
        bot.editMessageText(`Удаляю письмо №${seqno}...`, { chat_id: chatId, message_id: messageId });
        try {
            const imap = new Imap({
                user: emailUser,
                password: emailPassword,
                host: imapHost,
                port: imapPort,
                tls: true,
            });

            await checkUnreadEmails(chatId, true, imap);
            bot.editMessageText(`Письмо №${seqno} удалено.`, { chat_id: chatId, message_id: messageId });
        } catch (err) {
            bot.editMessageText(`Ошибка удаления письма: ${err}`, { chat_id: chatId, message_id: messageId });
            console.error('Ошибка удаления письма:', err);
        }
    }

    bot.answerCallbackQuery(query.id);
});

// Обработчик ошибок
bot.on('polling_error', (err) => {
    console.error('Ошибка polling:', err.message);
});
