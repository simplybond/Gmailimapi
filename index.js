import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';

// Настройки почтового ящика Yandex
const mailbox = {
    name: "your_yandex_name@yandex.ru",
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
    console.log(`Функция checkUnreadEmails вызвана для chatId: ${chatId}`);
    
    const imap = new Imap({
        user: mailbox.email,
        password: mailbox.password,
        host: mailbox.host,
        port: mailbox.port,
        tls: true,
    });

    imap.once('ready', () => {
        console.log(`Соединение с IMAP для ${mailbox.name} установлено.`);
        
        imap.openBox('INBOX', true, (err, box) => {
            if (err) {
                console.error(`Ошибка при открытии папки INBOX:`, err);
                return handleError(err, chatId);
            }
            console.log(`Папка INBOX успешно открыта.`);

            imap.search(['UNSEEN'], (err, results) => {
                if (err) {
                    console.error(`Ошибка при поиске непрочитанных писем:`, err);
                    return handleError(err, chatId);
                }

                console.log(`Найдено непрочитанных писем: ${results.length}`);

                if (results.length === 0) {
                    bot.sendMessage(chatId, `Нет новых писем в ${mailbox.name}.`);
                    console.log(`Нет новых писем. Завершение работы функции checkUnreadEmails.`);
                    imap.end();
                    return;
                }

                bot.sendMessage(chatId, `${results.length} непрочитанных писем в ${mailbox.name}.`);
                console.log(`Отправлено сообщение о количестве непрочитанных писем.`);

                const f = imap.fetch(results, { bodies: '', struct: true, markSeen: false, uid: true });

                f.on('message', (msg, seqno) => {
                    console.log(`Обработка сообщения с seqno: ${seqno}`);
                    let uid;
                    msg.on('attributes', (attrs) => { 
                        uid = attrs.uid; 
                        console.log(`UID сообщения установлен: ${uid}`);
                    });
                    msg.on('body', (stream) => {
                        console.log(`Парсинг тела сообщения с UID ${uid}...`);
                        simpleParser(stream, (err, mail) => {
                            if (err) {
                                console.error(`Ошибка при парсинге письма с UID ${uid}:`, err);
                                return handleError(err, chatId);
                            }
                            console.log(`Парсинг письма с UID ${uid} завершен.`);

                            const deleteButton = { reply_markup: { inline_keyboard: [[{ text: 'Переместить в корзину 🗑️', callback_data: `delete_${uid}` }]] } };
                            bot.sendMessage(chatId, `${mailbox.emoji} **От:** ${mail.from.text}\n**Тема:** ${mail.subject}\n**Дата:** ${mail.date}`, deleteButton);
                            console.log(`Сообщение отправлено в чат с ID ${chatId}.`);
                        });
                    });
                });

                f.once('error', (err) => {
                    console.error(`Ошибка при получении сообщений:`, err);
                    handleError(err, chatId);
                });
                
                f.once('end', () => {
                    console.log(`Завершено получение сообщений.`);
                    imap.end();
                });
            });
        });
    });

    imap.once('error', (err) => {
      console.error(`Ошибка подключения к IMAP для ${mailbox.name}:`, err);
      handleError(err, chatId);
    });

    console.log(`Попытка подключения к IMAP...`);
    imap.connect();
}

function handleError(err, chatId) {
    console.error(`Ошибка в ${mailbox.name}:`, err);
    bot.sendMessage(chatId, `Ошибка в ${mailbox.name}: ${err.message}`);
}

bot.onText(/\/start/, async (msg) => { 
    console.log(`/start команда получена от chatId: ${msg.chat.id}`);
    await checkUnreadEmails(msg.chat.id); 
});
bot.onText(/\/help/, async (msg) => { 
    await bot.sendMessage(msg.chat.id, 'Доступные команды:\n/start - Проверить непрочитанные письма'); 
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    if (data.startsWith('delete_')) {
        const uid = data.split('_')[1];
        console.log(`Получен UID для удаления: ${uid}`);
        
        const imap = new Imap({ ...mailbox, tls: true });
        
        imap.once('ready', () => {
            console.log(`Попытка открыть папку INBOX...`);
            imap.openBox('INBOX', false, (err) => {
                if (err) {
                    console.error(`Не удалось открыть папку INBOX:`, err);
                    return handleError(err, chatId);
                }
                
                console.log(`Папка INBOX успешно открыта.`);

                // Логируем попытку открытия папки "Удаленные"
                console.log(`Попытка открыть папку "Удаленные"...`);
                imap.openBox('[Удаленные]', false, (err) => {
                    if (err) {
                        console.error(`Не удалось открыть папку "Удаленные":`, err);
                        return handleError(err, chatId);
                    }
                    
                    console.log(`Папка "Удаленные" успешно открыта.`);

                    // Копируем письмо в папку "Удаленные"
                    console.log(`Копирование письма с UID ${uid} в папку "Удаленные"...`);
                    imap.copy(uid, '[Удаленные]', (err) => {
                        if (err) {
                            console.error(`Ошибка при копировании письма с UID ${uid}:`, err);
                            return handleError(err, chatId);
                        }
                        console.log(`Письмо с UID ${uid} успешно скопировано в папку "Удаленные".`);

                        // Помечаем письмо как удаленное
                        console.log(`Пометка письма с UID ${uid} как удаленное...`);
                        imap.store(uid, '+FLAGS', '\\Deleted', (err) => {
                            if (err) {
                                console.error(`Ошибка при пометке письма с UID ${uid} как удаленное:`, err);
                                return handleError(err, chatId);
                            }
                            console.log(`Письмо с UID ${uid} помечено как удаленное.`);

                            // Удаляем помеченные письма
                            console.log(`Удаление помеченных писем...`);
                            imap.expunge((err) => {
                                if (err) {
                                    console.error(`Ошибка при удалении помеченных писем:`, err);
                                    return handleError(err, chatId);
                                }
                                bot.sendMessage(chatId, `Письмо успешно перемещено в корзину в ${mailbox.name}.`);
                                console.log(`Письмо успешно перемещено в корзину.`);
                                imap.end();
                            });
                        });
                    });
                });
            });
        });

        imap.once('error', (err) => {
            console.error(`Ошибка IMAP в callback_query для ${mailbox.name}:`, err);
            handleError(err, chatId);
        });

        console.log(`Попытка подключения к IMAP для удаления письма...`);
        imap.connect();
        await bot.answerCallbackQuery(query.id);
    }
});

console.log('Бот запущен...');




