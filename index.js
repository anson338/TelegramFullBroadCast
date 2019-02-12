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

let ignore = [];
let media = [];


let previous_photoUserID = -1

// in the example above, assign the result
var timeoutHandle;

if (!process.env.TELEGRAM_TOKEN) {
    console.log('missing TELEGRAM_TOKEN in .env file');
    return null;
}
const telegram_bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {
    polling: true
});

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
    if (ignore.includes(parseInt(msg.message_id))) {
        console.log(`ignored ${msg.message_id}`)
        return null;
    }

    console.log(JSON.stringify(msg));

    // if(msg.chat.type != 'private' || msg.chat.username != config.owner)
    //   return null;

    let is_command = false;
    COMMANDS.forEach(command => {
        if (command.test(msg.text)) {
            is_command = true;
        }
    });
    if (is_command)
        return null;

    const chatId = msg.chat.id;

    if (config.exports && config.exports.submit && config.exports.submit.length > 0) {

        config.exports.submit.forEach(output => {
            switch (output.method) {
                case 'json':

                    let json_content = {};
                    if (fs.existsSync(output.path)) {
                        json_content = JSON.parse(fs.readFileSync(output.path, 'utf8'));
                    }

                    if (!json_content.items)
                        json_content.items = [];

                    let item = json_content.items.find(item => {
                        return item.text == msg.text;
                    });

                    if (item) {
                        item.actions.push({
                            action: 'submitted',
                            timestamp: moment().unix()
                        });
                    } else {
                        const parsedUrl = url_regex.exec(msg.text);
                        let url = null;
                        if (parsedUrl && parsedUrl.length > 0)
                            url = parsedUrl[0];

                        json_content.items.push({
                            url: url,
                            text: msg.text,
                            actions: [{
                                action: 'submitted',
                                timestamp: moment().unix()
                            }]
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
                    if (fs.existsSync(output.path)) {
                        network = JSON.parse(fs.readFileSync(output.path, 'utf8'));
                    }

                    if (!network.nodes)
                        network.nodes = [];

                    let text_node = network.nodes.find(node => node.label == msg.text);

                    if (!text_node) {
                        text_node = {
                            id: network.nodes.length,
                            label: msg.text,
                            size: 1,
                            x: Math.random(),
                            y: Math.random(),
                            metadata: {
                                category: 'action',
                                actions: [{
                                    type: 'submitted',
                                    timestamp: moment().unix()
                                }],
                            }
                        };
                        network.nodes.push(text_node);
                    } else {
                        text_node.metadata.actions.push({
                            type: 'submitted',
                            timestamp: moment().unix()
                        });
                    }

                    fs.writeFileSync(output.path, JSON.stringify(network, null, 2));
                    break;
            };

        });

    }
    config.connectors.forEach(function(element) {
        var connector = element;
        // console.log(connector);
        if (msg.chat.id == connector.chat_id) {
            return;
        }
        // console.log(`Message Id : ${msg.message_id} , ${connector.chat_id},  ${msg.chat.id} photos length = ${Object.keys(msg.photo).length}`);

        if (msg.photo != null && Object.keys(msg.photo).length > 1) {

          if (previous_photoUserID == msg.from.id) {
            clearTimeout(timeoutHandle);
          } else {
            clearTimeout(timeoutHandle);
            sendMessageWithAlbum(msg.chat.id);
          }

            // ignore = ignore.concat(getListOfIgnores(msg.message_id, Object.keys(msg.photo).length));
            // console.log(ignore);

            //for (k = 0; k < Object.keys(msg.photo).length; k++) {
                var obj = parseToMediaGroupFormat(msg.photo[0]);
            //    console.log(`${JSON.stringify(k)} \n ${JSON.stringify(obj)}`)
                media.push(obj);
            //}

            // for (let k = 0; p = Promise.reslove(); k < Object.keys(msg.photo).length; k++ ) {
            //   p = p.then(_ => new )
            // }

            // console.log(media);
            // 

            // loopForListAndSendAlbum(msg.photo, connector.chat_id);
            previous_photoUserID = msg.from.id
            timeoutHandle = setTimeout(function(){sendMessageWithAlbum(msg.chat.id)}, 2000);
        } else {
            telegram_bot.forwardMessage(connector.chat_id, msg.chat.id, msg.message_id);
        }
    });

});


function getListOfIgnores(initVar, iter) {
    ignoreLists = [];
    for (i = 0; i < iter - 1; i++) {
        ignoreLists.push(parseInt(initVar) + 1);
    }
    return ignoreLists;
}

// function loopForListAndSendAlbum(photos, chat_id) {
//     m = new Promise(() => {
//            new Promise(() => {
//                  media = [];
//                 // console.log(JSON.stringify(photos))
//                  for (let ag = 0, p = Promise.resolve(); ag < Object.keys(photos).length; ag++ ) {
//                   // console.log(`photos[k] ${photos[k].file_id}`)
//                     p = p.then(_ => new Promise(resolve => {
//                       // media.push(await parseToMediaGroupFormat(photos[ag])
//                       // console.log(photos[k])
//                          media.push({ 'type' : 'photo',
//                                     'media' : photos[ag].file_id
//                           });

//                            if(ag == Object.keys(photos).length - 1) {
//                               // console.log(media);
//                               console.log(`media = ${ JSON.stringify(media)}` );

//                               telegram_bot.sendMediaGroup(chat_id, media);
//                             }

//                         // telegram_bot.getFileLink(photos[ag].file_id).then(function(uri) {
//                         //     console.log(uri)
//                         //     //uri.replace('https', 'http')
//                         //       media.push(   { 'type' : 'photo',
//                         //             'media' : photos[ag].file_id
//                         //           });

//                         //                               //console.log(`ag = ${ag} length = ${Object.keys(photos).length - 1}` )
//                         //     if(ag == Object.keys(photos).length - 1) {
//                         //       // console.log(media);
//                         //       console.log(`media = ${ JSON.stringify(media)}` );

//                         //       telegram_bot.sendMediaGroup(chat_id, media);
//                         //     }
//                         //     resolve()
//                         //   });
//                         resolve()


//                     })
//                   );
//                   // console.log(media);

//               }

//     })

//     //telegram_bot.sendMediaGroup(chat_id, media);
//    });

// }

function parseToMediaGroupFormat(thephoto) {
    // telegram_bot.getFileLink(photo.file_id).then(function(uri) {
    //   console.log(uri)
    //     return   { 'type' : 'photo',
    //           'media' : uri
    //         };
    // });
    return {
        'type': 'photo',
        'media': thephoto.file_id
    };
}


call_connector = (connector, text) => {
    switch (connector.broadcast_method) {
        case 'multi':
            connector.connector_actions.forEach(action => {
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

function sendMessageWithAlbum(id) {
  config.connectors.forEach(function(element) {
    var connector = element;
    if(id == connector.chat_id)
      return;
    telegram_bot.sendMediaGroup(connector.chat_id, media);
  });
   media = [];
}