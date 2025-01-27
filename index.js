import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';

// Настройки почтовых ящиков
const mailboxes = {
    mailbox1: {
        name: "aristosand@yandex.ru", // Замените на свой email
        email: process.env.YANDEX_EMAIL_1,
        password: process.env.YANDEX_PASSWORD_1,
        emoji: '🔵'  // Синий круг
    },
    mailbox2: {
        name: "your_yandex_email2@yandex.ru", // Замените на свой email
        email: process.env.YANDEX_EMAIL_2,
        password: process.env.YANDEX_PASSWORD_2,
        emoji: '🟢'  // Зеленый круг
    }
};

// Получаем переменные из окружения Railway
const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Проверяем наличие переменных окружения
if (!botToken) {
    console.error('Ошибка: Отсутствует переменная окружения TELEGRAM_BOT_TOKEN. Проверьте настройки.');
    process.exit(1);
}
for (const key in mailboxes) {
    const mailbox = mailboxes[key];
    if (!mailbox.email || !mailbox.password) {
        console.error(`Ошибка: Отсутствуют переменные окружения для почтового ящика ${mailbox.name}. Проверьте настройки.`);
        process.exit(1);
    }
}

const bot = new TelegramBot(botToken, { polling: true });

// Функция для проверки новых писем
async function checkUnreadEmailsYandex(chatId, email, password, mailboxName, mailboxEmoji) {
    const imap = new Imap({
        user: email,
        password: password,
        host: 'imap.yandex.ru',
        port: 993,
        tls: true,
    });

    imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
            if (err) {
                console.error('Ошибка открытия почтового ящика:', err);
                bot.sendMessage(chatId, `Ошибка при открытии почтового ящика ${mailboxName}.`);
                imap.end();
                return;
            }

            imap.search(['UNSEEN'], (err, results) => {
                if (err) {
                    console.error('Ошибка поиска писем:', err);
                    bot.sendMessage(chatId, `Ошибка при поиске писем в ${mailboxName}.`);
                    imap.end();
                    return;
                }

                if (results.length === 0) {
                    bot.sendMessage(chatId, `У вас нет новых писем в ${mailboxName}.`);
                    imap.end();
                    return;
                }

                bot.sendMessage(chatId, `У вас ${results.length} непрочитанных писем в ${mailboxName}.`);

                const f = imap.fetch(results, { bodies: '', struct: true, uid: true });

                f.on('message', (msg, seqno) => {
                    let uid;
                    msg.on('attributes', (attrs) => {
                        uid = attrs.uid; // Получаем UID для удаления
                    });

                    msg.on('body', (stream, info) => {
                        simpleParser(stream, {}, (err, mail) => {
                            if (err) {
                                console.error('Ошибка парсинга письма:', err);
                                return;
                            }

                           const deleteButton = {
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: 'Удалить 🗑️', callback_data: `delete_${mailboxName}_${uid}` }]
                                    ]
                                }
                            };

                            bot.sendMessage(
                                chatId,
                                `${mailboxEmoji} **От:** ${mail.from.text}\n**Тема:** ${mail.subject}\n**Дата:** ${mail.date}`,
                                deleteButton
                            );
                        });
                    });
                });

                f.once('error', (err) => {
                    console.error('Ошибка получения писем:', err);
                    bot.sendMessage(chatId, `Ошибка при получении писем в ${mailboxName}.`);
                    imap.end();
                });

                f.once('end', () => {
                    imap.end();
                });
            });
        });
    });

    imap.once('error', (err) => {
        console.error('Ошибка подключения:', err);
        bot.sendMessage(chatId, `Ошибка подключения к почтовому серверу ${mailboxName}.`);
    });

    imap.connect();
}

// Функция для удаления писем
async function deleteEmail(chatId, email, password, mailboxName, uid) {
    const imap = new Imap({
        user: email,
        password: password,
        host: 'imap.yandex.ru',
        port: 993,
        tls: true,
    });

    imap.once('ready', () => {
        imap.openBox('INBOX', false, (err, box) => {
            if (err) {
                console.error('Ошибка открытия почтового ящика:', err);
                bot.sendMessage(chatId, `Ошибка при открытии почтового ящика ${mailboxName} для удаления письма.`);
                imap.end();
                return;
            }

            imap.addFlags([uid], '\\Deleted', (err) => {
                if (err) {
                    console.error('Ошибка добавления флага удаления:', err);
                    bot.sendMessage(chatId, `Ошибка при удалении письма в ${mailboxName}.`);
                    imap.end();
                    return;
                }

                imap.expunge((err) => {
                    if (err) {
                        console.error('Ошибка очистки почтового ящика:', err);
                        bot.sendMessage(chatId, `Ошибка при удалении письма в ${mailboxName}.`);
                        imap.end();
                        return;
                    }

                    bot.sendMessage(chatId, `Письмо успешно удалено из ${mailboxName}.`);
                    imap.end();
                });
            });
        });
    });

    imap.once('error', (err) => {
        console.error('Ошибка подключения:', err);
        bot.sendMessage(chatId, `Ошибка подключения к почтовому серверу для ${mailboxName}.`);
    });

    imap.connect();
}

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    const mailboxKeyboard = {
        reply_markup: {
            inline_keyboard: Object.keys(mailboxes).map(key => [
                { text: `${mailboxes[key].emoji} ${mailboxes[key].name}`, callback_data: `check_${key}` }
            ])
        }
    };

    await bot.sendMessage(chatId, 'Выберите почтовый ящик для проверки:', mailboxKeyboard);
});

// Обработчик нажатий кнопок
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('check_')) {
        const mailboxKey = data.split('_')[1];
        const selectedMailbox = mailboxes[mailboxKey];
        if (!selectedMailbox) {
            await bot.sendMessage(chatId, 'Ошибка: Неизвестный почтовый ящик.');
            return;
        }
        await checkUnreadEmailsYandex(chatId, selectedMailbox.email, selectedMailbox.password, selectedMailbox.name, selectedMailbox.emoji);
        await bot.answerCallbackQuery(query.id);
    } else if (data.startsWith('delete_')) {
        const [, mailboxName, uid] = data.split('_');
        const selectedMailbox = Object.values(mailboxes).find(mailbox => mailbox.name === mailboxName);
         if (!selectedMailbox) {
            await bot.sendMessage(chatId, 'Ошибка: Неизвестный почтовый ящик.');
            return;
        }
        await deleteEmail(chatId, selectedMailbox.email, selectedMailbox.password, selectedMailbox.name, uid);
        await bot.answerCallbackQuery(query.id);
    }
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, 'Доступные команды:\n/start - Проверить непрочитанные письма');
});

console.log('Бот запущен...');
