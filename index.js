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
let trashFolderName = null; // Переменная для хранения имени папки "Удаленные"


async function checkUnreadEmails(chatId) {
    const imap = new Imap({ ...mailbox, tls: true });

    imap.once('ready', () => {
        console.log('IMAP connection ready');
            if(trashFolderName === null){ // Проверяем, нашли ли мы уже папку "Удаленные"
                imap.getBoxes((err, boxes) => {
                    if (err) handleError(err, chatId);
                      trashFolderName = findTrashFolder(boxes);


                    if (trashFolderName) {
                        console.log(`Папка "Удаленные" на Яндексе: ${trashFolderName}`);
                        openInboxAndProcessMessages(imap, chatId)
                    } else {
                        console.error('Папка "Удаленные" не найдена!');
                        handleError(new Error('Trash folder not found'), chatId);
                      imap.end();
                    }
                });
            } else {
                  openInboxAndProcessMessages(imap, chatId)
            }


    });

    imap.once('error', (err) => handleError(err, chatId));
    imap.connect();
}

function openInboxAndProcessMessages(imap, chatId){
      imap.openBox('INBOX', true, (err, box) => {
                    if (err) handleError(err, chatId);
                    // ... (ваш код для обработки писем) ...
                  imap.search(['UNSEEN'], (err, results) => {
                    if (err) handleError(err, chatId);
                      if (results.length === 0) {
                          bot.sendMessage(chatId, `Нет новых писем в ${mailbox.name}.`);
                          imap.end();
                          return;
                      }

                      bot.sendMessage(chatId, `${results.length} непрочитанных писем в ${mailbox.name}.`);

                      const f = imap.fetch(results, { bodies: '', struct: true, markSeen: false, uid: true });

                      f.on('message', (msg, seqno) => {
                        let uid;
                          msg.on('attributes', (attrs) => { uid = attrs.uid; });
                          msg.on('body', (stream) => {
                              simpleParser(stream, (err, mail) => {
                                 if (err) handleError(err, chatId);
                                  const deleteButton = { reply_markup: { inline_keyboard: [ [{ text: 'Удалить 🗑️', callback_data: `delete_${uid}` }] ] } };
                                  bot.sendMessage(chatId, `${mailbox.emoji} **От:** ${mail.from.text}\n**Тема:** ${mail.subject}\n**Дата:** ${mail.date}`, deleteButton);
                              });
                          });
                      });

                      f.once('error', (err) => handleError(err, chatId));
                        f.once('end', () => imap.end());
                  });
        });
}

function handleError(err, chatId) {
    console.error(`Ошибка в ${mailbox.name}:`, err);
    bot.sendMessage(chatId, `Ошибка в ${mailbox.name}: ${err.message}`);
}

function findTrashFolder(boxes) { /* ...  без изменений ... */ }
function findTrashFolderRecursive(box, path = '') { /* ... без изменений ... */ }


bot.onText(/\/start/, async (msg) => {
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
          const imap = new Imap({ ...mailbox, tls: true });
          imap.once('ready', ()=>{
              imap.openBox('INBOX', false, (err)=>{
                   if (err) handleError(err, chatId);
                  if(trashFolderName){
                        imap.move([uid], trashFolderName, (err) => {
                      if (err) handleError(err, chatId);
                      imap.closeBox(true, (err) => {
                    if (err) handleError(err, chatId);
                        bot.sendMessage(chatId, `Письмо успешно перемещено в папку "${trashFolderName}" из ${mailbox.name}.`);
                      imap.end();
                  });
                    });
                  } else {
                      handleError("trashFolderName is not defined", chatId)
                      imap.end()
                  }

              })
          })
        imap.once('error', (err) => handleError(err, chatId));
          imap.connect();

        await bot.answerCallbackQuery(query.id);
    }
});


console.log('Бот запущен...');

