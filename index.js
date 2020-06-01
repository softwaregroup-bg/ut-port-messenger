const parser = require('./parser');
const crypto = require('crypto');

const sendMessage = async(msg, {auth}) => {
    return msg && Array.isArray(msg) ? msg.map(entity => parser.encode(entity, auth)) : parser.encode(msg, auth);
};

module.exports = function messenger({registerErrors, utMethod}) {
    return class messenger extends require('ut-port-webhook')(...arguments) {
        get defaults() {
            return {
                path: '/messenger/{appId}',
                hook: 'messengerIn',
                namespace: 'messenger',
                server: {
                    port: 8082
                },
                request: {
                    baseUrl: 'https://graph.facebook.com/v2.6/me/messages'
                }
            };
        }

        handlers() {
            const {namespace, hook} = this.config;
            return {
                start: async() => {
                    this.httpServer.route({
                        method: 'GET',
                        path: this.config.path,
                        options: {
                            auth: false,
                            handler: async({params = {}, query = {}}, h) => {
                                const mode = query['hub.mode'];
                                const challenge = query['hub.challenge'];
                                const verifyToken = query['hub.verify_token'];
                                if (mode && verifyToken) {
                                    if (mode === 'subscribe') {
                                        try {
                                            const bot = await utMethod('bot.bot.fetch#[0]')({
                                                appId: params.appId,
                                                platform: 'messenger'
                                            });
                                            if (bot.verifyToken === verifyToken) {
                                                return h.response(challenge).code(200);
                                            }
                                        } catch (e) { /* 403 will be thrown */ }
                                    }
                                    return h.response().code(403);
                                }
                                return h.response().code(404);
                            }
                        }
                    });
                },
                [`${hook}.identity.request.receive`]: ({entry} = [{}], {headers, params}) => {
                    if (typeof headers['x-hub-signature'] !== 'string') {
                        throw this.errors['webhook.missingHeader']({params: {header: 'x-hub-signature'}});
                    }
                    if (headers['x-hub-signature'].split('=').length !== 2) {
                        throw this.errors['webhook.malformedHeader']({params: {header: 'x-hub-signature'}});
                    }
                    // there is no way how there can be entries from different page ID's in the same request
                    return {
                        appId: params.appId,
                        clientId: entry[0].id,
                        platform: 'messenger'
                    };
                },
                [`${hook}.identity.response.send`]: (msg, {headers, payload}) => {
                    const [algorithm, signature] = headers['x-hub-signature'].split('=');
                    const serverSignature = crypto
                        .createHmac(algorithm, msg.secret)
                        .update(payload, 'utf8')
                        .digest();
                    if (crypto.timingSafeEqual(Buffer.from(signature, 'hex'), serverSignature)) {
                        return msg;
                    }
                    throw this.errors['webhook.integrityValidationFailed']();
                },
                [`${hook}.message.request.receive`]: (msg, {auth}) => {
                    const messages = msg.entry.reduce((all, entry) => {
                        return all.concat(entry.messaging.map(m => parser.decode(m, auth)));
                    }, []);
                    return messages.length === 1 ? messages[0] : messages;
                },
                [`${namespace}.message.send.request.send`]: sendMessage,
                [`${hook}.message.response.send`]: sendMessage
            };
        }
    };
};
