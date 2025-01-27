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
        imap.once('ready', () => {
            console.log('IMAP соединение успешно установлено.');
            imap.openBox('INBOX', false, (err, box) => {
                if (err) {
                    console.error('Ошибка открытия почтового ящика:', err.message);
                    reject(`Ошибка открытия почтового ящика: ${err.message}`);
                    return;
                }

                console.log(`Почтовый ящик открыт. Найдено писем: ${box.messages.total}`);
                console.log('Ищу непрочитанные письма...');

                imap.search(['UNSEEN'], (err, results) => {
                    if (err) {
                        console.error('Ошибка поиска писем:', err.message);
                        reject(`Ошибка поиска писем: ${err.message}`);
                        return;
                    }

                    if (results.length === 0) {
                        console.log('Нет новых писем.');
                        resolve('Нет новых писем.');
                        imap.end();
                        return;
                    }

                    console.log(`Найдено ${results.length} непрочитанных писем.`);
                    const fetch = imap.fetch(results, { bodies: '' });
                    let emailSummary = 'Непрочитанные письма:\n\n'; // Обновлено, чтобы сразу начать с заголовка

                    fetch.on('message', (msg, seqno) => {
                        console.log(`Обрабатываю письмо №${seqno}`);
                        msg.on('body', (stream) => {
                            simpleParser(stream, (err, parsed) => {
                                if (err) {
                                    console.error('Ошибка парсинга письма:', err.message);
                                    return;
                                }

                                console.log(`Письмо от: ${parsed.from?.text}`);
                                console.log(`Тема: ${parsed.subject}`);
                                emailSummary += `От: ${parsed.from?.text || 'Неизвестно'}\n`;
                                emailSummary += `Тема: ${parsed.subject || 'Без темы'}\n`;
                                emailSummary += `Дата: ${parsed.date?.toLocaleString() || 'Неизвестно'}\n\n`;
                            });
                        });
                    });

                    fetch.on('end', () => {
                        console.log('Все письма обработаны.');
                        resolve(emailSummary || 'Писем не найдено.');
                        imap.end();
                    });

                    fetch.on('error', (err) => {
                        console.error('Ошибка получения писем:', err.message);
                        reject(`Ошибка получения писем: ${err.message}`);
                    });
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

// Обработчик команды /check
bot.onText(/\/check/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(`Получена команда /check от пользователя ${chatId}`);
    bot.sendMessage(chatId, 'Проверяю новые письма...');

    try {
        const emailSummary = await checkUnreadEmails(chatId);
        console.log(`Отправка результата в Telegram: ${emailSummary}`);
        bot.sendMessage(chatId, emailSummary); // Здесь отправляем результат в Telegram
    } catch (err) {
        console.error('Ошибка проверки писем:', err);
        bot.sendMessage(chatId, `Ошибка: ${err}`);
    }
});


