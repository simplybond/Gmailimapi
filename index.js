
import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

dotenv.config();

// Telegram Bot Token
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(botToken, { polling: true });

// Настройки почтового ящика
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
function handleError(error, chatId, bot, specificError = 'Непредвиденная ошибка') {
    const errorMessage = `Ошибка: ${specificError} - ${error.message}`;
    console.error(errorMessage);
    bot.sendMessage(chatId, `Ошибка: ${errorMessage}`);
}

// Функция для проверки и обработки писем
async function checkAndProcessEmails(chatId) {
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
		
			// формирование ответа для пользователя
            let emailList = "";
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

						emailList += emailInfo + "\n";


                    } catch (parseError) {
                        handleError(parseError, chatId, bot, 'Ошибка парсинга письма');
                    }
                }
            }

            //Отправляем список писем
            bot.sendMessage(chatId, emailList);

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



// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Бот запущен! Нажмите кнопку ниже, чтобы проверить письма.', {
        reply_markup: {
            inline_keyboard: [[
                { text: 'Проверить письма', callback_data: 'check_emails' }
            ]]
        }
    });
});


// Обработчик нажатия кнопки
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;

    if (query.data === 'check_emails') {
        await checkAndProcessEmails(chatId);
        bot.answerCallbackQuery(query.id);
    }
});
