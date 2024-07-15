const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment');
const fs = require('fs');
const cron = require('node-cron');
const path = require('path');
const crypto = require('crypto');
const { TELEGRAM_TOKEN } = require('./telegram-token');

const token = TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const checkIns = {};

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userName = msg.from.username || msg.from.first_name || msg.from.last_name;
  const fullName = `${msg.from.first_name} ${msg.from.last_name}`.replace('undefined','').trim();

  if (msg.text.toLowerCase().startsWith('/checkin')) {
    const currentDate = moment().format('YYYY-MM-DD');
    const displayedCurrentDate = moment().format('DD-MM-YYYY');
    var message = msg.text.replace('/checkin','');
    let currentReport = getCheckInToday();
    console.log(currentReport);
    const existingCheckIn = currentReport.find(user => user.id === userId);
    console.log(existingCheckIn);
    if (!existingCheckIn) {
      bot.sendMessage(chatId, `_Tốt lắm_ *${userName}*, _bạn đã hoàn thành thử thách ngày hôm nay (${displayedCurrentDate})_`, { parse_mode: 'Markdown' });

      checkIn(currentDate, { id: userId, name: userName, fullName, message })


    } else {
      bot.sendMessage(chatId, `*${userName}* _bạn đã hoàn thành chỉ tiêu ngày hôm nay rồi!_`, { parse_mode: 'Markdown' });
    }
  }
});

bot.onText(/\/report/, (msg) => {
  report(msg.chat.id);
});

bot.onText(/\/surpriseme/, (msg) => {
  const chatId = msg.chat.id;
  const sentences = readCongratulationSentences();
  const length = sentences.length;
  const randomNum = generateRandomNumber(0, length - 1);
  bot.sendMessage(chatId, `<span class="tg-spoiler"><i>${sentences[randomNum]}</i></span>`, { parse_mode: 'HTML' });
});

bot.onText(/\/getusers/, (msg) => {

  const chatId = msg.chat.id;
  console.log('getting userid' + chatId);
  getUserIDs(chatId)
    .then((userIds) => {
      console.log('User IDs:', userIds);
      bot.sendMessage(chatId, JSON.stringify(userIds));
    })
    .catch((error) => {
      console.error('Error retrieving user IDs:', error);
    });
});

bot.onText(/\/monthlyreport/, (msg) => {
  const chatId = msg.chat.id;
  console.log('monthlyreport' + chatId);
  const monthlyReport = calAbsenceDays(chatId);
  bot.sendMessage(chatId, monthlyReport, { parse_mode: 'HTML' });
});

function getCheckInToday() {
  const currentDate = moment().format('YYYY-MM-DD');
  const folderPath = path.join(__dirname, 'DATA', moment().format('YYYYMM'));
  const filePath = path.join(folderPath,`${currentDate}_checkins.txt`);
  let report = [];
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    if (data !== '') {
      let _report = data.trim().split('\n');
      report = _report.map(item => {
        const [id, name, fullName, checkin_time, message] = item.split("|");
        return {
          id: parseInt(id),
          name,
          fullName,
          checkin_time,
          message
        };
      });
    }
  } catch (error) {
    console.error(`Error reading file: ${error}`);
  }
  return report;
}

function readCongratulationSentences() {
  const folderPath = path.join(__dirname, 'DATA');
  const filePath = path.join(folderPath,'congratulations.note');
  let sentences = [];
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    if (data !== '') {
      sentences = data.trim().split('\n');
    }
  } catch (error) {
    console.error(`Error reading file: ${error}`);
  }
  return sentences;
}


// Replace 'CHAT_ID' with the actual chat ID of the group or user you want to send the message to
const chatId = '-1001887370826';

// Schedule the message to be sent at midnight (0:00) every day
cron.schedule('59 23 * * *', () => {
  const currentDay = moment().format('DD');
  const totalDays = moment().daysInMonth();
  const message = '*Good midnight! This is an automated message.*';
  bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })
    .then(() => {
      report(chatId);
    })
    .catch((error) => {
      console.error('Error sending message:', error);
    });

  if (currentDay === totalDays) {
    const message = '*This is END OF MONTH REPORT.*';
    const monthlyReport = calAbsenceDays(chatId);
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })
    .then(() => {
      bot.sendMessage(chatId, monthlyReport, { parse_mode: 'HTML' });
    })
    .catch((error) => {
      console.error('Error sending message:', error);
    });
  }
});

