import TelegramBot from 'node-telegram-bot-api';
import 'dotenv/config';

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
    console.error('Ошибка: Отсутствует переменная окружения TELEGRAM_BOT_TOKEN. Проверьте настройки.');
    process.exit(1);
}

const bot = new TelegramBot(botToken, { polling: true });

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const keyboard = {
        reply_markup: {
            inline_keyboard: [[{ text: 'Кнопка 1', callback_data: 'button1' }]]
        }
    };

    await bot.sendMessage(chatId, 'Выберите действие:', keyboard);
});

bot.on('callback_query', async (query) => {
    console.log("Callback received", query);
    await bot.answerCallbackQuery(query.id);
});
console.log("Бот запущен")
