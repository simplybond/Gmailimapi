import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

dotenv.config();

// Telegram Bot Token
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

// Настройки почтового ящика (из переменных окружения)
const email = process.env.YANDEX_USER;
const password = process.env.YANDEX_APP_PASSWORD;
const imapHost = process.env.IMAP_HOST || 'imap.mail.yandex.ru';
const imapPort = process.env.IMAP_PORT ? parseInt(process.env.IMAP_PORT, 10) : 993;


// Важная проверка переменных окружения. Обратите внимание на !imapPort
if (!email || !password || !botToken || !imapHost || isNaN(imapPort)) {
    console.error('Ошибка: Отсутствуют необходимые переменные окружения или неверный формат порта.');
    process.exit(1);
}

console.log('Бот запущен...');

// Функция для обработки ошибок
function handleError(error, chatId, bot, specificError = 'Непредвиденная ошибка') {
    const errorMessage = `Ошибка: ${specificError} - ${error.message}`;
    console.error(errorMessage);
    bot.sendMessage(chatId, `Ошибка: ${errorMessage}`);
}



async function checkUnreadEmails(chatId) {
    console.log(`Проверка непрочитанных писем для пользователя ${email}...`);


    const imap = new Imap({ user: email, password: password, host: imapHost, port: imapPort, tls: true });

    try {
        await imap.connect();
        console.log('Подключение к почтовому серверу успешно.');

        try {
            await imap.openBox('INBOX', true);
            console.log('Открытие почтового ящика INBOX успешно.');

            const searchCriteria = ['UNSEEN', 'NOT DELETED'];
            const searchResults = await imap.search(searchCriteria);

            if (searchResults.length === 0) {
                bot.sendMessage(chatId, 'Нет новых писем.');
                return;
            }

            console.log(`Найдено ${searchResults.length} непрочитанных писем.`);
            for (const seqno of searchResults) {
                const fetch = imap.fetch(seqno, { bodies: '', struct: true, uid: true });

                for await (const message of fetch) {
                    try {
                        const attributes = message.attributes;
                        const parsedMail = await new Promise((resolve, reject) => {
                            message.body.pipe(simpleParser({}, (err, mail) => err ? reject(err) : resolve(mail)));
                        });

                        const emailInfo = `
                            **От:** ${parsedMail.from?.address || 'Неизвестно'}
                            **Тема:** ${parsedMail.subject || 'Без темы'}
                            **Дата:** ${parsedMail.date ? parsedMail.date.toLocaleString() : 'Неизвестно'}
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
                        handleError(parseError, chatId, bot, 'Ошибка парсинга письма');
                    }
                }
            }

        } catch (openBoxError) {
            handleError(openBoxError, chatId, bot, 'Ошибка открытия почтового ящика');
            return;
        }


    } catch (connectError) {
        if (connectError.message.includes("Not authenticated")) {
            handleError(connectError, chatId, bot, "Неправильные учетные данные (логин или пароль)");
        } else if (connectError.message.includes('Connection refused')) {
            handleError(connectError, chatId, bot, 'Ошибка подключения к серверу.');
        } else {
            handleError(connectError, chatId, bot, 'Ошибка подключения к почтовому серверу.');
        }
    } finally {
        imap.end();
        console.log('Соединение с почтовым сервером закрыто.');
    }
}



// ... Обработчики /start, /checkEmails, и callback_query (как в предыдущем примере)
// ...


bot.onText(/\/checkEmails/, (msg) => {
    const chatId = msg.chat.id;
    checkUnreadEmails(chatId);
});
