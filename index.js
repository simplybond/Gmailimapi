import TelegramBot from 'node-telegram-bot-api';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';

dotenv.config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const emailUser = process.env.YANDEX_USER;
const emailPassword = process.env.YANDEX_APP_PASSWORD;
const imapHost = process.env.IMAP_HOST || 'imap.yandex.ru';
const imapPort = parseInt(process.env.IMAP_PORT, 10) || 993;

if (!botToken || !emailUser || !emailPassword || !imapHost || isNaN(imapPort)) {
    console.error('Ошибка: не заданы необходимые переменные окружения.');
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


async function fetchAndParseEmails(imap, results) {
    return new Promise((resolve, reject) => {
        const fetch = imap.fetch(results, { bodies: '' });
        let emailSummary = '';
        const emailPromises = [];

        fetch.on('message', (msg, seqno) => {
           console.log(`Обрабатываю письмо №${seqno}`);
             const emailPromise = new Promise((resolveMessage) => {
                msg.on('body', (stream) => {
                    simpleParser(stream, (err, parsed) => {
                      if (err) {
                          console.error('Ошибка парсинга письма:', err.message);
                          resolveMessage();
                          return;
                     }

                    console.log(`Письмо от: ${parsed.from?.text}`);
                    console.log(`Тема: ${parsed.subject}`);
                    emailSummary += `От: ${parsed.from?.text || 'Неизвестно'}\n`;
                    emailSummary += `Тема: ${parsed.subject || 'Без темы'}\n`;
                    emailSummary += `Дата: ${parsed.date?.toLocaleString() || 'Неизвестно'}\n\n`;
                     resolveMessage();
                });
              });
          });
        emailPromises.push(emailPromise);
    });

    fetch.on('end', async () => {
        console.log('Все письма обработаны.');
         await Promise.all(emailPromises);
        resolve(emailSummary || 'Писем не найдено.');
    });

    fetch.on('error', (err) => {
       console.error('Ошибка получения писем:', err.message);
        reject(`Ошибка получения писем: ${err.message}`);
    });
});
}

async function checkUnreadEmails(chatId) {
    console.log('Начинаю проверку почты...');
    console.log(`Подключение к IMAP: host=${imapHost}, порт=${imapPort}, пользователь=${emailUser}`);
    
    const imap = new Imap({
        user: emailUser,
        password: emailPassword,
        host: imapHost,
        port: imapPort,
        tls: true,
    });

    return new Promise((resolve, reject) => {
        imap.once('ready', async () => {
           console.log('IMAP соединение успешно установлено.');
          imap.openBox('INBOX', false, async (err, box) => {
                if (err) {
                   console.error('Ошибка открытия почтового ящика:', err.message);
                    reject(`Ошибка открытия почтового ящика: ${err.message}`);
                    imap.end();
                   return;
                }

                console.log(`Почтовый ящик открыт. Найдено писем: ${box.messages.total}`);
                console.log('Ищу непрочитанные письма...');

                imap.search(['UNSEEN'], async (err, results) => {
                  if (err) {
                        console.error('Ошибка поиска писем:', err.message);
                        reject(`Ошибка поиска писем: ${err.message}`);
                        imap.end()
                        return;
                   }

                if (results.length === 0) {
                    console.log('Нет новых писем.');
                    resolve('Нет новых писем.');
                    imap.end();
                    return;
                }

                  console.log(`Найдено ${results.length} непрочитанных писем.`);
                   try{
                        const emailSummary = await fetchAndParseEmails(imap, results);
                        resolve(emailSummary)
                   } catch (fetchError){
                       reject(fetchError)
                   }
                  imap.end();
               });
            });
        });

       imap.once('error', (err) => {
           console.error('Ошибка IMAP-соединения:', err.message);
            reject(`Ошибка IMAP-соединения: ${err.message}`);
       });

       imap.once('end', () => {
          console.log('Соединение IMAP закрыто.');
       });
    
       imap.connect();
    });
}


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`Получена команда /start от пользователя ${chatId}`);
    bot.sendMessage(chatId, 'Привет! Напиши /check, чтобы проверить новые письма.');
});


bot.onText(/\/check/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Получена команда /check от пользователя ${chatId}`);
    bot.sendMessage(chatId, 'Проверяю новые письма...');

    try {
        const emailSummary = await checkUnreadEmails(chatId);
        bot.sendMessage(chatId, emailSummary);
    } catch (err) {
        console.error('Ошибка проверки писем:', err);
        bot.sendMessage(chatId, `Ошибка: ${err}`);
    }
});


bot.on('polling_error', (err) => {
    console.error('Ошибка polling:', err.message);
});
