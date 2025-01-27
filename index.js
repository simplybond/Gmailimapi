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
const imapPort = parseInt(process.env.IMAP_PORT || '993', 10);

// Важная проверка переменных окружения
if (!email || !password || !botToken || !imapHost || !imapPort) {
  console.error('Ошибка: Отсутствуют необходимые переменные окружения.');
  process.exit(1);
}

console.log('Бот запущен...');


async function checkUnreadEmails(chatId) {
    const imap = new Imap({ user: email, password: password, host: imapHost, port: imapPort, tls: true });

  try {
      await imap.connect();
      try {
          await imap.openBox('INBOX', true);
      } catch (openBoxError) {
          handleError(openBoxError, chatId, bot, 'Ошибка открытия почтового ящика');
          return;
      }


      const searchCriteria = ['UNSEEN', 'NOT DELETED'];  // Используем оба условия
      const searchResults = await imap.search(searchCriteria);

      if (searchResults.length === 0) {
          bot.sendMessage(chatId, 'Нет новых писем.');
          return;
      }

      bot.sendMessage(chatId, `Найдено ${searchResults.length} непрочитанных писем.`);

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
  } catch (connectError) {
    handleError(connectError, chatId, bot, 'Ошибка подключения к почтовому серверу');
  } finally {
      imap.end();
  }
}




function handleError(error, chatId, bot, msgText = 'Непредвиденная ошибка') {
    console.error('Ошибка:', error);
    bot.sendMessage(chatId, `Ошибка: ${msgText}`);
}




bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Бот запущен!');
});


bot.onText(/\/checkEmails/, (msg) => {
    const chatId = msg.chat.id;
    checkUnreadEmails(chatId);
});



bot.on('callback_query', async (query) => {
    try {
        const chatId = query.message.chat.id;
        const data = query.data;
        if (data.startsWith('delete_')) {
            const uid = data.split('_')[1];
            const imap = new Imap({ user: email, password: password, host: imapHost, port: imapPort, tls: true });

            await imap.connect();
            await imap.openBox('INBOX', true);
            await imap.addFlags(uid, '\\Deleted');
            await imap.expunge();
            imap.end();


            bot.answerCallbackQuery(query.id);
            bot.sendMessage(chatId, `Письмо удалено.`);
        }
    } catch (error) {
        handleError(error, chatId, bot, 'Ошибка при удалении письма');
    }
});

