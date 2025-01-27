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

// Функция для обработки ошибок (более информативная)
function handleError(error, chatId, bot, specificError = 'Неизвестная ошибка') {
    const errorMessage = `Ошибка: ${specificError}\nПодробная информация: ${error.message}`;
    console.error(errorMessage);
    bot.sendMessage(chatId, `Ошибка: ${errorMessage}`);
}

async function checkAndProcessEmails(chatId) {
    console.log(`Проверка писем для пользователя ${email}...`);

    const imap = new Imap({ user: email, password: password, host: imapHost, port: imapPort, tls: true });
    let emailList = "";

    try {
        console.log('Подключение к серверу IMAP...');
        await imap.connect();
        console.log('Подключение к серверу IMAP успешно.');

        try {
            console.log('Открытие почтового ящика INBOX...');
            await imap.openBox('INBOX', true);
            console.log('Открытие почтового ящика INBOX успешно.');

            console.log('Поиск непрочитанных писем...');
            const searchCriteria = ['UNSEEN'];
            const searchResults = await imap.search(searchCriteria);

            console.log(`Найдено ${searchResults.length} непрочитанных писем.`);

            if (searchResults.length === 0) {
                console.log('Нет новых писем.');
                return bot.sendMessage(chatId, 'Нет новых писем.');
            }

            for (const seqno of searchResults) {
                console.log(`Обработка письма с номером ${seqno}...`);

                try {
                    const fetch = imap.fetch(seqno, { bodies: ['TEXT'], struct: true, uid: true });
                    for await (const message of fetch) {
                        console.log(`Обработка сообщения ${message.attributes.uid}...`);
                        const parsedMail = await simpleParser(message.parts[0].body);
                        emailList += `
                            **От:** ${parsedMail.from?.address || 'Неизвестно'}\n
                            **Тема:** ${parsedMail.subject || 'Без темы'}\n
                            **Дата:** ${parsedMail.date ? parsedMail.date.toLocaleString() : 'Неизвестно'}\n\n`;
                    }
                } catch (err) {
                    handleError(err, chatId, bot, 'Ошибка при получении/парсинге письма');
                }
            }

            if (emailList) {
                console.log('Отправка информации о письмах...');
                bot.sendMessage(chatId, emailList);
            } else {
                console.log('Не удалось получить письма.');
                bot.sendMessage(chatId, 'Не удалось получить письма.');
            }

        } catch (err) {
            handleError(err, chatId, bot, 'Ошибка открытия почтового ящика');
        }

    } catch (err) {
        if (err.message.includes("Not authenticated")) {
            handleError(err, chatId, bot, "Неправильные учетные данные (логин или пароль)");
        } else if (err.message.includes('Connection refused')) {
            handleError(err, chatId, bot, 'Ошибка подключения к серверу.');
        } else {
            handleError(err, chatId, bot, 'Ошибка подключения к почтовому серверу.');
        }
    } finally {
        imap.end();
        console.log('Соединение с почтовым сервером закрыто.');
    }
}

// Обработчики команд
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    console.log("Команда /start получена от пользователя...");
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
    console.log("Нажата кнопка для проверки писем...");
    if (query.data === 'check_emails') {
        console.log("Проверка писем...");
        await checkAndProcessEmails(chatId);
        bot.answerCallbackQuery(query.id);
    }
});

