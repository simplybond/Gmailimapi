import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import 'dotenv/config';

// Настройки почтовых ящиков
const mailboxes = {
    mailbox1: {
        name: "your_yandex_email1@yandex.ru", // Замените на свой email
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
console.log('Bot Token:', botToken);


for (const key in mailboxes) {
    const mailbox = mailboxes[key];
    if (!mailbox.email || !mailbox.password) {
        console.error(`Ошибка: Отсутствуют переменные окружения для почтового ящика ${mailbox.name}. Проверьте настройки.`);
        process.exit(1);
    }
    console.log(`Mailbox ${key}:`, mailbox);
}

const bot = new TelegramBot(botToken, { polling: true });
console.log('Telegram bot initialized.');

// Функция для проверки новых писем
async function checkUnreadEmailsYandex(chatId, email, password, mailboxName, mailboxEmoji) {
    console.log(`checkUnreadEmailsYandex called for: ${mailboxName}, chatId: ${chatId}`);
    const imap = new Imap({
        user: email,
        password: password,
        host: 'imap.yandex.ru',
        port: 993,
        tls: true,
    });

    imap.once('ready', () => {
        console.log(`IMAP connection ready for: ${mailboxName}`);
        imap.openBox('INBOX', true, (err, box) => {
            if (err) {
                console.error('Ошибка открытия почтового ящика:', err);
                bot.sendMessage(chatId, `Ошибка при открытии почтового ящика ${mailboxName}.`);
                imap.end();
                return;
            }
            console.log(`Mailbox INBOX opened for: ${mailboxName}`);

            imap.search(['UNSEEN'], (err, results) => {
                if (err) {
                     console.error('Ошибка поиска писем:', err);
                    bot.sendMessage(chatId, `Ошибка при поиске писем в ${mailboxName}.`);
                    imap.end();
                    return;
                }
                console.log(`Search results for unread emails in ${mailboxName}:`, results);

                if (results.length === 0) {
                    bot.sendMessage(chatId, `У вас нет новых писем в ${mailboxName}.`);
                    imap.end();
                    return;
                }

                bot.sendMessage(chatId, `У вас ${results.length} непрочитанных писем в ${mailboxName}.`);

                const f = imap.fetch(results, { bodies: '', struct: true, uid: true });

                f.on('message', (msg, seqno) => {
                  console.log(`Message received, seqno: ${seqno}, from ${mailboxName}`);
                    let uid;
                    msg.on('attributes', (attrs) => {
                        uid = attrs.uid; // Получаем UID для удаления
                         console.log(`Message attributes received for seqno: ${seqno}, uid: ${uid}, from ${mailboxName}`);
                    });

                    msg.on('body', (stream, info) => {
                       console.log(`Message body received for seqno: ${seqno}, from ${mailboxName}`);
                        simpleParser(stream, {}, (err, mail) => {
                            if (err) {
                                 console.error('Ошибка парсинга письма:', err);
                                return;
                            }
                             console.log(`Email parsed for seqno: ${seqno}, from: ${mail.from.text}, subject: ${mail.subject}, from ${mailboxName}`);
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
                            console.log(`Message sent to chat with delete button for seqno: ${seqno}, uid: ${uid}, from: ${mail.from.text}, subject: ${mail.subject}, from ${mailboxName}`);

                        });
                    });
                });

                f.once('error', (err) => {
                    console.error('Ошибка получения писем:', err);
                     bot.sendMessage(chatId, `Ошибка при получении писем в ${mailboxName}.`);
                    imap.end();
                });
                console.log(`Fetch event 'error' listener attached for: ${mailboxName}`);

                f.once('end', () => {
                   console.log(`Fetch event 'end' listener triggered for: ${mailboxName}`);
                   imap.end();
                });
                console.log(`Fetch event 'end' listener attached for: ${mailboxName}`);

            });
        });
    });

    imap.once('error', (err) => {
         console.error('Ошибка подключения:', err);
          bot.sendMessage(chatId, `Ошибка подключения к почтовому серверу ${mailboxName}.`);
    });
    console.log(`IMAP 'error' listener attached for: ${mailboxName}`);
    
    imap.connect();
    console.log(`IMAP connection initiated for: ${mailboxName}`);
}

// Функция для удаления писем
async function deleteEmail(chatId, email, password, mailboxName, uid) {
     console.log(`deleteEmail called for: ${mailboxName}, uid: ${uid}, chatId: ${chatId}`);
    const imap = new Imap({
        user: email,
        password: password,
        host: 'imap.yandex.ru',
        port: 993,
        tls: true,
    });

    imap.once('ready', () => {
       console.log(`IMAP connection ready for delete: ${mailboxName}`);
        imap.openBox('INBOX', false, (err, box) => {
            if (err) {
                console.error('Ошибка открытия почтового ящика:', err);
                 bot.sendMessage(chatId, `Ошибка при открытии почтового ящика ${mailboxName} для удаления письма.`);
                imap.end();
                return;
            }
              console.log(`Mailbox INBOX opened for delete: ${mailboxName}`);

            imap.addFlags([uid], '\\Deleted', (err) => {
                if (err) {
                      console.error('Ошибка добавления флага удаления:', err);
                       bot.sendMessage(chatId, `Ошибка при удалении письма в ${mailboxName}.`);
                    imap.end();
                    return;
                }
                 console.log(`Flag deleted added for uid: ${uid}, in ${mailboxName}`);
                imap.expunge((err) => {
                    if (err) {
                         console.error('Ошибка очистки почтового ящика:', err);
                        bot.sendMessage(chatId, `Ошибка при удалении письма в ${mailboxName}.`);
                        imap.end();
                        return;
                    }
                      console.log(`Message expunged (deleted) successfully for uid: ${uid}, in ${mailboxName}`);
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
       console.log(`IMAP 'error' listener attached for delete: ${mailboxName}`);
    imap.connect();
   console.log(`IMAP connection initiated for delete: ${mailboxName}`);
}

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
     console.log(`Command /start received, chatId: ${msg.chat.id}`);
    const chatId = msg.chat.id;

    const mailboxKeyboard = {
        reply_markup: {
            inline_keyboard: Object.keys(mailboxes).map(key => [
                { text: `${mailboxes[key].emoji} ${mailboxes[key].name}`, callback_data: `check_${key}` }
            ])
        }
    };

    await bot.sendMessage(chatId, 'Выберите почтовый ящик для проверки:', mailboxKeyboard);
    console.log(`Message sent with keyboard to chat id: ${chatId}`);
});

// Обработчик нажатий кнопок
bot.on('callback_query', async (query) => {
     console.log('Callback query received:', query);
    const chatId = query.message.chat.id;
    const data = query.data;
    console.log('Data:', data);


    if (data.startsWith('check_')) {
        const mailboxKey = data.split('_')[1];
        console.log('mailboxKey:', mailboxKey);
        const selectedMailbox = mailboxes[mailboxKey];
        console.log('selectedMailbox:', selectedMailbox);
        if (!selectedMailbox) {
            await bot.sendMessage(chatId, 'Ошибка: Неизвестный почтовый ящик.');
             console.log(`Error: Unknown mailbox, chatId: ${chatId}`);
            return;
        }
        await checkUnreadEmailsYandex(chatId, selectedMailbox.email, selectedMailbox.password, selectedMailbox.name, selectedMailbox.emoji);
        await bot.answerCallbackQuery(query.id);
        console.log(`Callback answered with id: ${query.id}`);
    } else if (data.startsWith('delete_')) {
        const [, mailboxName, uid] = data.split('_');
        console.log('delete_mailboxName:', mailboxName, 'uid:', uid);
        const selectedMailbox = Object.values(mailboxes).find(mailbox => mailbox.name === mailboxName);
         if (!selectedMailbox) {
             await bot.sendMessage(chatId, 'Ошибка: Неизвестный почтовый ящик.');
             console.log(`Error: Unknown mailbox for delete, chatId: ${chatId}`);
            return;
        }
         await deleteEmail(chatId, selectedMailbox.email, selectedMailbox.password, selectedMailbox.name, uid);
         await bot.answerCallbackQuery(query.id);
         console.log(`Callback answered with id: ${query.id}`);
    }
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
     console.log(`Command /help received, chatId: ${msg.chat.id}`);
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, 'Доступные команды:\n/start - Проверить непрочитанные письма');
    console.log(`Help message sent to chat id: ${chatId}`);
});

console.log('Бот запущен...');
