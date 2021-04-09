const common = joi => joi.object({
    url: /^https:\/\/graph\.facebook\.com\/v2\.6\/me\/messages\?access_token=.+/,
    body: joi.object({
        recipient: joi.object({
            id: joi.string().required()
        })
    })
})
    .meta({
        apiDoc: 'https://developers.facebook.com/docs/messenger-platform/reference/send-api#request'
    });

module.exports = joi => joi.alternatives([
    joi.object({
        body: joi.object({
            message: joi.object({
                text: joi.string().required().max(2000)
            })
        })
    })
        .concat(common(joi))
        .meta({
            apiDoc: 'https://developers.facebook.com/docs/messenger-platform/reference/send-api#message'
        })
        .description('Text message'),
    joi.object({
        body: joi.object({
            message: joi.object({
                text: joi.string().required().max(2000),
                quick_replies: joi.array().items(joi.object({
                    content_type: 'text',
                    title: joi.string().max(20),
                    payload: joi.string().max(1000).required(),
                    image_url: joi.string().uri({scheme: ['http', 'https']})
                }))
            })
        })
    })
        .concat(common(joi))
        .meta({
            apiDoc: 'https://developers.facebook.com/docs/messenger-platform/reference/send-api/quick-replies'
        })
        .description('Quick reply'),
    joi.object({
        body: joi.object({
            message: joi.object({
                attachment: joi.object({
                    type: 'template',
                    payload: joi.object({
                        template_type: 'generic',
                        elements: joi.array().items(joi.object({
                            title: joi.string().max(80),
                            image_url: joi.string()
                        }))
                    })
                })
            })
        })
    })
        .concat(common(joi))
        .meta({
            apiDoc: 'https://developers.facebook.com/docs/messenger-platform/reference/template/generic'
        })
        .description('Image message')
])
    .description('Message sent to Facebook Messenger');
