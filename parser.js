'use strict';
const path = require('path');
const URL = require('url').URL;
const mime = require('mime-types');
const location = (attachments, text) => attachments
    .filter(location => location.contentType === 'application/x.location' && location.details)
    .map(location => ({
        title: location.title,
        subtitle: location.details.address + '\n📌\n' + text,
        image_url: location.thumbnail,
        buttons: [{
            type: 'web_url',
            url: location.url,
            title: 'open'
        }]
    }));
const image = (attachments, text) => attachments
    .filter(image => typeof image === 'string' || /^image\/(jpeg|png|gif)$/.test(image.contentType))
    .map(image => typeof image === 'string' ? {
        title: text,
        image_url: image
    } : {
        title: text,
        image_url: image.url
    });
const button = attachments => attachments
    .filter(button => typeof button === 'string' || button.contentType === 'application/x.button')
    .map(button => typeof button === 'string' ? {
        content_type: 'text',
        title: button,
        payload: button
    } : {
        content_type: 'text',
        title: button.title || button.value,
        payload: button.value
    });

const type = button => ({
    url: 'web_url',
    reply: 'postback',
    post: 'postback'
}[button.details && button.details.type] || 'web_url');

const richButton = attachments => attachments.slice(0, 3)
    .filter(button => typeof button === 'string' || button.contentType === 'application/x.button')
    .map(button => typeof button === 'string' ? {
        type: 'postback',
        title: button,
        payload: button
    } : {
        type: type(button),
        title: button.title,
        url: button.url,
        payload: button.value
    });

const list = attachments => attachments.slice(0, 4)
    .filter(button => button.contentType === 'application/x.button')
    .map(button => ({
        title: button.title,
        subtitle: button.details && button.details.subtitle,
        image_url: button.thumbnail,
        default_action: button.url && {
            type: 'web_url',
            title: button.title,
            url: button.url
        },
        buttons: button.details && Array.isArray(button.details.actions)
            ? [{
                title: button.details.actions[0].title,
                type: button.details.actions[0].url ? 'web_url' : 'postback',
                payload: button.details.actions[0].value,
                url: button.details.actions[0].url
            }]
            : button.value && [{
                type: 'postback',
                title: button.title,
                payload: button.value
            }]
    }));

module.exports = {
    encode: (msg, {accessToken}) => {
        const uri = '';
        const qs = {access_token: accessToken};
        const method = 'POST';
        const recipient = {id: msg.receiver.conversationId};
        switch (msg && msg.type) {
            case 'text': return {
                uri,
                qs,
                method,
                body: {
                    recipient,
                    message: {
                        text: msg.text
                    }
                }
            };
            case 'location': return {
                uri,
                qs,
                method,
                body: {
                    recipient,
                    message: {
                        attachment: {
                            type: 'template',
                            payload: {
                                template_type: 'generic',
                                elements: location(msg.attachments, msg.text)
                            }
                        }
                    }
                }
            };
            case 'image': return {
                uri,
                qs,
                method,
                body: {
                    recipient,
                    message: {
                        attachment: {
                            type: 'template',
                            payload: {
                                template_type: 'generic',
                                elements: image(msg.attachments, msg.text)
                            }
                        }
                    }
                }
            };
            case 'quick': return {
                uri,
                qs,
                method,
                body: {
                    recipient,
                    message: {
                        text: msg.text,
                        quick_replies: button(msg.attachments)
                    }
                }
            };
            case 'actions': return {
                uri,
                qs,
                method,
                body: {
                    recipient,
                    message: {
                        attachment: {
                            type: 'template',
                            payload: {
                                template_type: 'generic',
                                elements: [{
                                    title: (msg.details && msg.details.title) || msg.text,
                                    subtitle: msg.details && msg.details.title && msg.text,
                                    buttons: richButton(msg.attachments)
                                }]
                            }
                        }
                    }
                }
            };
            case 'list': return {
                uri,
                qs,
                method,
                body: {
                    recipient,
                    message: {
                        attachment: {
                            type: 'template',
                            payload: {
                                template_type: 'list',
                                top_element_style: 'compact',
                                sharable: false,
                                elements: list(msg.attachments, msg.text)
                            }
                        }
                    }
                }
            };
            default: return false;
        }
    },
    decode: (msg, {contextId}) => {
        const message = {
            type: 'text',
            messageId: (msg.message && msg.message.mid) || (msg.timestamp + '-' + (msg.sender && msg.sender.id)),
            timestamp: msg.timestamp,
            request: msg,
            sender: {
                platform: 'messenger',
                contextId
            },
            receiver: {
                id: msg.recipient.id
            }
        };
        if (msg.sender && msg.sender.id) {
            message.sender.id = msg.sender.id;
            if (msg.message && msg.message.text && !msg.message.quick_reply &&
                (typeof msg.delivery !== 'object' && typeof msg.read !== 'object' && (!msg.message || !msg.message.is_echo))) { // Disable delivery and read reports and message echos
                message.text = msg.message.text;
            } else if (msg.postback && msg.postback.payload) {
                message.text = msg.postback.payload;
                // msg.postback = true;
            } else if (msg.message && msg.message.quick_reply && msg.message.quick_reply.payload) {
                message.text = msg.message.quick_reply.payload;
                // msg.postback = true;
            } else if (typeof msg.delivery !== 'object' && typeof msg.read !== 'object' && (!msg.message || !msg.message.is_echo)) { // Disable delivery and read reports and message echos
                message.text = (msg.message && msg.message.text) ? msg.message.text : '';
            }
        } else if (msg.optin && msg.optin.ref && msg.optin.user_ref) {
            message.sender.id = msg.optin.user_ref;
            message.text = '';
        }
        message.sender.conversationId = message.sender.id;

        if (msg.message && msg.message.attachments) {
            message.attachments = msg.message.attachments.map(({type, payload}) => {
                switch (type) {
                    case 'location': return {
                        contentType: 'application/x.location',
                        details: {
                            lat: payload.coordinates.lat,
                            lon: payload.coordinates.long
                        }
                    };
                    case 'image': {
                        const url = new URL(payload.url);
                        return {
                            url: payload.url,
                            contentType: mime.lookup(url.pathname),
                            filename: path.basename(url.pathname)
                        };
                    }
                }
            }).filter(attachment => attachment);
        }

        return message;
    }
};
