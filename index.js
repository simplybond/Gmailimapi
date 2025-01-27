import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
    console.error('Ошибка: отсутствует TELEGRAM_BOT_TOKEN');
    process.exit(1);
}

// Создание экземпляра бота с debug и polling
const bot = new TelegramBot(botToken, { polling: true });

bot.getMe()
    .then((botInfo) => {
        console.log(`Бот успешно запущен: ${botInfo.username}`);
    })
    .catch((err) => {
        console.error('Ошибка подключения к Telegram API:', err);
        process.exit(1);
    });

// Глобальный обработчик для всех событий (для отладки)
bot.on('message', (msg) => {
    console.log(`Получено сообщение от ${msg.chat.id}: ${msg.text}`);
    bot.sendMessage(msg.chat.id, `Вы отправили: ${msg.text}`);
});

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    console.log('Команда /start получена');
    bot.sendMessage(chatId, 'Привет! Нажми кнопку ниже:', {
        reply_markup: {
            inline_keyboard: [[{ text: 'Проверить письма', callback_data: 'check_emails' }]],
        },
    });
});

// Обработчик callback_query
bot.on('callback_query', (query) => {
    console.log(`Получен callback_query с данными: ${query.data}`);
    bot.answerCallbackQuery(query.id, { text: 'Кнопка нажата!' })
        .then(() => {
            console.log('Ответ на callback_query отправлен');
        })
        .catch((err) => {
            console.error('Ошибка отправки ответа на callback_query:', err);
        });

    bot.sendMessage(query.message.chat.id, 'Вы нажали кнопку!');
});

// Обработчик ошибок
bot.on('polling_error', (err) => {
    console.error('Ошибка polling:', err.code, err.message);
});

bot.on('webhook_error', (err) => {
    console.error('Ошибка webhook:', err.message);
});

// Дополнительные логирования на случай неожиданных событий
bot.on('error', (err) => {
    console.error('Общая ошибка бота:', err.message);
});

bot.on('callback_query_error', (err) => {
    console.error('Ошибка в обработчике callback_query:', err.message);
});

