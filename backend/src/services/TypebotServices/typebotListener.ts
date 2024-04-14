import axios from "axios";
import Ticket from "../../models/Ticket";
import QueueIntegrations from "../../models/QueueIntegrations";
import { WASocket, delay, proto } from "@whiskeysockets/baileys";
import { getBodyMessage } from "../WbotServices/wbotMessageListener";
import { logger } from "../../utils/logger";
import { isNil } from "lodash";


type Session = WASocket & {
    id?: number;
};

interface Request {
    wbot: Session;
    msg: proto.IWebMessageInfo;
    ticket: Ticket;
    typebot: QueueIntegrations;
}


const typebotListener = async ({
    wbot,
    msg,
    ticket,
    typebot
}: Request): Promise<void> => {

    if (msg.key.remoteJid === 'status@broadcast') return;

    console.log("31")
    const delay_message = typebot.typebotDelayMessage;
    const { urlN8N: url, typebotExpires } = typebot;

    const number = msg.key.remoteJid.replace(/\D/g, '');

    let body = getBodyMessage(msg);

    async function createSession(msg, typebot, number) {
        try {
            const id = Math.floor(Math.random() * 10000000000).toString();

            const reqData = JSON.stringify({
                "isStreamEnabled": true,
                "message": "string",
                "resultId": "string",
                "isOnlyRegistering": false,
                "prefilledVariables": {
                    "number": number,
                    "pushName": msg.pushName || ""
                },
            });

            const config = {
                method: 'post',
                maxBodyLength: Infinity,
                url: `${url}/api/v1/typebots/${typebot.typebotSlug}/startChat`,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data: reqData
            };

            const request = await axios.request(config);
            console.log(request.data)
            return request.data;

        } catch (err) {
            logger.info("Erro ao criar sessão do typebot: ", err)
            throw err;
        }
    }


    let sessionId
    let dataStart
    let status = false;
    try {
        if (isNil(ticket.typebotSessionId)) {
            console.log("82",typebot)
            dataStart = await createSession(msg, typebot, number);
            sessionId = dataStart.sessionId
            status = true;
            await ticket.update({
                typebotSessionId: sessionId,
                typebotStatus: true,
                useIntegration: true,
                integrationId: typebot.id
            })
        } else {
            sessionId = ticket.typebotSessionId;
            status = ticket.typebotStatus;
        }

        if (!status) return;

        //let body = getConversationMessage(msg);

        if (body !== typebot.typebotKeywordFinish) {
            console.log(body)
            let requestContinue
            let messages
            let input
            if (dataStart?.messages.length === 0 || dataStart === undefined) {
                const reqData = JSON.stringify({
                    "message": body
                });

                let config = {
                    method: 'post',
                    maxBodyLength: Infinity,
                    url: `${url}/api/v1/sessions/${sessionId}/continueChat`,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    data: reqData
                };
                requestContinue = await axios.request(config);
                messages = requestContinue.data?.messages;
                input = requestContinue.data?.input;
            } else {
                messages = dataStart?.messages;
                input = dataStart?.input;
            }

            if (messages?.length === 0) {
                await wbot.sendMessage(`${number}@c.us`, { text: typebot.typebotUnknownMessage });
            } else {
                for (const message of messages) {
                    console.log(JSON.stringify(message))
                    if (message.type === 'text') {
                        let formattedText = '';
                        let linkPreview = false;
                        for (const richText of message.content.richText) {
                            for (const element of richText.children) {
                                let text = '';

                                if (element.text) {
                                    text = element.text;
                                }
                                if (element.type && element.children) {
                                    for (const subelement of element.children) {
                                        let text = '';

                                        if (subelement.text) {
                                            text = subelement.text;
                                        }

                                        if (subelement.type && subelement.children) {
                                            for (const subelement2 of subelement.children) {
                                                let text = '';

                                                if (subelement2.text) {
                                                    text = subelement2.text;
                                                }

                                                if (subelement2.bold) {
                                                    text = `*${text}*`;
                                                }
                                                if (subelement2.italic) {
                                                    text = `_${text}_`;
                                                }
                                                if (subelement2.underline) {
                                                    text = `~${text}~`;
                                                }
                                                if (subelement2.url) {
                                                    const linkText = subelement2.children[0].text;
                                                    text = `[${linkText}](${subelement2.url})`;
                                                    linkPreview = true;
                                                }
                                                formattedText += text;
                                            }
                                        }
                                        if (subelement.bold) {
                                            text = `*${text}*`;
                                        }
                                        if (subelement.italic) {
                                            text = `_${text}_`;
                                        }
                                        if (subelement.underline) {
                                            text = `~${text}~`;
                                        }
                                        if (subelement.url) {
                                            const linkText = subelement.children[0].text;
                                            text = `[${linkText}](${subelement.url})`;
                                            linkPreview = true;
                                        }
                                        formattedText += text;
                                    }
                                }

                                if (element.bold) {
                                    text = `*${text}*`
                                }
                                if (element.italic) {
                                    text = `_${text}_`;
                                }
                                if (element.underline) {
                                    text = `~${text}~`;
                                }

                                if (element.url) {
                                    const linkText = element.children[0].text;
                                    text = `[${linkText}](${element.url})`;
                                    linkPreview = true;
                                }

                                formattedText += text;
                            }
                            formattedText += '\n';
                        }
                        formattedText = formattedText.replace('**', '').replace(/\n$/, '');


                        await wbot.presenceSubscribe(msg.key.remoteJid)
                        //await delay(2000)
                        await wbot.sendPresenceUpdate('composing', msg.key.remoteJid)
                        await delay(delay_message)
                        await wbot.sendPresenceUpdate('paused', msg.key.remoteJid)


                        await wbot.sendMessage(msg.key.remoteJid, { text: formattedText });
                    }


                    if (message.type === 'audio') {
                        await wbot.presenceSubscribe(msg.key.remoteJid)
                        //await delay(2000)
                        await wbot.sendPresenceUpdate('composing', msg.key.remoteJid)
                        await delay(delay_message)
                        await wbot.sendPresenceUpdate('paused', msg.key.remoteJid)
                        const media = {
                            audio: {
                                url: message.content.url,
                                mimetype: 'audio/mp4'
                            },
                        }
                        await wbot.sendMessage(msg.key.remoteJid, media);

                    }

                    if (message.type === 'image' ) {
                        await wbot.presenceSubscribe(msg.key.remoteJid)
                        //await delay(2000)
                        await wbot.sendPresenceUpdate('composing', msg.key.remoteJid)
                        await delay(delay_message)
                        await wbot.sendPresenceUpdate('paused', msg.key.remoteJid)
                        const media = {
                            image: {
                                url: message.content.url,
                            },

                        }
                        await wbot.sendMessage(msg.key.remoteJid, media);
                    }          
                }
                if (input) {
                    if (input.type === 'choice input') {
                        let formattedText = '';
                        const items = input.items;
                        for (const item of items) {
                            formattedText += `▶️ ${item.content}\n`;
                        }
                        formattedText = formattedText.replace(/\n$/, '');
                        await wbot.presenceSubscribe(msg.key.remoteJid)
                        //await delay(2000)
                        await wbot.sendPresenceUpdate('composing', msg.key.remoteJid)
                        await delay(delay_message)
                        await wbot.sendPresenceUpdate('paused', msg.key.remoteJid)
                        await wbot.sendMessage(msg.key.remoteJid, { text: formattedText });
                        
                    }
                }
            }
        }
        if (body === typebot.typebotKeywordFinish) {
            await ticket.update({
                integrationId: null,
                useIntegration: false,
                isBot: true
            })
            await ticket.reload;

            await ticket.update({
                typebotSessionId: null
            })

            await wbot.sendMessage(`${number}@c.us`, { text: 'Atendimento automático reiniciado.' })


        }
    } catch (error) {
        logger.info("Error on typebotListener: ", error);
        await ticket.update({
            typebotSessionId: null
        })
        throw error;
    }
}

export default typebotListener;
