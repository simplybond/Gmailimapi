//import TelegramBot from 'node-telegram-bot-api';
//import Imap from 'imap';
//import { simpleParser } from 'mailparser';

const mailbox = {
    name: process.env.YANDEX_EMAIL,
    email: process.env.YANDEX_EMAIL,
    password: process.env.YANDEX_PASSWORD,
    host: 'imap.yandex.ru',
    port: 993,
    emoji: '🔴' 
};

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
    console.error('Ошибка: TELEGRAM_BOT_TOKEN не найден.');
    process.exit(1);
}

if (!mailbox.email || !mailbox.password) {
    console.error(`Ошибка: Настройки для ${mailbox.name} не найдены.`);
    process.exit(1);
}

const bot = new TelegramBot(botToken, { polling: true });

async function checkUnreadEmails(chatId) {
    console.log('Начало проверки непрочитанных писем.');

    const imap = new Imap({
        user: mailbox.email,
        password: mailbox.password,
        host: mailbox.host,
        port: mailbox.port,
        tls: true,
    });

    imap.once('ready', () => {
        console.log('IMAP готов к работе.');
        imap.openBox('INBOX', true, (err, box) => {
            if (err) {
                handleError(err, chatId);
                return;
            }
            console.log('Открыта почтовая корзина INBOX.');

            imap.search(['UNSEEN'], (err, results) => {
                if (err) {
                    handleError(err, chatId);
                    return;
                }
                console.log(`Найдено ${results.length} непрочитанных писем.`);

                if (results.length === 0) {
                    bot.sendMessage(chatId, `Нет новых писем в ${mailbox.name}.`);
                    imap.end();
                    return;
                }

                bot.sendMessage(chatId, `${results.length} непрочитанных писем в ${mailbox.name}.`);

                const f = imap.fetch(results, { bodies: '', struct: true, markSeen: false, uid: true });
                f.on('message', (msg, seqno) => {
                    let uid;
                    msg.on('attributes', (attrs) => {
                        uid = attrs.uid;
                        console.log(`Получен UID: ${uid}`);
                    });

                    msg.on('body', (stream) => {
                        console.log('Обработка тела сообщения...');
                        simpleParser(stream, (err, mail) => {
                            if (err) {
                                handleError(err, chatId);
                                return;
                            }
                            console.log('Сообщение успешно распарсено.');

                            // Отправка сообщения без кнопки удаления
                            bot.sendMessage(chatId, `${mailbox.emoji} **От:** ${mail.from.text}\n**Тема:** ${mail.subject}\n**Дата:** ${mail.date}`)
                                .then(() => console.log('Сообщение отправлено в чат.'))
                                .catch((err) => console.error('Ошибка при отправке сообщения:', err));
                        });
                    });
                });

                f.once('error', (err) => {
                    handleError(err, chatId);
                    console.error('Ошибка при получении сообщений:', err);
                });

                f.once('end', () => {
                    console.log('Завершена обработка всех сообщений.');
                    imap.end();
                });
            });
        });
    });

    imap.once('error', (err) => {
        handleError(err, chatId);
        console.error('Ошибка IMAP:', err);
    });

    imap.connect();
}

function handleError(err, chatId) {
    console.error(`Ошибка в ${mailbox.name}:`, err);
    bot.sendMessage(chatId, `Ошибка в ${mailbox.name}: ${err.message}`)
        .catch((sendErr) => console.error('Ошибка при отправке сообщения об ошибке:', sendErr));
}

bot.onText(/\/start/, async (msg) => {
    console.log('Получена команда /start.');
    await checkUnreadEmails(msg.chat.id);
});

bot.onText(/\/help/, async (msg) => {
    console.log('Получена команда /help.');
    await bot.sendMessage(msg.chat.id, 'Доступные команды:\n/start - Проверить непрочитанные письма')
        .catch((err) => console.error('Ошибка при отправке помощи:', err));
});

// Обработчик для отладки всех входящих сообщений
bot.on('message', (msg) => {
    console.log('Получено сообщение:', JSON.stringify(msg, null, 2));
});

console.log('Бот запущен...');
