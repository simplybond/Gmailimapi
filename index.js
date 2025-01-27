import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
    console.error('Ошибка: отсутствует TELEGRAM_BOT_TOKEN');
    process.exit(1);
}

const bot = new TelegramBot(botToken, { polling: true });

bot.getMe()
    .then((botInfo) => {
        console.log(`Бот успешно запущен: ${botInfo.username}`);
    })
    .catch((err) => {
        console.error('Ошибка подключения к Telegram API:', err);
        process.exit(1);
    });

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Привет! Нажми кнопку ниже:', {
        reply_markup: {
            inline_keyboard: [[{ text: 'Проверить письма', callback_data: 'check_emails' }]],
        },
    });
});

// Обработчик callback_query
bot.on('callback_query', (query) => {
    console.log('Получен callback_query:', query);
    bot.answerCallbackQuery(query.id, { text: 'Кнопка нажата!' });
});
