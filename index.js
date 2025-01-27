

import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

dotenv.config();

// Telegram Bot Token (получаем из .env)
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

// Настройки почтового ящика (из переменных окружения)
const email = process.env.YANDEX_USER;
const password = process.env.YANDEX_APP_PASSWORD;
const imapHost = process.env.IMAP_HOST || 'imap.mail.yandex.ru';
const imapPort = process.env.IMAP_PORT ? parseInt(process.env.IMAP_PORT, 10) : 993;

// Важная проверка переменных окружения
if (!email || !password || !botToken || !imapHost || isNaN(imapPort)) {
    console.error('Ошибка: Отсутствуют необходимые переменные окружения или неверный формат порта.');
    process.exit(1);
}

console.log('Бот запущен...');

// Функция для обработки ошибок
function handleError(error, chatId, bot, specificError = 'Неизвестная ошибка') {
    const errorMessage = `Ошибка: ${specificError}\nПодробная информация: ${error.message}`;
    console.error(errorMessage);
    bot.sendMessage(chatId, `Ошибка: ${errorMessage}`);
}

async function checkAndProcessEmails(chatId) {
    console.log(`Проверка писем для пользователя ${email}...`);

    const imap = new Imap({ user: email, password: password, host: imapHost, port: imapPort, tls: true });
    let emailList = '';

    imap.once('ready', () => {
        console.log('Подключение к серверу IMAP успешно.');
        
        imap.openBox('INBOX', true, (err, box) => {
            if (err) {
                return handleError(err, chatId, bot, 'Ошибка открытия почтового ящика');
            }
            console.log('Почтовый ящик открыт.');

            imap.search(['UNSEEN'], (err, results) => {
                if (err) {
                    return handleError(err, chatId, bot, 'Ошибка поиска писем');
                }

                if (!results || results.length === 0) {
                    console.log('Нет новых писем.');
                    bot.sendMessage(chatId, 'Нет новых писем.');
                    imap.end();
                    return;
                }

                const fetch = imap.fetch(results, { bodies: '' });

                fetch.on('message', (msg, seqno) => {
                    console.log(`Обработка письма #${seqno}...`);

                    msg.on('body', (stream) => {
                        simpleParser(stream, (err, parsed) => {
                            if (err) {
                                console.error('Ошибка парсинга письма:', err);
                                return;
                            }
                            emailList += `От: ${parsed.from?.text || 'Неизвестно'}\n` +
                                         `Тема: ${parsed.subject || 'Без темы'}\n` +
                                         `Дата: ${parsed.date ? parsed.date.toLocaleString() : 'Неизвестно'}\n\n`;
                        });
                    });
                });

                fetch.once('end', () => {
                    if (emailList) {
                        console.log('Отправка информации о письмах.');
                        bot.sendMessage(chatId, emailList);
                    } else {
                        console.log('Не удалось получить письма.');
                        bot.sendMessage(chatId, 'Не удалось получить письма.');
                    }
                    imap.end();
                });

                fetch.once('error', (err) => {
                    handleError(err, chatId, bot, 'Ошибка получения писем');
                });
            });
        });
    });

    imap.once('error', (err) => {
        handleError(err, chatId, bot, 'Ошибка подключения к серверу IMAP');
    });

    imap.once('end', () => {
        console.log('Соединение с почтовым сервером закрыто.');
    });

    imap.connect();
}

// Обработчики команд
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    console.log('Команда /start получена от пользователя.');
    bot.sendMessage(chatId, 'Бот запущен! Нажмите кнопку ниже, чтобы проверить письма.', {
        reply_markup: {
            inline_keyboard: [[
                { text: 'Проверить письма', callback_data: 'check_emails' }
            ]]
        }
    });
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    console.log(`Получен callback_query с данными: ${query.data}`);
    if (query.data === 'check_emails') {
        try {
            console.log('Начало проверки писем...');
            await checkAndProcessEmails(chatId);
            bot.answerCallbackQuery(query.id, { text: 'Проверка писем завершена!' });
        } catch (err) {
            handleError(err, chatId, bot, 'Ошибка проверки писем');
        }
    }
});
