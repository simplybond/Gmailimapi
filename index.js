

import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

// Загрузка переменных из .env
dotenv.config();

// Настройки почтового ящика Yandex
const yandexMailbox = {
    name: "Yandex",
    email: process.env.YANDEX_EMAIL,
    password: process.env.YANDEX_APP_PASSWORD, // Используйте App Password!
    emoji: '✉️'
};

// Получаем токен бота из переменных окружения
const botToken = process.env.TELEGRAM_BOT_TOKEN;

// Проверяем наличие переменных окружения
if (!botToken || !yandexMailbox.email || !yandexMailbox.password) {
    console.error('Ошибка: Отсутствуют необходимые переменные окружения. Проверьте файл .env.');
    process.exit(1);
}

const bot = new TelegramBot(botToken, { polling: true });

// Функция для проверки новых писем в Yandex
async function checkUnreadEmailsYandex(chatId) {
  const imap = new Imap({
        user: yandexMailbox.email,
        password: yandexMailbox.password,
        host: 'imap.yandex.ru',
        port: 993,
        tls: true,
    });


    imap.once('ready',  () => {
      imap.openBox('INBOX', false, (err, box) => {
            if (err) throw err;
              imap.search([ 'UNSEEN' ], (err, results) => {
                    if (err) throw err;
                  if (results.length === 0) {
                      bot.sendMessage(chatId, `${yandexMailbox.emoji} У вас нет новых писем в ${yandexMailbox.name}.`);
                        imap.end();
                      return;
                  }

                    const f = imap.fetch(results, { bodies: '', struct: true, markSeen: false, uid: true });
                      f.on('message',  (msg, seqno) => {

                        let uid;
                          msg.on('attributes', (attrs) => { uid = attrs.uid; });
                        msg.on('body', (stream, info) => {

                          simpleParser(stream, {}, (err, mail) => {
                                if (err)  console.error('Ошибка парсинга письма:', err) ;

                              const deleteButton = {
                                    reply_markup: {
                                          inline_keyboard: [
                                            [{ text: 'Удалить 🗑️', callback_data: `delete_${uid}` }]
                                          ]
                                      }
                                  };

                              bot.sendMessage(
                                      chatId,
                                `${yandexMailbox.emoji} **От:** ${mail.from?.text}\n**Тема:** ${mail.subject}\n**Дата:** ${mail.date}`,
                                deleteButton
                                  );

                              });
                         });
                    });
                  f.once('error', (err) => {
                      console.error('Fetch error:',err)
                    bot.sendMessage(chatId, `Ошибка: ${err}`);
                  })
                  f.once('end', () => { imap.end(); });
                });
           });
        });

    imap.once('error', (err) => {
       console.error('Ошибка подключения:', err);
      bot.sendMessage(chatId, `Ошибка подключения к почтовому серверу ${yandexMailbox.name}.`);
    });

    imap.connect();
}


async function deleteEmailYandex(chatId, uid) {

const imap = new Imap({
        user: yandexMailbox.email,
        password: yandexMailbox.password,
        host: 'imap.yandex.ru',
        port: 993,
        tls: true,
    });
    imap.once('ready', () => {
         imap.openBox('INBOX', false, (err) => {
        if (err) throw err;
          imap.addFlags(uid, ['\\Deleted'], (err) => {
            if(err) throw err;
             imap.expunge((err) => {
                    if (err) throw err;
                      bot.sendMessage(chatId, `Письмо успешно удалено из ${yandexMailbox.name}.`);
                    imap.end()
                  });
                });
        });
    });

    imap.once('error',  (err) => {
        console.error('Ошибка подключения:', err);
        bot.sendMessage(chatId,  `Ошибка подключения к почтовому серверу ${yandexMailbox.name}.`);
    });
    imap.connect()
}


// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    await checkUnreadEmailsYandex(chatId);
});


// Обработчик нажатий кнопок
bot.on('callback_query', async (query) => {

    const chatId = query.message.chat.id;
    const data = query.data;

     if (data.startsWith('delete_')) {
        const uid = data.split('_')[1];
         await deleteEmailYandex(chatId, uid);
        await bot.answerCallbackQuery(query.id);
    }
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, 'Доступные команды:\n/start - Проверить непрочитанные письма');
});


console.log('Бот запущен...');

