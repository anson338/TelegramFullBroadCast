const config = require('./config');
const moment = require('moment');
const fs = require('fs');

const TelegramBot = require('node-telegram-bot-api');
const Slack = require('node-slack');
const Discord = require('discord.io');
const Twitter = require('twit');

const emoji = require('node-emoji');

const Feed = require('feed')

const env = require('node-env-file');
env(__dirname + '/.env');

if(!process.env.TELEGRAM_TOKEN) {
  console.log('missing TELEGRAM_TOKEN in .env file');
  return null;
}
const telegram_bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {polling: true});

telegram_bot.on('polling_error', (error) => {
  console.log(error);
  console.log('TELEGRAM_TOKEN already connected somewhere else');
  process.exit();
});

const COMMANDS = [
  /\/get_id/,
];

var url_expression = /\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’]))/i;
var url_regex = new RegExp(url_expression);

// helper to fetch group chat id to fill config.js
telegram_bot.onText(/\/get_id/, function getId(msg) {
  // if(msg.chat.firstName != config.owner)
    // return null;
  telegram_bot.sendMessage(msg.chat.id, msg.chat.id);
});

telegram_bot.on('message', (msg) => {

  // if(msg.chat.type != 'private' || msg.chat.username != config.owner)
  //   return null;

  let is_command = false;
  COMMANDS.forEach(command => {
    if(command.test(msg.text)) {
      is_command = true;
    }
  });
  if(is_command)
    return null;

  const chatId = msg.chat.id;

  if(config.exports && config.exports.submit && config.exports.submit.length > 0) {

    config.exports.submit.forEach( output => {
      switch(output.method) {
        case 'json':

          let json_content = {};
          if(fs.existsSync(output.path)) {
            json_content = JSON.parse(fs.readFileSync(output.path, 'utf8'));
          }

          if(!json_content.items)
            json_content.items = [];

          let item = json_content.items.find( item => {
            return item.text == msg.text;
          });

          if(item) {
            item.actions.push({action: 'submitted', timestamp: moment().unix()});
          } else {
            const parsedUrl = url_regex.exec(msg.text);
            let url = null;
            if(parsedUrl && parsedUrl.length > 0)
              url = parsedUrl[0];

            json_content.items.push({
              url: url,
              text: msg.text,
              actions: [{action: 'submitted', timestamp: moment().unix()}]
            });
          }

          fs.writeFileSync(output.path, JSON.stringify(json_content, null, 4));
          break;
        case 'csv':
          const content = moment().unix() + ',submitted,' + msg.text.replace(/(\r\n|\n|\r)/gm, ' ') + '\n';
          fs.appendFileSync(output.path, content);
          break;

        case 'network_json':

          let network = {};
          if(fs.existsSync(output.path)) {
            network = JSON.parse(fs.readFileSync(output.path, 'utf8'));
          }

          if(!network.nodes)
            network.nodes = [];

          let text_node = network.nodes.find(node => node.label == msg.text);

          if(!text_node) {
            text_node = {
              id: network.nodes.length,
              label: msg.text,
              size: 1,
              x: Math.random(),
              y: Math.random(),
              metadata: {
                category: 'action',
                actions: [{type: 'submitted', timestamp: moment().unix()}],
              }
            };
            network.nodes.push(text_node);
          } else {
            text_node.metadata.actions.push({type: 'submitted', timestamp: moment().unix()});
          }

          fs.writeFileSync(output.path, JSON.stringify(network, null, 2));
          break;
      };

    });

  }

  let keyboard = [];
  const keyboard_row_count = Math.max.apply(
    Math,
    config.connectors.map(connector => connector.row)
  );
  for(let i = 0; i <= keyboard_row_count; i++) {
    keyboard.push(config.connectors
                  .filter(connector => connector.row == i)
                  .map(connector => {
                    return {
                      text: emoji.emojify(connector.text),
                      callback_data: connector.callback_data,
                    };
                  })
                 );
  }
    for (var i = config.connectors.length - 1; i >= 0; i--) {
      var connector = config.connectors[i]
      if(msg.chat.id == connector.chat_id){
        continue;
      }
      console.log(msg)
      console.log(`Message Id : ${msg.message_id} , ${connector.chat_id},  ${msg.chat.id}` );
      telegram_bot.forwardMessage(connector.chat_id, msg.chat.id , msg.message_id);
    }

});

call_connector = (connector, text) => {

  switch(connector.broadcast_method) {
    case 'multi':
      connector.connector_actions.forEach( action => {
        const conn = config.connectors.find(conn => {
          return conn.callback_data == action;
        });
        call_connector(conn, text);
      });
      break;
    case 'telegram':
      telegram_bot.sendMessage(connector.chat_id, text);
      break;
  }

};