function checkIn(currentDate, user) {
  //const folderPath = `DATA/${moment().format('YYYYMM')}`;
  const folderPath = path.join(__dirname, 'DATA', moment().format('YYYYMM'));
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath);
  }
  const currentTime = moment().format('DD/MM/yyyy HH:mm:ss');
  // Write check-in data to file
  const filePath = path.join(folderPath,`${currentDate}_checkins.txt`);
  fs.appendFileSync(filePath, `${user.id}|${user.name}|${user.fullName}|${currentTime}|${user.message}\n`, 'utf8');
  return report;
}

function report(chatId) {
  const displayedCurrentDate = moment().format('DD/MM/YYYY');
  console.log('report:' + chatId);
  let report = getCheckInToday();
  if (report !== '' && report.length > 0) {
    bot.sendMessage(chatId, generateTable(report, displayedCurrentDate), { parse_mode: 'HTML' });
  } else {
    bot.sendMessage(chatId, `*Chưa có điểm danh ngày hôm nay ${displayedCurrentDate}*`, { parse_mode: 'Markdown' });
  }
}

function calAbsenceDays() {

  const currentDate = moment().format('YYYY-MM');
  const yearMonth = moment().format('YYYYMM');
  const currentDay = moment().format('DD');
  const currentMonth = moment().format('MM/YYYY');
  const totalDays = moment().daysInMonth();

  // Initialize absence count for each member
  const availableDays = {};
  const users = {};

  // Read all files in the month's directory
  const folderPath = path.join(__dirname, 'DATA', yearMonth);
  fs.readdirSync(folderPath).forEach((file) => {
    const filePath = path.join(folderPath, file);
    const fileContent = fs.readFileSync(filePath, 'utf8');

    const userHistories = fileContent.trim().split('\n');
    userHistories.forEach((history) => {
      if (history.trim() !== '') {
        let userId = history.split('|')[0];
        if (!availableDays[userId]) {
          availableDays[userId] = 0;
        }
        if (!users[userId])
          users[userId] = history.split('|')[2];
        availableDays[userId]++;
      }
    });
  });

  const absences = Object.keys(availableDays).reduce((acc, userId) => {
    acc[userId] = totalDays - availableDays[userId];
    return acc;
  }, {});

  // Generate monthly report
  var index = 1;
  const monthlyReport = Object.keys(absences).map((userId) => {
    const memberName = users[userId];
    const absenceDays = absences[userId];
    const availableDaysCount = availableDays[userId];
    return `<i><b>${index++}) ${memberName.replace('undefined','').trim()}</b>: Đã tập ${availableDaysCount}/${currentDay} - Vắng: ${currentDay - availableDaysCount}</i>`;
  }).join('\n');
  return `<b><i>Thống kê ngày tập trong tháng ${currentMonth} [ngày ${currentDay}/${totalDays}]:</i></b>\n<pre>${monthlyReport}</pre>`;
}


function getUserIDs(chatId) {
  return new Promise((resolve, reject) => {
    bot.getChatAdministrators(chatId).then((admins) => {
      const userIds = admins.map((admin) => admin.user.id);
      resolve(userIds);
    }).catch((error) => {
      reject(error);
    });
  });
}


function generateTable(data, currentDate) {
  if (data.length === 0) {
    return 'Không có dữ liệu hôm nay';
  }

  // const keys = Object.keys(data[0]);
  // const cellWidths = [];
  // const header = keys.map((key) => {
  //   // const width = key.length;
  //   const width = 25;
  //   cellWidths.push(width);
  //   return `| ${key.padEnd(width)} `;
  // });
  // const divider = cellWidths.map((width) => `| ${'-'.repeat(width)} `);
  // // const header = [];
  // // const divider = [];
  // const rows = data.map((row) => {
  //   return keys
  //     .map((key, index) => {
  //       const value = String(row[key]);
  //       const width = cellWidths[index];
  //       return `${value.padEnd(width, '=').replace('=', ' ')} |`;
  //     })
  //     .join('');
  // });

  // const table = [header.join(''), divider.join('')].concat(rows).join('\n');

  var _no = 0;
  const rows = data.map((_temp) => {
    _no++;
    return `${_no}) ${_temp.fullName} - ${_temp.checkin_time.replace(currentDate, '').trim()}`; 
  })
  const table = rows.join('\n');
  // return `\`\`\`${table}\`\`\``;
  return `<b>Ghi danh trong ngày ${currentDate}:</b>\n<code>${table}</code>`;
  // return `<span class="tg-spoiler" style="color:red">${table}</span>`;
}

function generateRandomNumber(min, max) {
  const range = max - min + 1;
  const randomBytes = crypto.randomBytes(4);
  const randomNumber = Math.floor(
    (randomBytes.readUInt32BE(0) / 0xffffffff) * range
  ) + min;
  return randomNumber;
}